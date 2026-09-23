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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFetch, type Middleware } from "../index.js";
import { mock } from "./mock.js";


/**
 * Creates a middleware tagging the requests flowing through it.
 *
 * Tags accumulate in the `Trace` header in processing order, making the traversal of a chain observable from the
 * function the exchange is answered by.
 */
function tracing(tag: string): Middleware {

	return fetch => async (input, init) => {

		const request = new Request(input, init);

		request.headers.append("Trace", tag);

		return fetch(request);

	};

}

/**
 * Tracks whether a promise has settled, whatever its outcome.
 */
function settling(promise: Promise<unknown>): () => boolean {

	const state = { settled: false };

	promise.then(() => state.settled = true, () => state.settled = true);

	return () => state.settled;

}


describe("mock()", () => {

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});


	describe("responses", () => {

		it("should answer with an empty JSON object by default", async () => {
			const client = createFetch(mock());

			const response = client("https://api.example.com/data");

			await vi.runAllTimersAsync();

			const { status, headers } = await response;

			expect(status).toBe(200);
			expect(headers.get("Content-Type")).toBe("application/json");
			await expect((await response).json()).resolves.toEqual({});
		});

		it("should answer each exchange with a fresh default response", async () => {
			const client = createFetch(mock());

			const first = client("https://api.example.com/data");
			const second = client("https://api.example.com/data");

			await vi.runAllTimersAsync();

			expect(await first).not.toBe(await second);
			await expect((await first).json()).resolves.toEqual({});
			await expect((await second).json()).resolves.toEqual({});
		});

		it("should answer with the response computed for the exchange", async () => {
			const expected = new Response();

			const client = createFetch(mock({ serve: async () => expected }));

			const response = client("https://api.example.com/data");

			await vi.runAllTimersAsync();

			await expect(response).resolves.toBe(expected);
		});

		it("should reject synchronous response functions", async () => {
			// @ts-expect-error responses are computed asynchronously, as a server would
			expect(() => mock({ serve: () => new Response() })).not.toThrow();
		});

		it("should hand the exchange to the response function as a request", async () => {
			const serve = vi.fn(async (_request: Request) => new Response());

			const client = createFetch(mock({ serve }));

			const response = client("https://api.example.com/data", {
				method: "POST",
				headers: { "Content-Type": "application/json" }
			});

			await vi.runAllTimersAsync();
			await response;

			const [ [ request ] ] = serve.mock.calls;

			expect(request).toBeInstanceOf(Request);
			expect(request.url).toBe("https://api.example.com/data");
			expect(request.method).toBe("POST");
			expect(request.headers.get("Content-Type")).toBe("application/json");
		});

		it("should relay failures reported by the response function", async () => {
			const failure = new TypeError("network error");

			const client = createFetch(mock({ serve: async () => { throw failure; } }));

			const response = client("https://api.example.com/data");
			const assertion = expect(response).rejects.toBe(failure);

			await vi.runAllTimersAsync();
			await assertion;
		});

	});

	describe("delay", () => {

		it("should answer without waiting by default", async () => {
			const client = createFetch(mock());

			const settled = settling(client("https://api.example.com/data"));

			await vi.advanceTimersByTimeAsync(0);

			expect(settled()).toBeTruthy();
		});

		it("should wait for the delay before answering", async () => {
			const serve = vi.fn(async () => new Response());

			const client = createFetch(mock({ serve, delay: 1000 }));

			const settled = settling(client("https://api.example.com/data"));

			await vi.advanceTimersByTimeAsync(999);

			expect(settled()).toBeFalsy();
			expect(serve).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(1);

			expect(settled()).toBeTruthy();
			expect(serve).toHaveBeenCalledOnce();
		});

		it.each([
			[ "negative", -1 ],
			[ "not a number", Number.NaN ],
			[ "infinite", Number.POSITIVE_INFINITY ],
			[ "overflowing", 2**31 ]
		])("should reject %s delays", async (_label, delay) => {
			expect(() => mock({ delay })).toThrow(RangeError);
		});

	});

	describe("abort", () => {

		it("should reject exchanges aborted while waiting with the abort reason", async () => {
			const serve = vi.fn(async () => new Response());
			const controller = new AbortController();
			const reason = new Error("cancelled");

			const client = createFetch(mock({ serve, delay: 1000 }));

			const response = client("https://api.example.com/data", { signal: controller.signal });
			const assertion = expect(response).rejects.toBe(reason);

			await vi.advanceTimersByTimeAsync(500);

			controller.abort(reason);

			await assertion;

			expect(serve).not.toHaveBeenCalled();
		});

		it("should reject exchanges already aborted with the abort reason", async () => {
			const serve = vi.fn(async () => new Response());
			const reason = new Error("cancelled");

			const client = createFetch(mock({ serve, delay: 1000 }));

			const response = client("https://api.example.com/data", { signal: AbortSignal.abort(reason) });

			await expect(response).rejects.toBe(reason);

			expect(serve).not.toHaveBeenCalled();
		});

	});

	describe("chaining", () => {

		it("should replace the implementation it wraps", async () => {
			const standard = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());

			const client = createFetch(mock());

			const response = client("https://api.example.com/data");

			await vi.runAllTimersAsync();
			await response;

			expect(standard).not.toHaveBeenCalled();

			standard.mockRestore();
		});

		it("should be reached by the middlewares layered over it", async () => {
			const serve = vi.fn(async (_request: Request) => new Response());

			const client = createFetch(tracing("outer"), mock({ serve }));

			const response = client("https://api.example.com/data");

			await vi.runAllTimersAsync();
			await response;

			const [ [ request ] ] = serve.mock.calls;

			expect(request.headers.get("Trace")).toBe("outer");
		});

	});

});
