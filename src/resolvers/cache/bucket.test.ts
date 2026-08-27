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

import type { Bucket } from "@metreeca/core/bucket";
import { describe, expect, it } from "vitest";
import { OK } from "../../index.js";
import { createBucketStore } from "./bucket.js";
import type { Entry } from "./index.core.js";


describe("createBucketStore()", () => {

	/**
	 * Creates an entry carrying the given content.
	 */
	function entry(content: string, headers: Readonly<Record<string, string>> = {}): Entry {

		return {

			requested: 1_000,
			received: 2_000,

			status: OK,

			headers: { "content-type": "text/plain", ...headers },
			body: new TextEncoder().encode(content)

		};

	}

	/**
	 * Creates a blob bucket retaining values in the given map.
	 */
	function mapBucket(values: Map<string, Uint8Array<ArrayBuffer>> = new Map()): Bucket {

		return {

			async get(key) {
				const value = values.get(key);
				return value === undefined ? undefined : new Blob([ value ]).stream();
			},

			async put(key, value) {
				values.set(key, new Uint8Array(await new Response(value).arrayBuffer()));
			},

			async delete(key) {
				values.delete(key);
			}

		};

	}


	it("should retrieve a stored entry as it was stored", async () => {

		const store = createBucketStore(mapBucket());
		const stored = entry("stored", { etag: "\"v1\"" });

		await store.insert("key", stored);

		await expect(store.lookup("key")).resolves.toStrictEqual(stored);

	});

	it("should report no entry for an unknown key", async () => {

		await expect(createBucketStore(mapBucket()).lookup("key")).resolves.toBeUndefined();

	});

	it("should replace a stored entry", async () => {

		const store = createBucketStore(mapBucket());
		const replaced = entry("replaced");

		await store.insert("key", entry("stored"));
		await store.insert("key", replaced);

		await expect(store.lookup("key")).resolves.toStrictEqual(replaced);

	});

	it("should give up a removed entry", async () => {

		const store = createBucketStore(mapBucket());

		await store.insert("key", entry("stored"));
		await store.remove("key");

		await expect(store.lookup("key")).resolves.toBeUndefined();

	});

	it("should retrieve an entry carrying no content", async () => {

		const store = createBucketStore(mapBucket());
		const stored = entry("");

		await store.insert("key", stored);

		await expect(store.lookup("key")).resolves.toStrictEqual(stored);

	});

	it("should retrieve an entry whose content carries newlines", async () => {

		const store = createBucketStore(mapBucket());
		const stored = entry("first\nsecond\nthird");

		await store.insert("key", stored);

		await expect(store.lookup("key")).resolves.toStrictEqual(stored);

	});

	it("should report no entry for a value carrying no metadata line", async () => {

		const values = new Map<string, Uint8Array<ArrayBuffer>>([
			[ "key", new TextEncoder().encode("malformed") ]
		]);

		await expect(createBucketStore(mapBucket(values)).lookup("key")).resolves.toBeUndefined();

	});

});
