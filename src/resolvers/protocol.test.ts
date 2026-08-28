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
import { createFetch, type Fetch } from "../index.js";
import { protocol } from "./protocol.js";
import { transport } from "./transport.js";


describe("protocol()", () => {

	describe("scheme validation", () => {

		it("should accept a well-formed lowercase scheme", async () => {
			expect(() => protocol("file", vi.fn<Fetch>())).not.toThrow();
			expect(() => protocol("z39.50r", vi.fn<Fetch>())).not.toThrow();
			expect(() => protocol("view-source", vi.fn<Fetch>())).not.toThrow();
			expect(() => protocol("svn+ssh", vi.fn<Fetch>())).not.toThrow();
		});

		it("should refuse a scheme stating a trailing colon", async () => {
			expect(() => protocol("file:", vi.fn<Fetch>())).toThrow(RangeError);
		});

		it("should refuse an uppercase scheme", async () => {
			expect(() => protocol("FILE", vi.fn<Fetch>())).toThrow(RangeError);
		});

		it("should refuse a scheme not opening with a letter", async () => {
			expect(() => protocol("", vi.fn<Fetch>())).toThrow(RangeError);
			expect(() => protocol("1file", vi.fn<Fetch>())).toThrow(RangeError);
			expect(() => protocol("+file", vi.fn<Fetch>())).toThrow(RangeError);
		});

		it("should refuse a scheme stating characters outside the registered set", async () => {
			expect(() => protocol("file_system", vi.fn<Fetch>())).toThrow(RangeError);
			expect(() => protocol("file/zip", vi.fn<Fetch>())).toThrow(RangeError);
			expect(() => protocol("file zip", vi.fn<Fetch>())).toThrow(RangeError);
		});

	});

	describe("dispatching", () => {

		it("should serve exchanges targeting the registered scheme through the handler", async () => {
			const expected = new Response();
			const handler = vi.fn<Fetch>().mockResolvedValue(expected);
			const downstream = vi.fn<Fetch>().mockResolvedValue(new Response());

			const client = createFetch(protocol("file", handler), transport(downstream));

			await expect(client("file:///data/hosts")).resolves.toBe(expected);

			expect(downstream).not.toHaveBeenCalled();
		});

		it("should relay exchanges targeting other schemes to the wrapped implementation", async () => {
			const expected = new Response();
			const handler = vi.fn<Fetch>().mockResolvedValue(new Response());
			const downstream = vi.fn<Fetch>().mockResolvedValue(expected);

			const client = createFetch(protocol("file", handler), transport(downstream));

			await expect(client("https://api.example.com/data")).resolves.toBe(expected);

			expect(handler).not.toHaveBeenCalled();
		});

		it("should relay exchanges targeting a URL stating no scheme to the wrapped implementation", async () => {
			const handler = vi.fn<Fetch>().mockResolvedValue(new Response());
			const downstream = vi.fn<Fetch>().mockResolvedValue(new Response());

			const client = createFetch(protocol("file", handler), transport(downstream));

			await client("/data/hosts");

			expect(handler).not.toHaveBeenCalled();
			expect(downstream).toHaveBeenCalled();
		});

		it("should match the scheme of the target URL disregarding case", async () => {
			const handler = vi.fn<Fetch>().mockResolvedValue(new Response());
			const downstream = vi.fn<Fetch>().mockResolvedValue(new Response());

			const client = createFetch(protocol("file", handler), transport(downstream));

			await client("FILE:///data/hosts");

			expect(handler).toHaveBeenCalled();
			expect(downstream).not.toHaveBeenCalled();
		});

		it("should serve exchanges submitted as a URL object", async () => {
			const handler = vi.fn<Fetch>().mockResolvedValue(new Response());
			const downstream = vi.fn<Fetch>().mockResolvedValue(new Response());

			const client = createFetch(protocol("file", handler), transport(downstream));

			await client(new URL("file:///data/hosts"));

			expect(handler).toHaveBeenCalled();
			expect(downstream).not.toHaveBeenCalled();
		});

		it("should serve exchanges submitted as a request object", async () => {
			const handler = vi.fn<Fetch>().mockResolvedValue(new Response());
			const downstream = vi.fn<Fetch>().mockResolvedValue(new Response());

			const client = createFetch(protocol("file", handler), transport(downstream));

			await client(new Request("file:///data/hosts"));

			expect(handler).toHaveBeenCalled();
			expect(downstream).not.toHaveBeenCalled();
		});

	});

	describe("relaying", () => {

		it("should submit the exchange to the handler as it was received", async () => {
			const handler = vi.fn<Fetch>().mockResolvedValue(new Response());

			const input = "file:///data/hosts";
			const init = { method: "PUT", body: "content" };

			const client = createFetch(protocol("file", handler), transport(vi.fn<Fetch>()));

			await client(input, init);

			expect(handler).toHaveBeenCalledWith(input, init);
		});

		it("should submit the exchange to the wrapped implementation as it was received", async () => {
			const downstream = vi.fn<Fetch>().mockResolvedValue(new Response());

			const input = "https://api.example.com/data";
			const init = { method: "PUT", body: "content" };

			const client = createFetch(protocol("file", vi.fn<Fetch>()), transport(downstream));

			await client(input, init);

			expect(downstream).toHaveBeenCalledWith(input, init);
		});

	});

	describe("stacking", () => {

		it("should serve each registered scheme through its own handler", async () => {
			const files = new Response();
			const archives = new Response();
			const network = new Response();

			const client = createFetch(
				protocol("file", vi.fn<Fetch>().mockResolvedValue(files)),
				protocol("zip", vi.fn<Fetch>().mockResolvedValue(archives)),
				transport(vi.fn<Fetch>().mockResolvedValue(network))
			);

			await expect(client("file:///data/hosts")).resolves.toBe(files);
			await expect(client("zip:///data/isced.zip")).resolves.toBe(archives);
			await expect(client("https://api.example.com/data")).resolves.toBe(network);
		});

		it("should serve a scheme through the outermost handler registered for it", async () => {
			const outer = new Response();

			const inner = vi.fn<Fetch>().mockResolvedValue(new Response());

			const client = createFetch(
				protocol("file", vi.fn<Fetch>().mockResolvedValue(outer)),
				protocol("file", inner),
				transport(vi.fn<Fetch>())
			);

			await expect(client("file:///data/hosts")).resolves.toBe(outer);

			expect(inner).not.toHaveBeenCalled();
		});

	});

});
