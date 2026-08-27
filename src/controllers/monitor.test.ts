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
import { type Fetch, InternalServerError } from "../index.js";
import { monitor } from "./monitor.js";


const url = "https://api.example.com/data";


/**
 * Creates a logger recording the entries reported to it.
 */
function recording(): {

	readonly info: Mock<(message: string) => void>;
	readonly warn: Mock<(message: string) => void>;

} {

	return { info: vi.fn(), warn: vi.fn() };

}

/**
 * Creates a mock fetch answering with the given response.
 */
function serving(response: Response = new Response()): Mock<Fetch> {

	return vi.fn<Fetch>().mockResolvedValue(response);

}

/**
 * Creates a response reporting itself as served from a cache, under the given `Age` field value.
 */
function cached(age: string): Response {

	return new Response(null, { headers: { "Age": age } });

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("monitor()", () => {

	describe("malformed targets", () => {

		it("should report a malformed target as a warning", async () => {

			const logger = recording();

			await monitor(logger)(serving())("not a URL");

			expect(logger.warn).toHaveBeenCalledWith("GET not a URL >> malformed resource URL");

		});

		it("should answer a malformed target with a network error", async () => {

			const response = await monitor(recording())(serving())("not a URL");

			expect(response.type).toBe("error");

		});

		it("should not relay an exchange stating a malformed target", async () => {

			const mock = serving();
			const logger = recording();

			await monitor(logger)(mock)("not a URL");

			expect(mock).not.toHaveBeenCalled();
			expect(logger.info).not.toHaveBeenCalled();

		});

	});

	describe("relayed exchanges", () => {

		it("should report the method and the target of an exchange", async () => {

			const logger = recording();

			await monitor(logger)(serving())(url);

			expect(logger.info).toHaveBeenCalledWith(`GET ${url}`);

		});

		it("should report the method stated by the exchange options", async () => {

			const logger = recording();

			await monitor(logger)(serving())(url, { method: "POST" });

			expect(logger.info).toHaveBeenCalledWith(`POST ${url}`);

		});

		it("should report the method in uppercase", async () => {

			const logger = recording();

			await monitor(logger)(serving())(url, { method: "post" });

			expect(logger.info).toHaveBeenCalledWith(`POST ${url}`);

		});

		it("should report the method and the target stated by a request input", async () => {

			const logger = recording();

			await monitor(logger)(serving())(new Request(url, { method: "PUT" }));

			expect(logger.info).toHaveBeenCalledWith(`PUT ${url}`);

		});

		it("should report the method stated by the exchange options over the one stated by a request input", async () => {

			const logger = recording();

			await monitor(logger)(serving())(new Request(url, { method: "PUT" }), { method: "POST" });

			expect(logger.info).toHaveBeenCalledWith(`POST ${url}`);

		});

		it("should clip an overlong target", async () => {

			const long = `https://api.example.com/${"x".repeat(100)}`;
			const logger = recording();

			await monitor(logger)(serving())(long);

			expect(logger.info).toHaveBeenCalledWith(`GET ${long.slice(0, 79)}…`);

		});

		it("should relay exchanges as they stand", async () => {

			const response = new Response();
			const mock = serving(response);
			const init: RequestInit = { method: "POST", body: "content" };

			await expect(monitor(recording())(mock)(url, init)).resolves.toBe(response);

			expect(mock).toHaveBeenCalledWith(url, init);

		});

	});

	describe("answered exchanges", () => {

		it("should report an unsuccessful response as a warning", async () => {

			const logger = recording();

			const mock = serving(new Response(null, {
				status: InternalServerError,
				statusText: "Internal Server Error"
			}));

			await monitor(logger)(mock)(url);

			expect(logger.warn).toHaveBeenCalledWith(`GET ${url} >> 500 Internal Server Error`);

		});

		it("should report a response served from a cache", async () => {

			const logger = recording();

			await monitor(logger)(serving(cached("0")))(url);

			expect(logger.info).toHaveBeenLastCalledWith(`GET ${url} >> 200 Retrieved From Cache`);

		});

		it("should report a response an upstream cache aged", async () => {

			const logger = recording();

			await monitor(logger)(serving(cached("30")))(url);

			expect(logger.info).toHaveBeenLastCalledWith(`GET ${url} >> 200 Retrieved From Cache`);

		});

		it("should report a successful response served by the origin with the single entry stating the exchange", async () => {

			const logger = recording();

			await monitor(logger)(serving())(url);

			expect(logger.info).toHaveBeenCalledTimes(1);
			expect(logger.warn).not.toHaveBeenCalled();

		});

	});

});
