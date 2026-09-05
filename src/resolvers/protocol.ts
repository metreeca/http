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
 * Custom protocol handler middleware.
 *
 * Serves a URI scheme the platform doesn't resolve through a custom handler, leaving every other exchange to the
 * standard `fetch` function.
 *
 * Content held on a filesystem, in an archive or in any other local store is then addressed by URI like a remote
 * resource and retrieved through a single client, rather than through a store-specific API call sites have to branch
 * to. The middlewares layered over that client apply to local and remote exchanges alike.
 *
 * **Usage**
 *
 * ```typescript
 * import { createFetch } from "@metreeca/http";
 * import { protocol } from "@metreeca/http/protocol";
 *
 * const client = createFetch(
 *   protocol("file", files),  // handler serving file:
 *   protocol("zip", archives) // handler serving zip:
 * );
 *
 * await client("file:///var/data/hosts"); // served by the handler
 * await client("https://example.com/");   // served by the platform
 * ```
 *
 * @module
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc3986#section-3.1 RFC 3986 § 3.1 - Scheme}
 */

import type { Fetch, Middleware } from "../index.js";


/**
 * Matches a well-formed URI scheme, that is a lowercase name opening with a letter and stated with no trailing colon.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc3986#section-3.1 RFC 3986 § 3.1 - Scheme}
 */
const SchemePattern = /^[a-z][a-z\d+.-]*$/;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a protocol dispatching middleware.
 *
 * The generated middleware serves through `handler` every exchange targeting a URL with the given `scheme` and relays
 * every other exchange to the wrapped fetch implementation. The schemes the platform already resolves keep flowing to
 * it untouched, while the ones it doesn't, `file` or `zip` among them, are supplied by a handler, without call sites
 * having to know which is which.
 *
 * Layers are stacked to serve several schemes from a single client; where two of them state the same scheme, the
 * outermost one serves it.
 *
 * Handlers are {@link Fetch} implementations, so they report their outcome as a
 * {@link https://developer.mozilla.org/docs/Web/API/Response `Response`}, streaming the body as it is asked for and
 * reporting failures as an unsuccessful status rather than as a thrown error: status handling stays with the consumer,
 * whether a resource was retrieved from the network or from a local store.
 *
 * Exchanges reach their handler exactly as they were submitted, never normalised as a `Request` object, so that a
 * request carrying a body is passed on undisturbed.
 *
 * @param scheme The URI scheme to be served, stated in lowercase and with no trailing colon; the scheme of a target
 *     URL is matched against it disregarding case
 * @param handler The {@link Fetch} implementation serving `scheme`
 *
 * @returns A {@link Middleware} wrapping a {@link Fetch} implementation with one serving through `handler` every
 *     exchange targeting a URL with `scheme`
 *
 * @throws {@link !RangeError RangeError} If `scheme` is not a well-formed lowercase URI scheme
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc3986#section-3.1 RFC 3986 § 3.1 - Scheme}
 */
export function protocol(scheme: string, handler: Fetch): Middleware {

	if ( !SchemePattern.test(scheme) ) {
		throw new RangeError(`malformed scheme <${scheme}>`);
	}

	return fetcher => (input, init) => {

		const url = input instanceof Request ? input.url : input.toString();
		const target = url.slice(0, Math.max(0, url.indexOf(":"))).toLowerCase();

		return target === scheme
			? handler(input, init)
			: fetcher(input, init);

	};

}
