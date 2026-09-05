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
 * `Bearer` authentication middleware.
 *
 * Attaches a static or dynamically supplied `Bearer` token to every request routed through the wrapped {@link Fetch}
 * implementation.
 *
 * **Usage**
 *
 * ```typescript
 * import { createFetch } from "@metreeca/http";
 * import { bearer } from "@metreeca/http/bearer";
 *
 * createFetch(bearer(token));                                 // static token
 * createFetch(bearer(async request => vault.token(request))); // resolved per request
 * ```
 *
 * @module
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6750 RFC 6750 - The OAuth 2.0 Authorization Framework: Bearer Token
 *     Usage}
 */

import { isString } from "@metreeca/core";
import type { Awaitable } from "@metreeca/core/async";
import type { Fetch, Middleware } from "../index.js";


const Token68Pattern = /^[-A-Za-z0-9._~+\/]+=*$/; // the token68 syntax of RFC 7235 § 2.1


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a middleware authenticating requests with the `Bearer` scheme.
 *
 * Decorates a {@link Fetch} implementation with one adding an `Authorization` header carrying `token` to every request,
 * alongside the headers supplied by the caller; credentials already carried by the request are replaced, so the
 * middleware is best applied to a client dedicated to a single origin.
 *
 * Requests are normalised as {@link https://developer.mozilla.org/docs/Web/API/Request `Request`} objects before the
 * header is attached, preserving the headers and the options carried by a `Request` input alongside the overrides
 * supplied through `init`.
 *
 * A token supplied as a string is validated and encoded as the header value once when the middleware is created,
 * leaving nothing to compute on the request path. A token supplied as a function is resolved and validated on every
 * request, against the request as it is about to be sent, and may be returned either directly or as a promise: tokens
 * rotated elsewhere, as expiring OAuth ones are, are picked up without assembling a new client, and requests are
 * authenticated as their target requires. A supplier reporting a malformed token, or failing altogether, rejects the
 * exchange without sending it.
 *
 * > [!WARNING]
 * > A bearer token is a bearer credential in the literal sense: whoever holds it may use it. Confine it to `https`
 * > exchanges, as RFC 6750 § 5.3 requires.
 *
 * @param token The token to authenticate with, or a function computing it for every request
 *
 * @returns A {@link Middleware} wrapping a {@link Fetch} implementation with one authenticating every request with
 *     `token`
 *
 * @throws {@link !RangeError RangeError} If `token` is a string that doesn't match the `token68` syntax of
 *     RFC 7235 § 2.1
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6750 RFC 6750 - The OAuth 2.0 Authorization Framework: Bearer Token
 *     Usage}
 * @see {@link https://www.rfc-editor.org/rfc/rfc7235#section-2.1 RFC 7235 § 2.1 - Challenge and Response}
 */
export function bearer(token: string | ((request: Request) => Awaitable<string>)): Middleware {

	if ( isString(token) ) {

		const authorization = header(token);

		return fetch => async (input, init) => {

			const request = new Request(input, init);

			request.headers.set("Authorization", authorization);

			return fetch(request);

		};

	} else {

		return fetch => async (input, init) => {

			const request = new Request(input, init);

			request.headers.set("Authorization", header(await token(request)));

			return fetch(request);

		};

	}


	function header(token: string): string {

		if ( !Token68Pattern.test(token) ) {
			throw new RangeError(`invalid token <${token}>`);
		}

		return `Bearer ${token}`;

	}

}
