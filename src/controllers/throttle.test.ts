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
import { type Fetch } from "../index.js";
import { throttle } from "./throttle.js";


// pacing and adaptation are covered by the throttle these tests are built on; what is exercised here is the middleware
// layered over it, that is the classification of transient statuses, the retry budget and the reading of `Retry-After`

const url = "https://api.example.com/data";


/**
 * Creates a mock fetch answering with the given responses in order.
 *
 * Exchanges beyond the scripted ones are answered with `200 OK`, so that an unexpected extra exchange surfaces as a
 * failed assertion on the number of attempts rather than as a retried failure.
 */
function serving(...responses: readonly Response[]): Mock<Fetch> {

	return responses.reduce((mock, response) => mock.mockResolvedValueOnce(response),
		vi.fn<Fetch>().mockResolvedValue(new Response())
	);

}

/**
 * Creates a response failing on the given status, optionally asking for a retry delay.
 */
function failing(status: number, after?: string): Response {

	return new Response(null, { status, headers: after === undefined ? {} : { "Retry-After": after } });

}

/**
 * Runs a task, reporting the time it took to complete in milliseconds.
 */
async function elapsed(task: () => Promise<unknown>): Promise<number> {

	const start = Date.now();

	await task();

	return Date.now()-start;

}


describe("throttle()", () => {

	describe("exchanges", () => {

		it("should relay successful responses", async () => {

			const response = new Response();
			const mock = serving(response);

			await expect(throttle()(mock)(url)).resolves.toBe(response);

			expect(mock).toHaveBeenCalledTimes(1);

		});

		it("should relay requests to the wrapped implementation", async () => {

			const mock = serving(new Response());
			const init: RequestInit = { method: "POST", body: "payload" };

			await throttle()(mock)(url, init);

			expect(mock).toHaveBeenCalledWith(url, init);

		});

		it("should relay transport failures without retrying", async () => {

			const failure = new TypeError("Failed to fetch");
			const mock = vi.fn<Fetch>().mockRejectedValue(failure);

			await expect(throttle({ attempts: 3 })(mock)(url)).rejects.toBe(failure);

			expect(mock).toHaveBeenCalledTimes(1);

		});

	});

	describe("transient failures", () => {

		it.each([ 408, 429, 500, 503, 599 ])("should retry exchanges failing on %i", async status => {

			const response = new Response();
			const mock = serving(failing(status), response);

			await expect(throttle({ attempts: 2 })(mock)(url)).resolves.toBe(response);

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it.each([ 302, 400, 401, 404, 451 ])("should relay exchanges failing on %i as they stand", async status => {

			const response = failing(status);
			const mock = serving(response);

			await expect(throttle({ attempts: 3 })(mock)(url)).resolves.toBe(response);

			expect(mock).toHaveBeenCalledTimes(1);

		});

		it("should reissue the request as it was submitted on every attempt", async () => {

			const mock = serving(failing(503), new Response());
			const init: RequestInit = { method: "POST", body: "payload" };

			await throttle({ attempts: 2 })(mock)(url, init);

			expect(mock.mock.calls).toEqual([ [ url, init ], [ url, init ] ]);

		});

	});

	describe("retry budget", () => {

		it("should attempt each exchange once by default", async () => {

			const response = failing(503);
			const mock = serving(response);

			await expect(throttle()(mock)(url)).resolves.toBe(response);

			expect(mock).toHaveBeenCalledTimes(1);

		});

		it("should relay the last attempt of an exhausted exchange", async () => {

			const response = failing(503);
			const mock = serving(failing(503), failing(503), response);

			await expect(throttle({ attempts: 3 })(mock)(url)).resolves.toBe(response);

			expect(mock).toHaveBeenCalledTimes(3);

		});

		it("should retry without limit if no budget is set", async () => {

			const response = new Response();
			const mock = serving(failing(503), failing(503), failing(503), response);

			await expect(throttle({ attempts: 0 })(mock)(url)).resolves.toBe(response);

			expect(mock).toHaveBeenCalledTimes(4);

		});

	});

	describe("retry delays", () => {

		// the delay asked for is capped by `maximum`, so that an exchange observes it without holding up the suite

		it("should honour a delay asked for as delta seconds", async () => {

			const mock = serving(failing(503, "1"), new Response());

			const wait = await elapsed(() => throttle({ maximum: 100, attempts: 2 })(mock)(url));

			expect(wait).toBeGreaterThanOrEqual(90);
			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should honour a delay asked for as an HTTP date", async () => {

			const mock = serving(failing(503, new Date(Date.now()+2000).toUTCString()), new Response());

			const wait = await elapsed(() => throttle({ maximum: 100, attempts: 2 })(mock)(url));

			expect(wait).toBeGreaterThanOrEqual(90);
			expect(mock).toHaveBeenCalledTimes(2);

		});

		it.each([

			[ "no delay is asked for", undefined ],
			[ "the delay asked for is malformed", "soon" ],
			[ "the delay asked for has elapsed", new Date(2000, 0, 1).toUTCString() ]

		])("should retry at once if %s", async (_, after) => {

			const mock = serving(failing(503, after), new Response());

			const wait = await elapsed(() => throttle({ maximum: 100, attempts: 2 })(mock)(url));

			expect(wait).toBeLessThan(90);
			expect(mock).toHaveBeenCalledTimes(2);

		});

	});

});
