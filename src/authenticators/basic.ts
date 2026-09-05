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
 * `Basic` authentication middleware.
 *
 * Attaches static `Basic` credentials to every request routed through the wrapped {@link Fetch} implementation.
 *
 * **Usage**
 *
 * ```typescript
 * import { createFetch } from "@metreeca/http";
 * import { basic } from "@metreeca/http/basic";
 *
 * const client = createFetch(basic("user", "secret"));
 * ```
 *
 * @module
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc7617 RFC 7617 - The 'Basic' HTTP Authentication Scheme}
 */

import { encodeBase64 } from "@metreeca/core/base64";
import type { Fetch, Middleware } from "../index.js";


/**
 * Creates a middleware authenticating requests with the `Basic` scheme.
 *
 * Decorates a {@link Fetch} implementation with one adding an `Authorization` header carrying the given credentials to
 * every request, alongside the headers supplied by the caller; credentials already carried by the request are replaced,
 * so the middleware is best applied to a client dedicated to a single origin.
 *
 * Requests are normalised as {@link https://developer.mozilla.org/docs/Web/API/Request `Request`} objects before the
 * header is attached, preserving the headers and the options carried by a `Request` input alongside the overrides
 * supplied through `init`.
 *
 * Credentials are joined as `usr:pwd`, normalised to Unicode NFC, and encoded as UTF-8 base64 once when the middleware
 * is created, leaving nothing to compute on the request path.
 *
 * > [!WARNING]
 * > Base64 is not encryption: `Basic` credentials travel in a form any observer of the exchange may decode.
 * > Confine them to `https` exchanges, as RFC 7617 § 4 requires.
 *
 * @param usr The user id to authenticate as; must contain no colon, which delimits the two credentials
 * @param pwd The password to authenticate with
 *
 * @returns A {@link Middleware} wrapping a {@link Fetch} implementation with one authenticating every request as `usr`
 *
 * @throws {@link !RangeError RangeError} If `usr` contains a colon
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc7617 RFC 7617 - The 'Basic' HTTP Authentication Scheme}
 */
export function basic(usr: string, pwd: string): Middleware {

	if ( usr.includes(":") ) {
		throw new RangeError(`unexpected colon in user id <${usr}>`);
	}

	const authorization = `Basic ${encodeBase64(`${usr}:${pwd}`.normalize("NFC"))}`;

	return fetch => async (input, init) => {

		const request = new Request(input, init);

		request.headers.set("Authorization", authorization);

		return fetch(request);

	};

}
