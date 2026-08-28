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
 * Exchange reporting middleware.
 *
 * Reports every exchange a client performs, as it is submitted and as it is answered, so that what the client is
 * doing is observable without the call sites taking care of it.
 *
 * Exchanges are relayed untouched, whatever is reported, so that the middleware is inserted anywhere in a chain, and
 * taken out again, without changing what the chain does.
 *
 * **Usage**
 *
 * ```typescript
 * import { createFetch } from "@metreeca/http";
 * import { monitor } from "@metreeca/http/monitor";
 *
 * const client = createFetch(monitor(console));
 * ```
 *
 * @module
 */

import { isString } from "@metreeca/core";
import { clip } from "@metreeca/core/strings";
import { getMethod, getTarget } from "../index.core.js";
import type { Fetch, Middleware } from "../index.js";


/**
 * The maximum number of characters a resource URL is reported with.
 *
 * Longer URLs are clipped before they reach the log, so that an entry stays on a single line while retaining the
 * leading part that tells the resource apart.
 */
const URLClipLimit = 80;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates an exchange monitoring middleware.
 *
 * Wraps a {@link Fetch} implementation, reporting every exchange as it is performed and leaving requests and
 * responses otherwise untouched.
 *
 * Every entry opens with the method and the target URL of the exchange, the method reported in uppercase and the URL
 * clipped so that entries stay uniform and on a single line, and states the outcome once the response is in:
 *
 * - **Request states a malformed URL** (only a raw string may): reported to `logger.warn` and answered with a network
 *   error {@link https://developer.mozilla.org/docs/Web/API/Response/error `Response`}, without being sent
 * - **Request is sent**: reported to `logger.info`
 * - **Response is not `ok`** (non-2xx `status`): its `status` and `statusText` are reported to `logger.warn`
 * - **Response is `ok`** (2xx `status`) and served from a cache: its `status` is reported to `logger.info`, alongside a
 *   note stating the content came from a cache, as told by the `Age` field only a cache states
 * - **Response is `ok`** (2xx `status`) and served by the origin: nothing further is reported, leaving a plain
 *   exchange to the single entry stating it was performed
 *
 * Requests are inspected as they are stated, rather than normalised into
 * {@link https://developer.mozilla.org/docs/Web/API/Request `Request`} objects, so that a body carried by the request
 * reaches the layers below untouched.
 *
 * Exchanges are reported as the caller states them, so the middleware is best declared first in a chain: a malformed
 * URL is screened out before it reaches a layer that would reject it outright, at the cost of reporting a request as
 * it was stated rather than as the layers below leave it.
 *
 * @param logger The logger exchanges are reported to, for instance the platform `console`
 * @param logger.info Takes an entry reporting a request as it is sent or a response served from a cache
 * @param logger.warn Takes an entry reporting a request stating a malformed URL or an unsuccessful response
 *
 * @returns A {@link Middleware} reporting every exchange it relays to `logger`, answering a request stating a
 *     malformed URL with a network error without sending it
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111#section-5.1 RFC 9111 § 5.1 - Age}
 */
export function monitor(logger: {

	readonly info: (message: string) => unknown;
	readonly warn: (message: string) => unknown;

}): Middleware {

	// entries are reported as method calls, so that a logger supplied as a whole keeps its binding

	return fetch => async (input, init) => {

		const method = getMethod(input, init);

		if ( isString(input) && !URL.canParse(input) ) { // only a raw string may be malformed

			logger.warn(`${method} ${clip(input, URLClipLimit)} >> malformed resource URL`);

			return Response.error();

		} else { // the target is parsed only once it is known to be well-formed, as parsing rejects whatever isn't

			const target = clip(getTarget(input).href, URLClipLimit);

			logger.info(`${method} ${target}`);

			const response = await fetch(input, init);

			if ( !response.ok ) {

				logger.warn(`${method} ${target} >> ${response.status} ${response.statusText}`);

			} else if ( hit(response) ) {

				logger.info(`${method} ${target} >> ${response.status} Retrieved From Cache`);

			}

			return response;

		}

	};


	/**
	 * Checks if a response was served from a cache.
	 *
	 * A response counts as served from a cache when it states an `Age`, as only a cache states one: the origin server
	 * delivers content that has yet to age, so a stated age reports content a cache has been holding, whether the
	 * caching layer below or one the exchange travelled through.
	 *
	 * @param response The response answered by the layers below
	 *
	 * @returns true if `response` was served from a cache; false otherwise
	 *
	 * @see {@link https://www.rfc-editor.org/rfc/rfc9111#section-5.1 RFC 9111 § 5.1 - Age}
	 */
	function hit(response: Response): boolean {

		return response.headers.has("age");

	}

}
