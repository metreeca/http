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
 * Custom fetch transport middleware.
 *
 * Routes every exchange through a given {@link Fetch} implementation, in place of the standard function
 * {@link createFetch} would otherwise delegate to.
 *
 * **Usage**
 *
 * ```typescript
 * import { createFetch } from "@metreeca/http";
 * import { transport } from "@metreeca/http/transport";
 *
 * const client = createFetch(transport(custom));
 * ```
 *
 * @module
 *
 * @see {@link https://fetch.spec.whatwg.org/ WHATWG Fetch Standard}
 */

import type { createFetch, Fetch, Middleware } from "../index.js";


/**
 * Creates a middleware routing exchanges through a given fetch implementation.
 *
 * Supplies the transport a client is to run on, for instance a proxy-bound `undici` fetch, a platform service binding,
 * or a test double, in place of the standard function {@link createFetch} would otherwise delegate to:
 *
 * ```typescript
 * const client = createFetch(basic("user", "secret"), success(), transport(custom));
 * ```
 *
 * Ignores the {@link Fetch} implementation it wraps, delegating every exchange to `fetch` instead: middlewares
 * declared before it process exchanges as usual, while middlewares declared after it are never reached, so this
 * middleware is to be declared last in a chain.
 *
 * @param fetch The {@link Fetch} implementation to route every exchange through
 *
 * @returns A {@link Middleware} delegating every exchange to `fetch`, ignoring the {@link Fetch} implementation it
 *     wraps
 */
export function transport(fetch: Fetch): Middleware {

	return () => fetch;

}
