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
import { createFetch, type Fetch, type Middleware } from "./index.js";
import { transport } from "./controllers/transport.js";


/**
 * Creates a middleware tagging the requests and the responses flowing through it.
 *
 * Tags accumulate in the `Trace` header in processing order, making the traversal of a chain observable from either
 * end of an exchange.
 */
function tracing(tag: string): Middleware {

	return fetch => async (input, init) => {

		const request = new Request(input, init);

		request.headers.append("Trace", tag);

		const response = await fetch(request);

		response.headers.append("Trace", tag);

		return response;

	};

}


describe("createFetch()", () => {

	it("should delegate to the standard fetch function", async () => {
		const expected = new Response();
		const standard = vi.spyOn(globalThis, "fetch").mockResolvedValue(expected);

		const client = createFetch();

		await expect(client("https://api.example.com/data")).resolves.toBe(expected);
		expect(standard).toHaveBeenCalled();

		standard.mockRestore();
	});

	it("should process requests in declaration order", async () => {
		const mock = vi.fn<Fetch>().mockResolvedValue(new Response());
		const client = createFetch(tracing("outer"), tracing("inner"), transport(mock));

		await client("https://api.example.com/data");

		const [ [ input, init ] ] = mock.mock.calls;

		expect(new Request(input, init).headers.get("Trace")).toBe("outer, inner");
	});

	it("should process responses in reverse declaration order", async () => {
		const mock = vi.fn<Fetch>().mockResolvedValue(new Response());
		const client = createFetch(tracing("outer"), tracing("inner"), transport(mock));

		const response = await client("https://api.example.com/data");

		expect(response.headers.get("Trace")).toBe("inner, outer");
	});

});
