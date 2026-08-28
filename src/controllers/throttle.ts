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
 * Adaptive pacing and retries middleware.
 *
 * Paces the exchanges routed through the wrapped {@link Fetch} implementation with an adaptive throttle, retrying
 * transient failures as the target directs.
 *
 * **Usage**
 *
 * ```typescript
 * import { createFetch } from "@metreeca/http";
 * import { success } from "@metreeca/http/success";
 * import { throttle } from "@metreeca/http/throttle";
 * import { timeout } from "@metreeca/http/timeout";
 *
 * const client = createFetch(
 *   success(),                              // declared before throttle: retries see responses, not rejections
 *   throttle({ minimum: 100, attempts: 3 }),
 *   timeout(5000)                           // bounds each attempt on its own
 * );
 * ```
 *
 * @module
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3 RFC 9110 § 10.2.3 - Retry-After}
 */

import { createThrottle } from "@metreeca/core/async";
import { parseInstant, parseDuration } from "../index.core.js";
import type { Fetch, Middleware } from "../index.js";
import type { Problem } from "./success.js";


/**
 * Creates a middleware pacing exchanges and retrying transient failures.
 *
 * Decorates a {@link Fetch} implementation with one holding each exchange until an adaptive throttle grants it, so
 * that a client keeps to the rate its target is willing to serve without the call sites having to coordinate. Every
 * exchange routed through the middleware shares a single throttle, whose baseline delay adapts to what the server
 * replies:
 *
 * - a successful exchange speeds the client up
 * - a failed one slows it down
 * - a response asking for a delay through a `Retry-After` header field, in either the delta seconds or the HTTP date
 *   form, sets the delay outright
 *
 * Exchanges failing on a transient status, that is `408`, `429` or any `5xx`, are retried as the throttle directs, up
 * to `attempts` times; every other unsuccessful exchange, and the last attempt of an exhausted one, is relayed to the
 * caller as it stands, so that status handling stays with the consumer.
 *
 * > [!IMPORTANT]
 * > Retries are driven by the response status, so this middleware is to be declared after any middleware converting
 * > responses into rejections, as {@link success!success success} does: a failure already reported as a
 * > {@link Problem} is no longer a response and is relayed to the caller without being retried.
 * >
 * > ```typescript
 * > const client = createFetch(success(), throttle({ minimum: 100, attempts: 3 }));
 * > ```
 *
 * > [!WARNING]
 * > `attempts` set to `0` retries a transient failure indefinitely, until the exchange either succeeds or fails on a
 * > status that isn't retried.
 *
 * @param options The throttling options, as defined by {@link createThrottle}, extended with the retry budget
 * @param options.attempts The maximum number of attempts per exchange; `0` means no limit; defaults to `1`, that is to
 *     a single attempt with no retries
 *
 * @returns A {@link Middleware} wrapping a {@link Fetch} implementation with one pacing every exchange and retrying
 *     transient failures
 *
 * @throws {Error} If any option is out of range
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3 RFC 9110 § 10.2.3 - Retry-After}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5 RFC 9110 § 15.5 - Client Error 4xx}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.6 RFC 9110 § 15.6 - Server Error 5xx}
 */
export function throttle({ attempts = 1, ...options }: Parameters<typeof createThrottle>[0] & {

	readonly attempts?: number

} = {}): Middleware {


	const throttle = createThrottle(options);

	return fetcher => async (request, init) => {

		try {

			// the throttle queues each attempt and reports its outcome, pacing the retries as it paces the exchanges

			return await throttle.retry(async () => {

				const response = await fetcher(request, init);

				if ( response.ok ) { // that is, a 2xx status

					return response;

				} else {

					throw response; // reported as a failure to the retry loop, which drives off thrown values

				}

			}, {

				attempts,

				recover: error => error instanceof Response && transient(error) ? after(error) : undefined

			});

		} catch ( error ) {

			// an unsuccessful response is relayed to the caller as is, whatever the last attempt left it at

			if ( error instanceof Response ) {

				return error;

			} else {

				throw error;

			}

		}


		function transient({ status }: Response): boolean { // that is, a failure the server may recover from

			return status === 408 || status === 429 || status >= 500;

		}

		function after({ headers }: Response): number { // the delay the response asks for (ms), or 0 if none is stated

			const retry = headers.get("Retry-After");

			// delta seconds, falling back to the HTTP date form; 0 unless a delay still to elapse is stated

			return parseDuration(retry) ?? Math.max(0, (parseInstant(retry) ?? 0)-Date.now());

		}

	};

}
