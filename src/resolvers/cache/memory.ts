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

/**
 * Memory-based store for cached responses.
 *
 * @module
 */

import { immutable } from "@metreeca/core/structures";
import type { Entry, Store } from "./index.core.js";


/**
 * Creates a store holding entries in memory.
 *
 * Entries live as long as the process does, so the store is bounded to keep a long-lived client from growing without
 * limit: once the limit is reached, the entries left unused the longest are given up first.
 *
 * Entries are held immutable, content included, so that the store keeps answering with what it was given whatever a
 * caller does with the entry it handed over, unlike a store that reads its entries back from bytes it wrote out.
 *
 * @param entries The number of entries to be retained, unbounded by a value less than or equal to `0`
 *
 * @returns An immutable {@link Store} holding entries in memory, giving up the least recently used beyond `entries`
 */
export function createMemoryStore(entries: number): Store {

	const limit = entries > 0 ? entries : Infinity;

	const cache = new Map<string, Entry>();

	return Object.freeze<Store>({

		async lookup(key) {

			const entry = cache.get(key);

			return entry === undefined ? undefined : touch(key, entry);

		},

		async insert(key, entry) {

			// the content is copied, as `immutable()` leaves the bytes of a typed array alone

			touch(key, immutable({ ...entry, body: entry.body.slice() }));

			// give up the least recently used entries beyond the limit

			[...cache.keys()]
				.slice(0, Math.max(0, cache.size-limit))
				.forEach(stale => cache.delete(stale));

		},

		async remove(key) {
			cache.delete(key);
		}

	});


	/**
	 * Records an entry as the most recently used one, relying on the insertion order a map preserves.
	 */
	function touch(key: string, entry: Entry): Entry {

		cache.delete(key);
		cache.set(key, entry);

		return entry;

	}

}
