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

import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import { xsrf } from "./xsrf.js";
import { type Fetch, type Middleware } from "../index.js";


/**
 * The origin the document under test is served from.
 */
const Origin = "https://app.example.com";


/**
 * Stands in for the document the client runs in, as served from `origin` and carrying `cookie`.
 *
 * Globals are restored after every test, so that an exchange running outside a browser is observed as it is.
 */
function loaded({ origin = Origin, cookie = "XSRF-TOKEN=token" }: {

	origin?: string,
	cookie?: string

} = {}): void {

	vi.stubGlobal("location", { origin });
	vi.stubGlobal("document", { cookie });

}

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

afterEach(() => vi.unstubAllGlobals());


describe("xsrf()", () => {

	describe("protected exchanges", () => {

		it.each([ "POST", "PUT", "PATCH", "DELETE" ])("should protect unsafe %s exchanges", async method => {

			loaded();

			const request = await exchange(xsrf(), `${ Origin }/data`, { method });

			expect(request.headers.get("X-XSRF-TOKEN")).toBe("token");

		});

		it.each([ "GET", "HEAD", "OPTIONS" ])("should leave safe %s exchanges unprotected", async method => {

			loaded();

			const request = await exchange(xsrf(), `${ Origin }/data`, { method });

			expect(request.headers.has("X-XSRF-TOKEN")).toBeFalsy();

		});

		it("should match the method however it is spelled", async () => {

			loaded();

			const request = await exchange(xsrf(), `${ Origin }/data`, { method: "post" });

			expect(request.headers.get("X-XSRF-TOKEN")).toBe("token");

		});

		it("should leave cross-origin exchanges unprotected", async () => {

			loaded();

			const request = await exchange(xsrf(), "https://third.example.net/data", { method: "POST" });

			expect(request.headers.has("X-XSRF-TOKEN")).toBeFalsy();

		});

		it("should leave exchanges with a sibling origin unprotected", async () => {

			loaded();

			const request = await exchange(xsrf(), "https://api.example.com/data", { method: "POST" });

			expect(request.headers.has("X-XSRF-TOKEN")).toBeFalsy();

		});

		it("should preserve a token stated by the exchange", async () => {

			loaded();

			const request = await exchange(xsrf(), `${ Origin }/data`, {
				method: "POST",
				headers: { "X-XSRF-TOKEN": "stated" }
			});

			expect(request.headers.get("X-XSRF-TOKEN")).toBe("stated");

		});

		it("should report a missing document as a rejection", async () => {

			const mock = serving(new Response());

			await expect(xsrf()(mock)(`${ Origin }/data`, { method: "POST" })).rejects.toThrow(ReferenceError);

			expect(mock).not.toHaveBeenCalled();

		});

	});

	describe("document token", () => {

		it("should read the token among other cookies", async () => {

			loaded({ cookie: "session=opaque; XSRF-TOKEN=token; theme=dark" });

			const request = await exchange(xsrf(), `${ Origin }/data`, { method: "POST" });

			expect(request.headers.get("X-XSRF-TOKEN")).toBe("token");

		});

		it("should read a quoted token", async () => {

			loaded({ cookie: "XSRF-TOKEN=\"token\"" });

			const request = await exchange(xsrf(), `${ Origin }/data`, { method: "POST" });

			expect(request.headers.get("X-XSRF-TOKEN")).toBe("token");

		});

		it.each([

			[ "a cookie whose name ends in the token name", "MY-XSRF-TOKEN=lookalike; XSRF-TOKEN=token" ],
			[ "a cookie whose value states the token name", "session=XSRF-TOKEN=lookalike; XSRF-TOKEN=token" ]

		])("should read the token past %s", async (_, cookie) => {

			loaded({ cookie });

			const request = await exchange(xsrf(), `${ Origin }/data`, { method: "POST" });

			expect(request.headers.get("X-XSRF-TOKEN")).toBe("token");

		});

		it.each([

			[ "carries no cookie", "" ],
			[ "carries no token", "session=opaque" ],
			[ "carries an empty token", "XSRF-TOKEN=" ]

		])("should leave the exchange unprotected where the document %s", async (_, cookie) => {

			loaded({ cookie });

			const request = await exchange(xsrf(), `${ Origin }/data`, { method: "POST" });

			expect(request.headers.has("X-XSRF-TOKEN")).toBeFalsy();

		});

		it("should read the token stated on every exchange", async () => {

			const mock = serving(new Response(), new Response());
			const client = xsrf()(mock);

			loaded({ cookie: "XSRF-TOKEN=first" });
			await client(`${ Origin }/data`, { method: "POST" });

			loaded({ cookie: "XSRF-TOKEN=second" });
			await client(`${ Origin }/data`, { method: "POST" });

			const [ first, second ] = mock.mock.calls.map(([ input, init ]) => new Request(input, init));

			expect(first.headers.get("X-XSRF-TOKEN")).toBe("first");
			expect(second.headers.get("X-XSRF-TOKEN")).toBe("second");

		});

	});

});
