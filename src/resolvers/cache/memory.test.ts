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

import { describe, expect, it } from "vitest";
import { OK } from "../../index.js";
import type { Entry } from "./index.core.js";
import { createMemoryStore } from "./memory.js";


describe("createMemoryStore()", () => {

	/**
	 * Creates an entry carrying the given content.
	 */
	function entry(content: string): Entry {

		return {

			requested: 1_000,
			received: 2_000,

			url: "https://api.example.com/data",

			status: OK,
			statusText: "OK",

			headers: {},
			body: new TextEncoder().encode(content)

		};

	}


	it("should retrieve a stored entry as it was stored", async () => {

		const store = createMemoryStore(0);
		const stored = entry("stored");

		await store.insert("key", stored);

		await expect(store.lookup("key")).resolves.toEqual(stored);

	});

	it("should retrieve a stored entry as an immutable value", async () => {

		const store = createMemoryStore(0);

		await store.insert("key", entry("stored"));

		const stored = await store.lookup("key");

		expect(Object.isFrozen(stored)).toBe(true);
		expect(Object.isFrozen(stored?.headers)).toBe(true);

	});

	it("should retain a stored entry as it was stored whatever the caller does with it", async () => {

		const store = createMemoryStore(0);
		const stored = entry("stored");

		await store.insert("key", stored);

		stored.body.fill(0); // the caller is free to reuse the content it handed over

		await expect(store.lookup("key").then(entry => entry && new TextDecoder().decode(entry.body)))
			.resolves.toBe("stored");

	});

	it("should report no entry for an unknown key", async () => {

		await expect(createMemoryStore(0).lookup("key")).resolves.toBeUndefined();

	});

	it("should replace a stored entry", async () => {

		const store = createMemoryStore(0);
		const replaced = entry("replaced");

		await store.insert("key", entry("stored"));
		await store.insert("key", replaced);

		await expect(store.lookup("key")).resolves.toEqual(replaced);

	});

	it("should give up a removed entry", async () => {

		const store = createMemoryStore(0);

		await store.insert("key", entry("stored"));
		await store.remove("key");

		await expect(store.lookup("key")).resolves.toBeUndefined();

	});

	it("should succeed on removing an unknown key", async () => {

		await expect(createMemoryStore(0).remove("key")).resolves.toBeUndefined();

	});

	it("should give up the least recently used entries beyond the limit", async () => {

		const store = createMemoryStore(2);

		await store.insert("one", entry("one"));
		await store.insert("two", entry("two"));
		await store.insert("three", entry("three"));

		await expect(store.lookup("one")).resolves.toBeUndefined();
		await expect(store.lookup("two")).resolves.toBeDefined();
		await expect(store.lookup("three")).resolves.toBeDefined();

	});

	it("should count a retrieval as a use", async () => {

		const store = createMemoryStore(2);

		await store.insert("one", entry("one"));
		await store.insert("two", entry("two"));

		await store.lookup("one"); // leaves `two` as the least recently used one

		await store.insert("three", entry("three"));

		await expect(store.lookup("one")).resolves.toBeDefined();
		await expect(store.lookup("two")).resolves.toBeUndefined();

	});

	it.each([ 0, -1 ])("should retain every entry with a limit of %i", async entries => {

		const store = createMemoryStore(entries);

		await store.insert("one", entry("one"));
		await store.insert("two", entry("two"));
		await store.insert("three", entry("three"));

		await expect(store.lookup("one")).resolves.toBeDefined();

	});

});
