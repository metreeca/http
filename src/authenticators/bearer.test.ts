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
import { bearer } from "./bearer.js";
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


describe("bearer()", () => {

	describe("credentials", () => {

		it("should attach the token as credentials", async () => {

			const request = await exchange(bearer("token"), "https://api.example.com/data");

			expect(request.headers.get("Authorization")).toBe("Bearer token");

		});

		it("should accept tokens spelled in the whole token68 alphabet", async () => {

			const request = await exchange(bearer("aZ09-._~+/=="), "https://api.example.com/data");

			expect(request.headers.get("Authorization")).toBe("Bearer aZ09-._~+/==");

		});

		it.each([

			[ "empty tokens", "" ],
			[ "tokens carrying spaces", "to ken" ],
			[ "tokens carrying control characters", "to\nken" ],
			[ "tokens carrying non-ASCII characters", "tokèn" ],
			[ "tokens carrying misplaced padding", "to=ken" ]

		])("should reject %s", async (_, malformed) => {

			expect(() => bearer(malformed)).toThrow(RangeError);

		});

		it("should resolve a token supplier on every request", async () => {

			const mock = serving(new Response(), new Response());

			const tokens = vi.fn<(request: Request) => string>()
				.mockReturnValueOnce("first")
				.mockReturnValueOnce("second");

			const client = bearer(tokens)(mock);

			await client("https://api.example.com/data");
			await client("https://api.example.com/data");

			const [ first, second ] = requests(mock);

			expect(first.headers.get("Authorization")).toBe("Bearer first");
			expect(second.headers.get("Authorization")).toBe("Bearer second");

		});

		it("should supply the request to be authenticated to the token supplier", async () => {

			const tokens = vi.fn<(request: Request) => string>().mockReturnValue("token");

			await exchange(bearer(tokens), "https://api.example.com/data", { method: "POST" });

			const [ [ request ] ] = tokens.mock.calls;

			expect(request.url).toBe("https://api.example.com/data");
			expect(request.method).toBe("POST");

		});

		it("should await asynchronous token suppliers", async () => {

			const request = await exchange(bearer(async () => "token"), "https://api.example.com/data");

			expect(request.headers.get("Authorization")).toBe("Bearer token");

		});

		it("should reject malformed supplied tokens", async () => {

			const mock = serving(new Response());

			await expect(bearer(() => "to ken")(mock)("https://api.example.com/data")).rejects.toThrow(RangeError);

			expect(mock).not.toHaveBeenCalled();

		});

		it("should relay failures reported by the token supplier", async () => {

			const mock = serving(new Response());
			const failure = new Error("unavailable token");

			await expect(bearer(() => { throw failure; })(mock)("https://api.example.com/data")).rejects.toBe(failure);

			expect(mock).not.toHaveBeenCalled();

		});

	});

	describe("request headers", () => {

		it("should preserve headers supplied through init", async () => {

			const request = await exchange(bearer("token"), "https://api.example.com/data", {
				headers: { "Accept": "application/json" }
			});

			expect(request.headers.get("Accept")).toBe("application/json");
			expect(request.headers.get("Authorization")).toBe("Bearer token");

		});

		it("should preserve headers carried by a Request input", async () => {

			const request = await exchange(bearer("token"), new Request("https://api.example.com/data", {
				headers: { "Accept": "application/json" }
			}));

			expect(request.headers.get("Accept")).toBe("application/json");
			expect(request.headers.get("Authorization")).toBe("Bearer token");

		});

		it("should replace credentials supplied through init", async () => {

			const request = await exchange(bearer("token"), "https://api.example.com/data", {
				headers: { "Authorization": "Basic dXNyOnB3ZA==" }
			});

			expect(request.headers.get("Authorization")).toBe("Bearer token");

		});

	});

	describe("request options", () => {

		it("should preserve method and body carried by a Request input", async () => {

			const request = await exchange(bearer("token"), new Request("https://api.example.com/data", {
				method: "POST",
				body: "payload"
			}));

			expect(request.method).toBe("POST");
			await expect(request.text()).resolves.toBe("payload");

		});

		it("should report malformed inputs as rejections", async () => {

			const mock = serving(new Response());

			await expect(bearer("token")(mock)("::malformed::")).rejects.toThrow(TypeError);

			expect(mock).not.toHaveBeenCalled();

		});

	});

});
