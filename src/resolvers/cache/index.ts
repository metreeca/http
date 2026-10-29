/*
 * Copyright © 2026 Metreeca srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * HTTP response caching middleware.
 *
 * Replays the response held for a safe `http` or `https` exchange while the origin server allows it to be reused, and
 * revalidates it against the origin server once that allowance is up, so that content is transferred again only when
 * what is held is known to be outdated.
 *
 * Responsibility is limited to replay and revalidation: reuse is governed by the header fields a response states, and a
 * response stating no expiration is reused for a share of the interval its content had gone unchanged, or, where it
 * reports no change time either, for as long as the consumer is willing to assume.
 *
 * Unsafe exchanges are relayed as they are; once one succeeds, the entries for its target and for whatever else the
 * response reports as changed are given up, so that a client that both reads and writes never serves what it has just
 * replaced.
 *
 * Exchanges targeting any other scheme are relayed untouched and never stored, as freshness is defined for HTTP
 * responses alone.
 *
 * Freshness and validation rest on what a response states, that is `Cache-Control` `no-store`, `no-cache`, `max-age`,
 * `must-revalidate` and `proxy-revalidate`, `Expires`, `Vary` and the `ETag` and `Last-Modified` validators. Freshness
 * is never inferred from the content: a response stating none is reused under the volatility its `Last-Modified`
 * reports, or, where it reports none, under the freshness the consumer assumes in its place. Directives a request
 * states, `no-cache` and `only-if-cached` among them, are not honoured; a directive granting a shared cache a freedom a
 * private one doesn't have, such as `s-maxage`, plays no part, as each client holds a store of its own, while one
 * asking for revalidation is honoured whoever it addresses.
 *
 * Complete responses are the only ones replayed: an exchange stating a `Range` and a partial response are relayed and
 * never stored, and `GET` and `HEAD` are held apart, so a stored `HEAD` never answers a `GET`. A response setting a
 * cookie is never stored either, unless the consumer forces its target. Concurrent exchanges for one target are relayed
 * on their own, and a failed exchange is reported as it stands rather than answered from a stale entry.
 *
 * Targets the consumer selects with glob patterns are avoided or forced. An avoided target is never cached, whatever
 * the origin server allows. A forced target is held whatever the origin server states against it, so that a source
 * forbidding caching on every response is downloaded again only once the assumed freshness is up.
 *
 * Entries are held in memory unless a backing store is supplied, so caching is available with no setup and moved to
 * the file system or to a shared service once a process-local cache is no longer enough: a {@link Store} holds entries
 * whole, while a `Bucket` holds their content as opaque bytes, as a cloud object storage service does.
 *
 * > [!WARNING]
 * >
 * > Entries are held as a private cache, a response to an authenticated request among them, so a store is to serve
 * > one user alone: a backing service several users reach replays to each of them whatever the first was answered.
 * > A target that is never to be held is kept out with the `avoid` option, whatever the origin server states about it.
 *
 * **Usage**
 *
 * ```typescript
 * import { createFetch } from "@metreeca/http";
 * import { cache } from "@metreeca/http/cache";
 *
 * const client = createFetch(cache());
 * ```
 *
 * @module
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111 RFC 9111 - HTTP Caching}
 */

import { type Some, some } from "@metreeca/core/arrays";
import type { Bucket } from "@metreeca/core/bucket";
import { getHeaders, getMethod, getTarget } from "../../index.core.js";
import { type Fetch, type Middleware, NotModified } from "../../index.js";
import {
	age,
	capture,
	conditional,
	createStore,
	type Entry,
	lifetime,
	refresh,
	replay,
	resource,
	matching,
	safe,
	stale,
	storable,
	type Store,
	variant
} from "./index.core.js";

export type { Entry, Store } from "./index.core.js";


/**
 * Creates a caching middleware.
 *
 * The generated middleware replays the response it holds for a `GET` or `HEAD` exchange while that response is fresh.
 * Freshness is the one the origin server states or, where it states none, the one its `Last-Modified` implies or the
 * `ttl` option assumes. A response no longer fresh is revalidated with its stored validators, and its held content is
 * replayed again when the origin server answers `304`. Where nothing usable is held, the exchange is relayed to the
 * wrapped {@link index!Fetch Fetch} implementation and the response is kept for later exchanges. A successful mutating
 * request invalidates the entries for its target, so a client that reads and writes never serves what it overwrote.
 *
 * A response answered from the store restates the exchange as it was retrieved, its URL, status and reason phrase
 * included, so that a client reading it draws the same conclusions it draws from a freshly retrieved one. The age is
 * the one departure: an `Age` header field states how long the content has been held since the origin server delivered
 * it, so that whoever receives it judges for itself how much of its freshness is left. A successful revalidation
 * restarts the age from what the `304` states, as the delivery it confirms supersedes the one the entry was reporting.
 *
 * Invalidation gives up every variant held for a target and extends to the URIs named by the `Location` and
 * `Content-Location` header fields of the response, when they share the origin of the target, so that a server reports
 * what else a mutating request has changed. No other entry is given up: a target and its query string variants are
 * distinct resources, and nothing states that one goes stale when another is written.
 *
 * Exchanges targeting a scheme other than `http` and `https` and exchanges stating a `Range` are relayed untouched
 * and never stored, as are partial responses and, outside the targets the `force` option selects, responses setting a
 * cookie, so that a complete response answering a complete request is the only thing ever replayed.
 *
 * A target the `avoid` option selects is relayed untouched and never stored, so that a resource the consumer holds
 * back stays out of the cache whatever the origin server states about it. Invalidation is unaffected: a successful
 * unsafe exchange for an avoided target still gives up the entries the response reports as changed.
 *
 * A target the `force` option selects is cached as though the origin server stated no caching directives, so that a
 * source forbidding caching on every response is reused under the freshness the consumer assumes. A forced response is
 * stored even where it sets a cookie or states `no-store`. Its `Cache-Control` directives and `Expires` field play no
 * part in its freshness, which follows its `Last-Modified` or, failing that, `ttl`. The cookie it sets reaches the
 * client on the original exchange alone and is never stored, so that no session outlives the exchange that opened it.
 *
 * Forcing settles whether and for how long a response is reused, not which requests it answers or what its status
 * means. Unsuccessful, partial and unpredictably varying responses are still never stored, variants are still told
 * apart by `Vary`, and a freshness is still assumed for the heuristically cacheable status codes alone. A target both
 * options select is avoided, as keeping a resource out of the cache outweighs reusing it.
 *
 * With no positive `ttl`, a forced response reporting no usable `Last-Modified` is revalidated on every exchange. A
 * forced source reporting neither a change time nor a validator is then downloaded again each time, so `force` pays off
 * for it only alongside a positive `ttl`, which bounds how long its content is reused.
 *
 * Every numeric option is removed by a value less than or equal to `0`, as the defaults do: entries are then retained
 * for the life of the middleware and reuse rests on what the origin server reports alone.
 *
 * The `ttl` option states a single freshness budget, that is how long a response is worth reusing: the origin server
 * overrides it by stating less, and it governs where the response reports nothing to derive a freshness from, so that a
 * response carrying no expiration is reused rather than revalidated on every exchange. Freshness is assumed only for
 * the status codes RFC 9110 § 15.1 defines as heuristically cacheable, and only where no `Cache-Control` `no-cache`,
 * `max-age`, `must-revalidate` or `proxy-revalidate` directive and no `Expires` header field is stated: a stated
 * expiration keeps winning, however short it is, except for the targets the `force` option selects.
 *
 * A response stating no expiration but reporting when its content last changed is reused for a tenth of the interval it
 * had gone unchanged, so that a resource edited a minute ago is revalidated sooner than one untouched for a year;
 * `ttl` caps that share as it caps a stated expiration, and supplies the freshness where no usable `Last-Modified` is
 * reported.
 *
 * @param options The caching options, all optional: with none given, exchanges are cached in memory under the
 *     freshness the origin server reports
 * @param options.store The {@link Store} or `Bucket` to hold entries in, or the number of entries the default memory
 *     store is to retain, giving up the least recently used beyond that
 * @param options.ttl The freshness to assume where a response reports neither an expiration nor a change time and the
 *     cap on any freshness derived from what it does report, in milliseconds, measured from the instant the origin
 *     server generated the content rather than from the instant it was received
 * @param options.avoid The glob patterns selecting the targets to be kept out of the cache, one or several, matched
 *     whole against the target URI: `*` and `?` stand for a run of characters and for a single character within a
 *     path segment, `**` for a run of characters across separators; with none given, every eligible target is cached
 * @param options.force The glob patterns selecting the targets to be cached whatever caching directives the origin
 *     server states, one or several, matched as `avoid` patterns are; with none given, every target is cached under
 *     the directives the origin server states; a target the `avoid` option also selects is kept out of the cache
 *
 * @returns A {@link Middleware} replaying eligible exchanges from the store
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111 RFC 9111 - HTTP Caching}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111#section-4.4 RFC 9111 § 4.4 - Invalidating Stored Responses}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111#section-5.1 RFC 9111 § 5.1 - Age}
 */
export function cache({

	store = 0,

	ttl = 0,

	avoid,
	force

}: {

	readonly store?: number | Bucket | Store;

	readonly ttl?: number;

	readonly avoid?: Some<string>;
	readonly force?: Some<string>;

} = {}): Middleware {

	const backing = createStore(store);

	const avoided = matching(some(avoid));
	const forcing = matching(some(force));

	return fetch => async (input, init) => {

		const method = getMethod(input, init);
		const target = getTarget(input);
		const headers = getHeaders(input, init);

		if ( target.protocol !== "http:" && target.protocol !== "https:" ) {

			return fetch(input, init);

		} else if ( !safe(method) ) {

			const response = await fetch(input, init);

			await invalidate(stale(response, target));

			return response;

		} else if ( headers.has("range") || avoided(target.href) ) {

			// no entry answers a range, and a target the consumer holds back is neither answered nor stored

			return fetch(input, init);

		} else {

			// safe methods carry no content, so the request is replayed freely under the validators of a stale entry

			const request = new Request(input, init);

			return answer(fetch, request, headers, resource(target.href, method), forcing(target.href));

		}

	};


	async function answer(
		fetch: Fetch, request: Request, headers: Headers, key: string, forced: boolean
	): Promise<Response> {

		// a varying response answers one variant alone, so the target holds its header fields as the pointer the
		// variant is looked up through and the content is held under the variant it answers

		const held = await backing.lookup(key);

		const vary = held?.headers["vary"] ?? "";
		const slot = vary === "" || vary === "*" ? key : variant(key, vary, headers);

		const entry = vary === "" ? held
			: vary === "*" ? undefined
				: await backing.lookup(slot);

		if ( entry !== undefined && age(entry) < lifetime(entry, ttl, forced) ) {

			return replay(entry);

		} else {

			const requested = Date.now();
			const response = await fetch(conditional(request, entry));
			const received = Date.now();

			if ( entry !== undefined && response.status === NotModified ) {

				const refreshed = seal(refresh(entry, requested, received, response), forced);

				await backing.insert(slot, refreshed);

				return replay(refreshed);

			} else if ( storable(response, forced) ) {

				await hold(key, held, headers, seal(await capture(response, requested, received), forced));

				return response;

			} else {

				return response;

			}

		}


		async function hold(key: string, held: undefined | Entry, headers: Headers, entry: Entry): Promise<void> {

			const vary = entry.headers["vary"] ?? "";

			if ( vary === "" ) {

				await backing.insert(key, entry);

			} else {

				// the target lists the keys its variants are held under, as a store takes opaque keys and reports no
				// way of enumerating them, so that an unsafe exchange gives up every variant of the resource

				const slot = variant(key, vary, headers);

				await Promise.all([
					backing.insert(key, {
						...entry,
						body: new Uint8Array(),
						variants: [ ...new Set([ ...held?.variants ?? [], slot ]) ]
					}),
					backing.insert(slot, entry)
				]);

			}

		}

		function seal(entry: Entry, forced: boolean): Entry {

			// a cookie belongs to the exchange that set it alone, so a forced entry is held without it

			return forced ? { ...entry, headers: { ...entry.headers, "set-cookie": undefined } } : entry;

		}

	}

	async function invalidate(keys: readonly string[]): Promise<void> {

		await Promise.all(keys.map(async key => {

			const held = await backing.lookup(key);

			await Promise.all([ ...held?.variants ?? [], key ].map(slot => backing.remove(slot)));

		}));

	}

}
