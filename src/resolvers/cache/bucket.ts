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
 * Bucket-backed store for cached responses.
 *
 * @module
 */

import type { Bucket } from "@metreeca/core/bucket";
import type { Entry, Store } from "./index.core.js";


/**
 * Creates a store holding entries in a bucket.
 *
 * Entries are held as opaque bytes, a metadata line followed by the content, so that a service storing objects rather
 * than structured values backs the cache without knowing what an entry is made of.
 *
 * @param bucket The bucket entries are to be held in
 *
 * @returns An immutable {@link Store} holding entries in `bucket`
 */
export function createBucketStore(bucket: Bucket): Store {

	return Object.freeze<Store>({

		async lookup(key) {

			const value = await bucket.get(key);

			return value === undefined ? undefined : decode(value);

		},

		async insert(key, entry) {
			await bucket.put(key, encode(entry));
		},

		async remove(key) {
			await bucket.delete(key);
		}

	});

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Encodes an entry as a stream over a JSON metadata line, a newline and the content.
 *
 * The metadata is JSON, whose escaping leaves no raw newline in the line, so the first newline byte always marks
 * the start of the content, whatever bytes the content itself carries.
 */
function encode({ requested, received, status, headers, body, variants }: Entry): ReadableStream<Uint8Array<ArrayBuffer>> {

	return new Blob([`${JSON.stringify({ requested, received, status, headers, variants })}\n`, body]).stream();

}

/**
 * Decodes an entry, reporting `undefined` if the value doesn't carry the expected metadata line.
 */
async function decode(value: ReadableStream<Uint8Array<ArrayBuffer>>): Promise<undefined | Entry> {

	const bytes = new Uint8Array(await new Response(value).arrayBuffer());
	const split = bytes.indexOf(0x0A);

	return split < 0 ? undefined : {
		...JSON.parse(new TextDecoder().decode(bytes.subarray(0, split))),
		body: bytes.slice(split+1)
	};

}
