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

import { describe, expect, it, type Mock, vi } from "vitest";
import { headers } from "./headers.js";
import { type Fetch, type Middleware } from "../index.js";


/**
 * Runs an exchange through a middleware, reporting the request seen by the wrapped fetch.
 *
 * Arguments captured by the mock are replayed through the `Request` constructor exactly as a real fetch would
 * resolve them, so assertions observe the effective request rather than the raw handover.
 */
async function exchange(middleware: Middleware, ...args: Parameters<Fetch>): Promise<Request> {

	const mock = vi.fn<Fetch>().mockResolvedValue(new Response());

	await middleware(mock)(...args);

	const [ [ input, init ] ] = mock.mock.calls;

	return new Request(input, init);

}

/**
 * Creates a mock fetch answering with the given responses in order.
 *
 * Exchanges beyond the scripted ones are answered with `500 Internal Server Error`, so that an unexpected extra
 * exchange surfaces as a failed assertion rather than as a rejected promise.
 */
function serving(...responses: readonly Response[]): Mock<Fetch> {

	return responses.reduce((mock, response) => mock.mockResolvedValueOnce(response),
		vi.fn<Fetch>().mockResolvedValue(new Response(null, { status: 500 }))
	);

}

/**
 * Reports the requests seen by a mock fetch.
 *
 * Arguments captured by the mock are replayed through the `Request` constructor exactly as a real fetch would resolve
 * them, so assertions observe the effective requests rather than the raw handovers.
 */
function requests(mock: Mock<Fetch>): Request[] {

	return mock.mock.calls.map(([ input, init ]) => new Request(input, init));

}


describe("headers()", () => {

	describe("header fields", () => {

		it("should inject the supplied fields", async () => {

			const request = await exchange(headers({ "X-Trait": "value" }), "https://api.example.com/data");

			expect(request.headers.get("X-Trait")).toBe("value");

		});

		it.each([

			[ "a record", { "X-Trait": "value" } ],
			[ "an entry array", [ [ "X-Trait", "value" ] ] ],
			[ "a Headers object", new Headers({ "X-Trait": "value" }) ]

		])("should accept fields supplied as %s", async (_, init) => {

			const request = await exchange(headers(init as HeadersInit), "https://api.example.com/data");

			expect(request.headers.get("X-Trait")).toBe("value");

		});

		it("should merge fields repeated under the same name", async () => {

			const request = await exchange(headers([

				[ "Accept", "text/plain" ],
				[ "Accept", "application/json" ]

			]), "https://api.example.com/data");

			expect(request.headers.get("Accept")).toBe("text/plain, application/json");

		});

		it("should preserve fields supplied through init", async () => {

			const request = await exchange(headers({ "X-Trait": "value" }), "https://api.example.com/data", {
				headers: { "Accept": "application/json" }
			});

			expect(request.headers.get("Accept")).toBe("application/json");
			expect(request.headers.get("X-Trait")).toBe("value");

		});

		it("should preserve fields carried by a Request input", async () => {

			const request = await exchange(headers({ "X-Trait": "value" }), new Request("https://api.example.com/data", {
				headers: { "Accept": "application/json" }
			}));

			expect(request.headers.get("Accept")).toBe("application/json");
			expect(request.headers.get("X-Trait")).toBe("value");

		});

		it("should defer to fields supplied through init", async () => {

			const request = await exchange(headers({ "Accept": "application/json" }), "https://api.example.com/data", {
				headers: { "Accept": "text/plain" }
			});

			expect(request.headers.get("Accept")).toBe("text/plain");

		});

		it("should defer to fields carried by a Request input", async () => {

			const request = await exchange(headers({ "Accept": "application/json" }),
				new Request("https://api.example.com/data", { headers: { "Accept": "text/plain" } })
			);

			expect(request.headers.get("Accept")).toBe("text/plain");

		});

		it.each([

			[ "malformed field names", { "X Trait": "value" } ],
			[ "malformed field values", { "X-Trait": "va\0lue" } ]

		])("should reject %s", async (_, malformed) => {

			expect(() => headers(malformed)).toThrow(TypeError);

		});

	});

	describe("header suppliers", () => {

		it("should resolve a supplier on every request", async () => {

			const mock = serving(new Response(), new Response());

			const traits = vi.fn<(request: Request) => HeadersInit>()
				.mockReturnValueOnce({ "X-Trait": "first" })
				.mockReturnValueOnce({ "X-Trait": "second" });

			const client = headers(traits)(mock);

			await client("https://api.example.com/data");
			await client("https://api.example.com/data");

			const [ first, second ] = requests(mock);

			expect(first.headers.get("X-Trait")).toBe("first");
			expect(second.headers.get("X-Trait")).toBe("second");

		});

		it("should supply the request to be injected into to the supplier", async () => {

			const traits = vi.fn<(request: Request) => HeadersInit>().mockReturnValue({ "X-Trait": "value" });

			await exchange(headers(traits), "https://api.example.com/data", { method: "POST" });

			const [ [ request ] ] = traits.mock.calls;

			expect(request.url).toBe("https://api.example.com/data");
			expect(request.method).toBe("POST");

		});

		it("should await asynchronous suppliers", async () => {

			const request = await exchange(headers(async () => ({ "X-Trait": "value" })),
				"https://api.example.com/data"
			);

			expect(request.headers.get("X-Trait")).toBe("value");

		});

		it("should reject malformed supplied fields", async () => {

			const mock = serving(new Response());

			await expect(headers(() => ({ "X Trait": "value" }))(mock)("https://api.example.com/data"))
				.rejects.toThrow(TypeError);

			expect(mock).not.toHaveBeenCalled();

		});

		it("should relay failures reported by the supplier", async () => {

			const mock = serving(new Response());
			const failure = new Error("unavailable headers");

			await expect(headers(() => { throw failure; })(mock)("https://api.example.com/data")).rejects.toBe(failure);

			expect(mock).not.toHaveBeenCalled();

		});

	});

	describe("request options", () => {

		it("should preserve method and body carried by a Request input", async () => {

			const request = await exchange(headers({ "X-Trait": "value" }), new Request("https://api.example.com/data", {
				method: "POST",
				body: "payload"
			}));

			expect(request.method).toBe("POST");
			await expect(request.text()).resolves.toBe("payload");

		});

		it("should report malformed inputs as rejections", async () => {

			const mock = serving(new Response());

			await expect(headers({ "X-Trait": "value" })(mock)("::malformed::")).rejects.toThrow(TypeError);

			expect(mock).not.toHaveBeenCalled();

		});

	});

});
