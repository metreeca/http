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
 * Contracts and internals of the response caching middleware.
 *
 * @module
 */

import { isFunction } from "@metreeca/core";
import type { Bucket } from "@metreeca/core/bucket";
import { parseDuration, parseInstant, parseList, parseParameter } from "../../index.core.js";
import { BadRequest, PartialContent } from "../../index.js";
import { createBucketStore } from "./bucket.js";
import { createMemoryStore } from "./memory.js";


/**
 * The methods an exchange is answered from the store for.
 */
export const Safe: readonly string[] = [ "GET", "HEAD" ];

/**
 * The wildcards a glob pattern states, alongside the characters a regular expression reads as operators.
 */
const GlobPattern = /\*\*|[*?]|[.+^${}()|[\]\\]/g;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Backing store for cached responses.
 *
 * Holds the responses a {@link cache} middleware is to answer from, so that entries live wherever the consumer needs
 * them, whether in memory, on the file system or in a shared key-value service. A store keeps a private cache, so the
 * entries it holds are to serve one user alone, however widely the service backing it is reached. Keys are opaque
 * strings, computed by the middleware from the target URI of the request and from the header fields the response
 * states as varying. The fragment plays no part, as it never reaches the origin server, so requests differing by
 * fragment alone share one entry and invalidate it together.
 *
 * > [!NOTE]
 * >
 * > Retention is the store's own concern. Beyond the default memory store, which gives up the least recently used
 * > entries once its limit is reached, no implementation is provided: how many entries a store holds, and which it
 * > gives up first, are the consumer's to decide.
 */
export interface Store {

	/**
	 * Retrieves an entry.
	 *
	 * @param key The key of the entry to be retrieved
	 *
	 * @returns A promise resolving to the entry stored under `key`, or to `undefined` if the store holds none
	 */
	lookup(key: string): Promise<undefined | Entry>;

	/**
	 * Inserts an entry.
	 *
	 * @param key The key the entry is to be stored under
	 * @param entry The entry to be stored
	 *
	 * @returns A promise resolving when `entry` is stored
	 */
	insert(key: string, entry: Entry): Promise<void>;

	/**
	 * Removes an entry.
	 *
	 * States an outcome rather than a change: removing a key the store doesn't hold succeeds without doing anything,
	 * so a caller is free to remove a key without first checking for it.
	 *
	 * @param key The key of the entry to be removed
	 *
	 * @returns A promise resolving when no entry is stored under `key`
	 */
	remove(key: string): Promise<void>;

}

/**
 * Cached response.
 *
 * Carries all the state required to serve a response again. An entry is self-contained and replayable, so a
 * {@link Store} hands out the same one as many times as it is asked for, and is free to serialise it and keep it
 * beyond the life of the process.
 */
export interface Entry {

	/**
	 * The time the request was sent, as milliseconds since the epoch.
	 *
	 * Taken as the instant a stored response starts ageing, so that its age accounts for the time it spent in transit.
	 */
	readonly requested: number;

	/**
	 * The time the response was received, as milliseconds since the epoch.
	 *
	 * Taken as the instant the freshness of a stored response is measured from where the origin server states no
	 * generation time of its own, rather than the moment the response was handed to a store.
	 */
	readonly received: number;

	/**
	 * The status code of the stored response.
	 */
	readonly status: number;

	/**
	 * The header fields of the stored response, keyed by lowercase field name.
	 *
	 * A field the response doesn't state is reported as `undefined`, so that a name is read without first checking
	 * that it is stated.
	 *
	 * The `age` field reports what the exchange that last delivered or confirmed the content stated, so that an entry
	 * refreshed by a revalidation ages from that exchange rather than from the original delivery.
	 */
	readonly headers: { readonly [name: string]: undefined | string };

	/**
	 * The content of the stored response.
	 */
	readonly body: Uint8Array<ArrayBuffer>;

	/**
	 * The cache keys the variants of the stored response are held under.
	 *
	 * Stated on the entry a resource is looked up through, where the origin server answers it with varying responses,
	 * so that giving up the resource gives up every variant held for it. A store is to report it as it was stored,
	 * like every other field of an entry.
	 */
	readonly variants?: readonly string[];

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates the store the `store` option asks for.
 *
 * Falls back to an unbounded memory store for anything a store or a bucket is not recognised in, so that an option
 * reaching the middleware from untyped code leaves caching working rather than failing on the first exchange.
 *
 * @param store The {@link Store} or `Bucket` to hold entries in, or the number of entries a memory store is to retain
 *
 * @returns A {@link Store} holding entries as `store` asks for
 */
export function createStore(store: number | Bucket | Store): Store {

	return isStore(store) ? store
		: isBucket(store) ? createBucketStore(store)
			: createMemoryStore(store);

	// duck-typed rather than validated with `isObject()`, which would reject a class instance

	function isStore(value: unknown): value is Store {
		return typeof value === "object" && value !== null
			&& "lookup" in value && isFunction(value.lookup)
			&& "insert" in value && isFunction(value.insert)
			&& "remove" in value && isFunction(value.remove);
	}

	function isBucket(value: unknown): value is Bucket {
		return typeof value === "object" && value !== null
			&& "get" in value && isFunction(value.get)
			&& "put" in value && isFunction(value.put)
			&& "delete" in value && isFunction(value.delete);
	}

}

/**
 * Compiles a test for the targets a set of glob patterns selects.
 *
 * A pattern selects a target whole rather than a prefix of it: `*` and `?` stand for a run of characters and for a
 * single character within a path segment, `**` for a run of characters across separators, and everything else is
 * taken literally, the characters a regular expression reads as operators included.
 *
 * @param patterns The glob patterns selecting the targets
 *
 * @returns A test reporting true for a target any of `patterns` selects; false otherwise, as for every target when
 *     `patterns` is empty
 */
export function skipping(patterns: readonly string[]): (target: string) => boolean {

	const skipped = patterns.map(glob);

	return target => skipped.some(pattern => pattern.test(target));


	/**
	 * Compiles a glob pattern into a test on a whole value.
	 */
	function glob(pattern: string): RegExp {

		return new RegExp(`^${pattern.replace(GlobPattern, token =>
			token === "**" ? ".*"
				: token === "*" ? "[^/]*"
					: token === "?" ? "[^/]"
						: `\\${token}`
		)}$`, "su");

	}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Computes the cache key of a resource, under the method the exchange uses.
 *
 * The fragment plays no part, as it never reaches the origin server.
 *
 * @param url The target URI of the exchange
 * @param method The uppercase method of the exchange
 *
 * @returns The cache key the resource `url` identifies is held under for `method`
 */
export function resource(url: string, method: string): string {

	return `${method}\n${url.replace(/#.*/, "")}`;

}

/**
 * Computes the cache key of the variant an exchange selects among the header fields a response states as varying.
 *
 * @param resource The cache key of the resource the exchange addresses
 * @param vary The header field names a response states as varying
 * @param headers The header fields the exchange states
 *
 * @returns The cache key the variant `headers` selects under `vary` is held under
 */
export function variant(resource: string, vary: string, headers: Headers): string {

	return [ resource, ...parseList(vary)
		.map(name => name.toLowerCase())
		.sort()
		.map(name => `${name}=${headers.get(name) ?? ""}`)
	].join("\n");

}

/**
 * Makes a request conditional on the validators of a stale entry.
 *
 * @param request The request of the exchange to be relayed
 * @param entry The stale entry to be revalidated, if one is held
 *
 * @returns A copy of `request` stating the validators `entry` carries, or `request` as it stands where no entry is
 *     given or it carries no validator to revalidate it with
 */
export function conditional(request: Request, entry?: Entry): Request {

	const conditions=Object.entries({

		"If-None-Match": entry?.headers["etag"],
		"If-Modified-Since": entry?.headers["last-modified"]

	}).flatMap(([ name, value ]): [ string, string ][] => value === undefined ? [] : [ [ name, value ] ]);

	return conditions.length === 0 ? request : new Request(request, {
		headers: [ ...request.headers, ...conditions ]
	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks if a response may be held for replay.
 *
 * @param response The response to be held
 *
 * @returns true if `response` is complete and the origin server allows it to be reused; false otherwise
 */
export function storable(response: Response): boolean {

	return response.ok // an unsuccessful response states nothing to replay
		&& response.status !== PartialContent // a partial response holds part of the content alone
		&& !response.headers.has("set-cookie") // a cookie is set for the exchange that retrieved it alone
		&& !parseList(response.headers.get("cache-control")).some(directive =>
			parseParameter(directive)[0] === "no-store" // a response the origin server holds back
		)
		&& response.headers.get("vary") !== "*"; // an unpredictably varying response is never answered by an entry

}

/**
 * Lists the cache keys a completed unsafe exchange reports as changed.
 *
 * Covers the target of the exchange and the same-origin URIs named by the `Location` and `Content-Location` header
 * fields of the response, under every method an exchange is answered from the store for, so that a server reports what
 * else an unsafe exchange has changed. Nothing is reported unless the exchange succeeded.
 *
 * @param response The response the exchange was answered with
 * @param target The target of the exchange
 *
 * @returns The cache keys the entries `response` reports as changed are held under, empty if the exchange failed
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111#section-4.4 RFC 9111 § 4.4 - Invalidating Stored Responses}
 */
export function stale(response: Response, target: URL): readonly string[] {

	const targets=response.status >= BadRequest ? [] : [ target, ...[ "Location", "Content-Location" ]
		.map(name => response.headers.get(name))
		.filter(value => value !== null)
		.map(value => new URL(value, target))
		.filter(url => url.origin === target.origin)
	];

	return targets.flatMap(url => Safe.map(method => resource(url.href, method)));

}

/**
 * Captures a response as a replayable entry.
 *
 * Takes a copy of the content, leaving the response itself unread, so that it is reported to the client as it stands.
 *
 * @param response The response to be captured
 * @param requested The time the request was sent, as milliseconds since the epoch
 * @param received The time the response was received, as milliseconds since the epoch
 *
 * @returns A promise resolving to an entry replaying `response`
 */
export async function capture(response: Response, requested: number, received: number): Promise<Entry> {

	return {
		requested,
		received,
		status: response.status,
		headers: Object.fromEntries(response.headers),
		body: new Uint8Array(await response.clone().arrayBuffer())
	};

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Computes the current age of an entry.
 *
 * Accounts for the age the origin server states and for the round trip that retrieved the response, as the response
 * was already ageing while in transit.
 *
 * @param entry The entry to be measured
 *
 * @returns The time elapsed since the origin server delivered the content of `entry`, in milliseconds
 */
export function age({ requested, headers }: Entry): number {

	// the round trip and the time the response has been held collapse into the interval since the request was sent

	return (parseDuration(headers["age"]) ?? 0)+(Date.now()-requested);

}

/**
 * Computes the freshness lifetime of an entry.
 *
 * @param entry The entry to be measured
 * @param ttl The cap on the computed lifetime, in milliseconds, removed by a value less than or equal to `0`
 *
 * @returns The time `entry` stays usable from the instant the origin server generated its content, in milliseconds,
 *     capped by `ttl`
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111#section-4.2.1 RFC 9111 § 4.2.1 - Calculating Freshness Lifetime}
 */
export function lifetime({ received, headers }: Entry, ttl: number): number {

	const control=new Map(parseList(headers["cache-control"]).map(parseParameter));

	// `Expires` states an instant, so its lifetime is measured from the instant the response was generated, as the
	// origin server states it, falling back to the instant it was received where it states none

	const stated=control.has("no-cache") ? 0
		: control.has("max-age") ? parseDuration(control.get("max-age")) ?? 0
			: Math.max(0, (parseInstant(headers["expires"]) ?? 0)-(parseInstant(headers["date"]) ?? received));

	return ttl > 0 ? Math.min(stated, ttl) : stated;

}

/**
 * Replays a stored response, opening a fresh body on every call.
 *
 * States the current age of the entry, superseding the value the origin server stated when it was retrieved, so that a
 * client tells a replayed response apart from a freshly retrieved one.
 *
 * @param entry The entry to be replayed
 *
 * @returns A response serving the content of `entry` and stating its current age
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111#section-5.1 RFC 9111 § 5.1 - Age}
 */
export function replay(entry: Entry): Response {

	const { status, headers, body }=entry;

	return new Response(body.length === 0 ? null : body, {

		status,

		headers: [

			// unstated fields are dropped, as a header list takes stated values alone, and the age restated
			// below is left out, as a list appends to a field rather than replacing it

			...Object.entries(headers).flatMap(([ name, value ]): [ string, string ][] =>
				value === undefined || name === "age" ? [] : [ [ name, value ] ]
			),

			[ "age", `${Math.ceil(age(entry)/1000)}` ]

		]

	});

}

/**
 * Refreshes a stale entry from the response confirming it.
 *
 * A revalidation supersedes the delivery the stored age reported, so the refreshed entry ages from what the `304`
 * states, that is from nothing unless it states an age of its own.
 *
 * @param entry The stale entry the revalidation confirmed
 * @param requested The time the conditional request was sent, as milliseconds since the epoch
 * @param received The time the confirming response was received, as milliseconds since the epoch
 * @param response The response confirming `entry`
 *
 * @returns A copy of `entry` ageing from the exchange that confirmed it and carrying the header fields `response`
 *     restates
 */
export function refresh(entry: Entry, requested: number, received: number, response: Response): Entry {

	return {
		...entry,
		requested,
		received,
		headers: { ...entry.headers, age: "0", ...Object.fromEntries(response.headers) }
	};

}
