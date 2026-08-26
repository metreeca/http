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
import { sleep } from "@metreeca/core/async";
import { type Fetch, GatewayTimeout } from "../index.js";
import { timeout } from "./timeout.js";


const url = "https://api.example.com/data";

const limit = 50; // short enough to be observed without holding up the suite


/**
 * Creates a mock fetch never replying, unless the exchange is aborted, in which case it reports the abort reason as
 * the transport does.
 */
function stalling(): Mock<Fetch> {

	return vi.fn<Fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {

		const signal = init?.signal ?? new AbortController().signal;

		signal.addEventListener("abort", () => reject(signal.reason));

	}));

}

/**
 * Creates a mock fetch never replying, whatever the exchange is asked to do.
 */
function hanging(): Mock<Fetch> {

	return vi.fn<Fetch>().mockImplementation(() => new Promise<Response>(() => {}));

}

/**
 * Reports the signal the given mock fetch was handed on its first exchange.
 */
function submitted(mock: Mock<Fetch>): AbortSignal | null | undefined {

	return mock.mock.calls[0]?.[1]?.signal;

}

/**
 * Reports the request the given mock fetch was handed on its first exchange, as the transport would build it.
 */
function relayed(mock: Mock<Fetch>): Request | undefined {

	const call = mock.mock.calls[0];

	return call && new Request(call[0], call[1]);

}


describe("timeout()", () => {

	describe("limits", () => {

		it.each([ 0, -1, NaN, 2**31, Infinity ])("should reject a limit of <%s> ms", async limit => {

			expect(() => timeout(limit)).toThrow(RangeError);

		});

		it.each([ 1, 2**31-1 ])("should accept a limit of <%s> ms", async limit => {

			expect(() => timeout(limit)).not.toThrow();

		});

	});

	describe("exchanges", () => {

		it("should relay responses reported within the bound", async () => {

			const response = new Response();
			const mock = vi.fn<Fetch>().mockResolvedValue(response);

			await expect(timeout(limit)(mock)(url)).resolves.toBe(response);

		});

		it("should relay failures reported within the bound", async () => {

			const failure = new TypeError("Failed to fetch");
			const mock = vi.fn<Fetch>().mockRejectedValue(failure);

			await expect(timeout(limit)(mock)(url)).rejects.toBe(failure);

		});

		it("should relay the request as it was submitted, but for the signal", async () => {

			const mock = vi.fn<Fetch>().mockResolvedValue(new Response());
			const init: RequestInit = { method: "POST", body: "payload" };

			await timeout(limit)(mock)(url, init);

			expect(mock).toHaveBeenCalledWith(url, { ...init, signal: expect.any(AbortSignal) });

		});

		it("should relay the referrer of a request as it was submitted", async () => {

			const mock = vi.fn<Fetch>().mockResolvedValue(new Response());
			const referrer = "https://api.example.com/page";

			await timeout(limit)(mock)(new Request(url, { referrer, referrerPolicy: "origin" }));

			expect(relayed(mock)?.referrer).toBe(referrer);
			expect(relayed(mock)?.referrerPolicy).toBe("origin");

		});

	});

	describe("response bound", () => {

		it("should report a gateway timeout if the response is not reported within the bound", async () => {

			const response = await timeout(limit)(stalling())(url);

			expect(response.status).toBe(GatewayTimeout);

		});

		it("should report a gateway timeout even if the transport ignores the abort", async () => {

			const response = await timeout(limit)(hanging())(url);

			expect(response.status).toBe(GatewayTimeout);

		});

		it("should discard a failure reported after the bound", async () => {

			const mock = vi.fn<Fetch>().mockImplementation(async () => {

				await sleep(2*limit);

				throw new TypeError("Failed to fetch");

			});

			await expect(timeout(limit)(mock)(url)).resolves.toMatchObject({ status: GatewayTimeout });

		});

		it("should lift the bound as soon as the response is reported", async () => {

			const mock = vi.fn<Fetch>().mockResolvedValue(new Response());

			await timeout(limit)(mock)(url);
			await sleep(2*limit);

			expect(submitted(mock)?.aborted).toBe(false);

		});

	});

	describe("stated signals", () => {

		it("should relay an abort asked for through the request", async () => {

			const controller = new AbortController();
			const reason = new Error("aborted");

			const exchange = timeout(limit)(stalling())(new Request(url, { signal: controller.signal }));

			controller.abort(reason);

			await expect(exchange).rejects.toBe(reason);

		});

		it("should relay an abort asked for through `init`", async () => {

			const controller = new AbortController();
			const reason = new Error("aborted");

			const exchange = timeout(limit)(stalling())(url, { signal: controller.signal });

			controller.abort(reason);

			await expect(exchange).rejects.toBe(reason);

		});

		it("should let a signal stated by `init` supersede the one carried by the request", async () => {

			const request = new AbortController();
			const init = new AbortController();
			const reason = new Error("aborted");

			const mock = stalling();

			const exchange = timeout(limit)(mock)(
				new Request(url, { signal: request.signal }),
				{ signal: init.signal }
			);

			request.abort(new Error("ignored"));

			expect(submitted(mock)?.aborted).toBe(false);

			init.abort(reason);

			await expect(exchange).rejects.toBe(reason);

		});

		it("should keep the signal carried by the request if `init` reports an undefined signal", async () => {

			const controller = new AbortController();
			const reason = new Error("aborted");

			const exchange = timeout(limit)(stalling())(
				new Request(url, { signal: controller.signal }),
				{ signal: undefined }
			);

			controller.abort(reason);

			await expect(exchange).rejects.toBe(reason);

		});

		it("should clear the signal carried by the request if `init` states an explicit null", async () => {

			const controller = new AbortController();

			const exchange = timeout(limit)(stalling())(
				new Request(url, { signal: controller.signal }),
				{ signal: null }
			);

			controller.abort(new Error("ignored"));

			await expect(exchange).resolves.toMatchObject({ status: GatewayTimeout });

		});

	});

});
