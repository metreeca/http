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
 * Default header fields middleware.
 *
 * Injects static or dynamically supplied default header fields into every request routed through the wrapped
 * {@link Fetch} implementation, leaving fields already carried by the request as they are.
 *
 * **Usage**
 *
 * ```typescript
 * import { createFetch } from "@metreeca/http";
 * import { headers } from "@metreeca/http/headers";
 *
 * const client = createFetch(headers({ "Accept": "application/json" }));
 * ```
 *
 * @module
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5 RFC 9110 § 5 - Fields}
 */

import { isFunction } from "@metreeca/core";
import type { Awaitable } from "@metreeca/core/async";
import type { Fetch, Middleware } from "../index.js";


/**
 * Creates a middleware injecting default header fields into requests.
 *
 * Decorates a {@link Fetch} implementation with one adding `defaults` to every request, alongside the fields supplied
 * by the caller: a field already carried by the request is left as it is, so that injected fields stand as defaults an
 * exchange may override on its own terms.
 *
 * > [!IMPORTANT]
 * > Fields supplied by the caller take precedence: a field named by `defaults` is attached only if the request
 * > carries none under that name, whatever its value, and is otherwise dropped. The injected value is never appended
 * > to the one in place, and no field is ever removed.
 * >
 * > ```typescript
 * > const client = createFetch(headers({ "Accept": "application/json" }));
 * >
 * > await client("https://api.example.com/data"); // Accept: application/json
 * >
 * > await client("https://api.example.com/data", { // Accept: text/csv, as supplied by the caller
 * >   headers: { "Accept": "text/csv" }
 * > });
 * > ```
 * >
 * > To impose a field on every exchange, regardless of what the caller supplies, layer a middleware setting it
 * > outright, as {@link basic!basic basic} and {@link bearer!bearer bearer} do for the `Authorization` field.
 *
 * Requests are normalised as {@link https://developer.mozilla.org/docs/Web/API/Request `Request`} objects before the
 * fields are attached, preserving the headers and the options carried by a `Request` input alongside the overrides
 * supplied through `init`.
 *
 * Fields supplied as a {@link https://developer.mozilla.org/docs/Web/API/Headers `HeadersInit`} value are validated and
 * normalised once when the middleware is created, leaving nothing to compute on the request path; fields repeated under
 * the same name are merged into a comma-separated value, as the `Headers` constructor prescribes. Fields supplied as a
 * function are resolved and normalised on every request, against the request as it is about to be sent, so that values
 * depending on the exchange, such as a correlation id or a target-specific trait, are computed as it requires. A
 * supplier reporting malformed fields, or failing altogether, rejects the exchange without sending it.
 *
 * Field names are matched case-insensitively, as HTTP prescribes, so `content-type` and `Content-Type` name the same
 * field both when the request is tested and when the default is attached.
 *
 * @param defaults The default header fields to be injected, or a function computing them for every request
 *
 * @returns A {@link Middleware} wrapping a {@link Fetch} implementation with one injecting the fields of `defaults`
 *     the request doesn't already carry
 *
 * @throws {@link !TypeError TypeError} If `defaults` is a `HeadersInit` value carrying a malformed field name or value
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5 RFC 9110 § 5 - Fields}
 */
export function headers(defaults: HeadersInit | ((request: Request) => Awaitable<HeadersInit>)): Middleware {

	if ( isFunction(defaults) ) {

		return fetch => async (input, init) => {

			const request = new Request(input, init);

			inject(request, new Headers(await defaults(request)));

			return fetch(request);

		};

	} else {

		const headers = new Headers(defaults);

		return fetch => async (input, init) => {

			const request = new Request(input, init);

			inject(request, headers);

			return fetch(request);

		};

	}


	function inject(request: Request, fields: Headers): void {

		Array.from(fields)
			.filter(([name]) => !request.headers.has(name))
			.forEach(([name, value]) => request.headers.set(name, value));

	}

}
