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
 * Mock fetch transport middleware.
 *
 * Answers every exchange with a response computed locally, after an optional simulated latency, so that demos,
 * interactive wireframes and prototypes run on a realistic client without a backend.
 *
 * **Usage**
 *
 * ```typescript
 * import { createFetch } from "@metreeca/http";
 * import { mock } from "@metreeca/http/mock";
 *
 * const client = createFetch(mock({ serve: request => Response.json({ url: request.url }), delay: 500 }));
 * ```
 *
 * @module
 *
 * @see {@link https://fetch.spec.whatwg.org/ WHATWG Fetch Standard}
 */

import type { createFetch, Fetch, Middleware } from "../index.js";


/**
 * The largest delay `setTimeout()` takes.
 *
 * Delays beyond this bound overflow the 32-bit counter timers are held in and are fired at once instead.
 *
 * @see {@link https://developer.mozilla.org/docs/Web/API/Window/setTimeout#maximum_delay_value Maximum delay value}
 */
const MockDelayLimit = 2**31-1;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a middleware answering exchanges with locally computed responses.
 *
 * Stands in for the network, in place of the standard function {@link createFetch} would otherwise delegate to:
 * each exchange is handed to `serve` as a {@link https://developer.mozilla.org/docs/Web/API/Request `Request`} and
 * answered with the response it returns once `delay` milliseconds have elapsed, so that loading states, timeouts and
 * error handling are exercised as they would be against a live server. A failure reported by `serve` reaches the
 * caller as a transport failure would.
 *
 * An exchange aborted by its signal before it is answered is rejected with the abort reason, as the standard function
 * does, and `serve` is not consulted.
 *
 * Ignores the {@link Fetch} implementation it wraps: middlewares declared before it process exchanges as usual, while
 * middlewares declared after it are never reached, so this middleware is to be declared last in a chain.
 *
 * @param options Mock options
 * @param options.serve The function computing the response to each exchange; defaults to a `200 OK` response carrying
 *     an empty JSON object
 * @param options.delay The number of milliseconds to wait before answering each exchange; defaults to `0`
 *
 * @returns A {@link Middleware} answering every exchange with the response computed by `serve`, ignoring the
 *     {@link Fetch} implementation it wraps
 *
 * @throws {@link !RangeError RangeError} If `delay` is not a non-negative number of milliseconds within the range
 *     `setTimeout()` handles
 */
export function mock({

	serve = async () => new Response("{}", { headers: { "Content-Type": "application/json" } }),
	delay = 0

}: {

	serve?: (request: Request) => Promise<Response>
	delay?: number

} = {}): Middleware {

	if ( !(delay >= 0 && delay <= MockDelayLimit) ) {
		throw new RangeError(`illegal mock delay <${delay}>`);
	}

	return () => async (input, init) => {

		const request = new Request(input, init);
		const { signal } = request;

		signal.throwIfAborted();

		await new Promise<void>((resolve, reject) => {

			const timer = setTimeout(() => {
				signal.removeEventListener("abort", abort);
				resolve();
			}, delay);

			function abort() {
				clearTimeout(timer);
				reject(signal.reason);
			}

			signal.addEventListener("abort", abort, { once: true });

		});

		return serve(request);

	};

}
