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
import { basic } from "./basic.js";
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


describe("basic()", () => {

	describe("credentials", () => {

		it("should attach user id and password as base64-encoded credentials", async () => {

			const request = await exchange(basic("usr", "pwd"), "https://api.example.com/data");

			expect(request.headers.get("Authorization")).toBe("Basic dXNyOnB3ZA==");

		});

		it("should encode credentials as NFC-normalised UTF-8", async () => {

			const request = await exchange(basic("é", "pwd"), "https://api.example.com/data");

			expect(request.headers.get("Authorization")).toBe("Basic w6k6cHdk");

		});

		it("should reject user ids containing the credentials delimiter", async () => {

			expect(() => basic("usr:extra", "pwd")).toThrow(RangeError);

		});

	});

	describe("request headers", () => {

		it("should preserve headers supplied through init", async () => {

			const request = await exchange(basic("usr", "pwd"), "https://api.example.com/data", {
				headers: { "Accept": "application/json" }
			});

			expect(request.headers.get("Accept")).toBe("application/json");
			expect(request.headers.get("Authorization")).toBe("Basic dXNyOnB3ZA==");

		});

		it("should preserve headers carried by a Request input", async () => {

			const request = await exchange(basic("usr", "pwd"), new Request("https://api.example.com/data", {
				headers: { "Accept": "application/json" }
			}));

			expect(request.headers.get("Accept")).toBe("application/json");
			expect(request.headers.get("Authorization")).toBe("Basic dXNyOnB3ZA==");

		});

		it("should replace credentials supplied through init", async () => {

			const request = await exchange(basic("usr", "pwd"), "https://api.example.com/data", {
				headers: { "Authorization": "Bearer token" }
			});

			expect(request.headers.get("Authorization")).toBe("Basic dXNyOnB3ZA==");

		});

		it("should replace credentials carried by a Request input", async () => {

			const request = await exchange(basic("usr", "pwd"), new Request("https://api.example.com/data", {
				headers: { "Authorization": "Bearer token" }
			}));

			expect(request.headers.get("Authorization")).toBe("Basic dXNyOnB3ZA==");

		});

	});

	describe("request options", () => {

		it("should preserve method and body carried by a Request input", async () => {

			const request = await exchange(basic("usr", "pwd"), new Request("https://api.example.com/data", {
				method: "POST",
				body: "payload"
			}));

			expect(request.method).toBe("POST");
			await expect(request.text()).resolves.toBe("payload");

		});

		it("should report malformed inputs as rejections", async () => {

			const mock = vi.fn<Fetch>().mockResolvedValue(new Response());

			await expect(basic("usr", "pwd")(mock)("::malformed::")).rejects.toThrow(TypeError);

			expect(mock).not.toHaveBeenCalled();

		});

	});

});
