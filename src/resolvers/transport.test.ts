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

import { describe, expect, it, vi } from "vitest";
import { createFetch, type Fetch, type Middleware } from "../index.js";
import { transport } from "./transport.js";


/**
 * Creates a middleware tagging the requests flowing through it.
 *
 * Tags accumulate in the `Trace` header in processing order, making the traversal of a chain observable from the
 * implementation the exchange is routed to.
 */
function tracing(tag: string): Middleware {

	return fetch => async (input, init) => {

		const request = new Request(input, init);

		request.headers.append("Trace", tag);

		return fetch(request);

	};

}


describe("transport()", () => {

	it("should route exchanges through the given implementation", async () => {
		const expected = new Response();
		const custom = vi.fn<Fetch>().mockResolvedValue(expected);

		const client = createFetch(transport(custom));

		await expect(client("https://api.example.com/data")).resolves.toBe(expected);
	});

	it("should replace the implementation it wraps", async () => {
		const standard = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
		const custom = vi.fn<Fetch>().mockResolvedValue(new Response());

		const client = createFetch(transport(custom));

		await client("https://api.example.com/data");

		expect(custom).toHaveBeenCalled();
		expect(standard).not.toHaveBeenCalled();

		standard.mockRestore();
	});

	it("should be reached by the middlewares layered over it", async () => {
		const custom = vi.fn<Fetch>().mockResolvedValue(new Response());

		const client = createFetch(tracing("outer"), transport(custom));

		await client("https://api.example.com/data");

		const [ [ input, init ] ] = custom.mock.calls;

		expect(new Request(input, init).headers.get("Trace")).toBe("outer");
	});

});
