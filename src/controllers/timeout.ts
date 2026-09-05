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
 * Bounded response wait middleware.
 *
 * Bounds the wait for a response from the wrapped {@link Fetch} implementation, reporting a `504 Gateway Timeout` in
 * place of a response that doesn't arrive in time.
 *
 * **Usage**
 *
 * ```typescript
 * import { createFetch } from "@metreeca/http";
 * import { timeout } from "@metreeca/http/timeout";
 *
 * const client = createFetch(timeout(5000));
 * ```
 *
 * @module
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.6.5 RFC 9110 § 15.6.5 - 504 Gateway Timeout}
 */

import { type Fetch, GatewayTimeout, type Middleware } from "../index.js";


/**
 * The largest delay `setTimeout()` takes.
 *
 * Delays beyond this bound overflow the 32-bit counter timers are held in and are fired at once instead, so a limit
 * stated above it would invert a bounded wait into an immediate abort.
 *
 * @see {@link https://developer.mozilla.org/docs/Web/API/Window/setTimeout#maximum_delay_value Maximum delay value}
 */
const ResponseTimeoutLimit = 2**31-1;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a middleware bounding the wait for a response.
 *
 * Decorates a {@link Fetch} implementation with one giving up on an exchange whose response doesn't arrive within
 * `limit` milliseconds, reporting a `504 Gateway Timeout` in its place, so that a server that never replies is handled
 * as any other unsuccessful exchange and status handling stays with the consumer.
 *
 * The bound covers the wait for the response only: it is lifted as soon as the response is reported, leaving the body
 * free to be streamed for as long as it takes, so that a large resource is not truncated while a slow server is given
 * up on.
 *
 * The status is reported as soon as the bound expires, whether or not the transport gives up on the exchange, so that
 * the wait is bounded even by an implementation ignoring the abort: a response or a failure reported after that point
 * is discarded, rather than relayed or reported as a timeout.
 *
 * An exchange stating a signal of its own is aborted by that signal or by the bound, whichever fires first, and an
 * abort asked for from the outside before the bound expires is relayed to the caller as it was reported, rather than
 * reported as a timeout. A signal supplied through `init` supersedes the one carried by a
 * {@link https://developer.mozilla.org/docs/Web/API/Request `Request`} input, as it does in the `Request` constructor:
 * a signal reported as `undefined` counts as unstated, while an explicit `null` clears it, leaving the bound as the
 * only signal.
 *
 * A `Request` input reaches the transport as it was submitted, but for the signal: its body is relayed undisturbed and
 * its referrer and referrer policy are preserved.
 *
 * > [!NOTE]
 * > `504` is one of the transient statuses {@link throttle!throttle throttle} retries: declaring this middleware
 * > after it bounds each attempt on its own, while declaring it before bounds the retry sequence as a whole.
 *
 * @param limit The maximum number of milliseconds to wait for a response
 *
 * @returns A {@link Middleware} wrapping a {@link Fetch} implementation with one bounding the wait for the response of
 *     every exchange
 *
 * @throws {@link !RangeError RangeError} If `limit` is not a positive number of milliseconds within the range
 *     `setTimeout()` handles
 *
 * @see {@link https://developer.mozilla.org/docs/Web/API/AbortSignal `AbortSignal`}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.6.5 RFC 9110 § 15.6.5 - 504 Gateway Timeout}
 */
export function timeout(limit: number): Middleware {

	// an overflowing limit would be fired at once by the timer, inverting the bound into an immediate abort

	if ( !(limit > 0 && limit <= ResponseTimeoutLimit) ) {
		throw new RangeError(`illegal timeout limit <${limit}>`);
	}

	return fetcher => async (input, init) => {

		const controller = new AbortController();

		// the bound is reported by the timer, rather than by the failure the transport reports on abort, so that an
		// exchange is given up on even by an implementation ignoring the signal and an unrelated failure reported
		// after the deadline is not read as a timeout: the listener is registered before the exchange is submitted,
		// so that the expiry is settled ahead of any abort the transport relays

		const expiry = new Promise<Response>(resolve => controller.signal.addEventListener("abort", () => {

			resolve(new Response(null, { status: GatewayTimeout, statusText: "Gateway Timeout" }));

		}));

		const timer = setTimeout(() => controller.abort(), limit);

		// a signal stated by `init` supersedes the one carried by a request, as it does in the `Request` constructor,
		// where a signal reported as `undefined` counts as unstated, and an explicit `null` clears it altogether

		const stated = init && init.signal !== undefined ? init.signal
			: input instanceof Request ? input.signal
				: undefined;

		const signal = stated ? AbortSignal.any([stated, controller.signal]) : controller.signal;

		// the request is left as it was submitted, but for the signal, so that a body reaches the transport
		// undisturbed: rebuilding it around the merged signal reverts its referrer to the default, so both the
		// referrer and its policy are restated, leaving `init` free to supersede them as usual

		const restated = input instanceof Request
			? { referrer: input.referrer, referrerPolicy: input.referrerPolicy }
			: undefined;

		try {

			return await Promise.race([ fetcher(input, { ...restated, ...init, signal }), expiry ]);

		} finally {

			clearTimeout(timer); // the response is in: whatever it takes to read its body is not the middleware's call

		}

	};

}
