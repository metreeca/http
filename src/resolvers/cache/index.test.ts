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
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
	Accepted,
	Created,
	type Fetch,
	Gone,
	InternalServerError,
	MovedPermanently,
	NoContent,
	NonAuthoritativeInformation,
	NotFound,
	NotImplemented,
	NotModified,
	OK,
	PartialContent,
	ResetContent
} from "../../index.js";
import {
	age,
	capture,
	conditional,
	createStore,
	type Entry,
	lifetime,
	refresh,
	replay,
	resource,
	skipping,
	stale,
	storable,
	type Store,
	variant
} from "./index.core.js";
import { cache } from "./index.js";
import { createMemoryStore } from "./memory.js";


// ageing and freshness are read off the clock, so every test runs on fake timers: the instant an exchange completed is
// stated outright and elapsed time by advancing them, and the exchanges the middleware is expected to relay are counted
// on the mock rather than timed

const at = 100_000;
const url = "https://api.example.com/data";


/**
 * Creates an entry, defaulting to one retrieved from `url` with no round trip and stating no header field.
 */
function entry({

	requested = at,
	received = at,

	status = OK,
	statusText = "",

	headers = {},
	content = ""

}: {

	readonly requested?: number;
	readonly received?: number;
	readonly status?: number;
	readonly statusText?: string;
	readonly headers?: Readonly<Record<string, undefined | string>>;
	readonly content?: string;

} = {}): Entry {

	return { requested, received, url, status, statusText, headers, body: new TextEncoder().encode(content) };

}

/**
 * Reports the content of a response.
 */
async function text(response: Response | Promise<Response>): Promise<string> {

	return (await response).text();

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(at);
});

afterEach(() => {
	vi.useRealTimers();
});


describe("cache()", () => {

	// the middleware answers the exchange from end to end: routing, normalisation, freshness, revalidation and storage
	// are specified here, while keying, replay and the freshness computation are specified against the symbols
	// answering for them

	/**
	 * Creates a mock fetch answering with the given responses in order.
	 *
	 * Exchanges beyond the scripted ones are answered with `200 OK`, so that an unexpected extra exchange surfaces as a
	 * failed assertion on the number of exchanges rather than as an unexplained payload.
	 */
	function serving(...responses: readonly Response[]): Mock<Fetch> {

		return responses.reduce((mock, response) => mock.mockResolvedValueOnce(response),
			vi.fn<Fetch>().mockResolvedValue(new Response())
		);

	}

	/**
	 * Creates a response the origin server states as fresh for the given time, in seconds.
	 */
	function fresh(

		seconds: number,
		body: BodyInit | null = "stored",
		headers: Readonly<Record<string, string>> = {}

	): Response {

		return new Response(body, { headers: { "Cache-Control": `max-age=${seconds}`, ...headers } });

	}

	/**
	 * Creates a `304` response, optionally refreshing the stored one with the given header fields.
	 */
	function unmodified(headers: Readonly<Record<string, string>> = {}): Response {

		return new Response(null, { status: NotModified, headers });

	}

	/**
	 * Creates an entry store retaining entries in the given map.
	 */
	function mapStore(entries: Map<string, Entry>): Store {

		return {

			async lookup(key) {
				return entries.get(key);
			},

			async insert(key, entry) {
				entries.set(key, entry);
			},

			async remove(key) {
				entries.delete(key);
			}

		};

	}

	/**
	 * Creates a client caching in the given store, relaying to the given fetch implementation what it can't answer.
	 */
	function caching(fetch: Fetch, store: Store = createMemoryStore(0), ttl: number = 0): Fetch {

		return cache({ store, ttl })(fetch);

	}


	describe("routing", () => {

		it.each([ "file:///data.json", "data:text/plain,content" ])(
			"should relay %s exchanges untouched", async target => {

				const mock = serving(fresh(60, "stored"), fresh(60, "updated"));
				const client = caching(mock);

				await client(target);

				await expect(text(client(target))).resolves.toBe("updated");

				expect(mock).toHaveBeenCalledTimes(2);

			});

		it("should answer `HEAD` exchanges from the store", async () => {

			const mock = serving(fresh(60, null));
			const client = caching(mock);

			await client(url, { method: "HEAD" });
			await client(url, { method: "HEAD" });

			expect(mock).toHaveBeenCalledOnce();

		});

		it.each([ "POST", "PUT", "PATCH", "DELETE" ])("should relay %s exchanges as they stand", async method => {

			const mock = serving(fresh(60), fresh(60));
			const client = caching(mock);

			await client(url, { method });
			await client(url, { method });

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should invalidate the entries a successful unsafe exchange reports as changed", async () => {

			const mock = serving(fresh(60, "stored"), new Response(null, { status: NoContent }), fresh(60, "updated"));
			const client = caching(mock);

			await client(url);
			await client(url, { method: "DELETE" });

			await expect(text(client(url))).resolves.toBe("updated");

			expect(mock).toHaveBeenCalledTimes(3);

		});

	});

	describe("range requests", () => {

		it("should relay an exchange stating a range", async () => {

			const mock = serving(fresh(60, "stored"), fresh(60, "updated"));
			const client = caching(mock);
			const headers = { Range: "bytes=0-3" };

			await client(url, { headers });

			await expect(text(client(url, { headers }))).resolves.toBe("updated");

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should not answer an exchange stating a range from a stored response", async () => {

			const mock = serving(fresh(60, "stored"), fresh(60, "partial"));
			const client = caching(mock);

			await client(url);

			await expect(text(client(url, { headers: { Range: "bytes=0-3" } }))).resolves.toBe("partial");

			expect(mock).toHaveBeenCalledTimes(2);

		});

	});

	describe("normalised requests", () => {

		it("should key the exchange on the method stated by the options", async () => {

			const mock = serving(fresh(60, "stored"), fresh(60, "updated"));
			const client = caching(mock);

			await client(url);

			await expect(text(client(new Request(url), { method: "HEAD" }))).resolves.toBe("updated");

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should select the variant on the header fields stated by the options", async () => {

			const mock = serving(fresh(60, "json", { Vary: "Accept" }), fresh(60, "text", { Vary: "Accept" }));
			const client = caching(mock);

			await client(url, { headers: { Accept: "application/json" } });

			await expect(text(client(url, { headers: { Accept: "text/plain" } }))).resolves.toBe("text");

			expect(mock).toHaveBeenCalledTimes(2);

		});

	});

	describe("variants", () => {

		it("should tell apart requests differing by a header field stated as varying", async () => {

			const mock = serving(fresh(60, "json", { Vary: "Accept" }), fresh(60, "text", { Vary: "Accept" }));
			const client = caching(mock);

			await client(new Request(url, { headers: { Accept: "application/json" } }));

			await expect(text(client(new Request(url, { headers: { Accept: "text/plain" } }))))
				.resolves.toBe("text");

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should share one entry among requests agreeing on the header fields stated as varying", async () => {

			const mock = serving(fresh(60, "json", { Vary: "Accept" }));
			const client = caching(mock);

			await client(new Request(url, { headers: { Accept: "application/json" } }));

			await expect(text(client(new Request(url, { headers: { Accept: "application/json" } }))))
				.resolves.toBe("json");

			expect(mock).toHaveBeenCalledOnce();

		});

		it("should store the content of a varying response under its variant alone", async () => {

			const store = createMemoryStore(0);

			await caching(serving(fresh(60, "json", { Vary: "Accept" })), store)(
				new Request(url, { headers: { Accept: "application/json" } })
			);

			await expect(store.lookup(resource(url, "GET")).then(entry => entry?.body.length)).resolves.toBe(0);

		});

		it("should give up the variants an unsafe exchange invalidates", async () => {

			const mock = serving(
				fresh(60, "json", { Vary: "Accept" }),
				fresh(60, "text", { Vary: "Accept" }),
				new Response(null, { status: NoContent }),
				fresh(60, "updated json", { Vary: "Accept" }),
				fresh(60, "updated text", { Vary: "Accept" })
			);

			const client = caching(mock);

			await client(url, { headers: { Accept: "application/json" } });
			await client(url, { headers: { Accept: "text/plain" } });
			await client(url, { method: "DELETE" });
			await client(url, { headers: { Accept: "application/json" } });

			await expect(text(client(url, { headers: { Accept: "text/plain" } }))).resolves.toBe("updated text");

			expect(mock).toHaveBeenCalledTimes(5);

		});

	});

	describe("freshness", () => {

		it("should relay exchanges nothing is stored for", async () => {

			const mock = serving(fresh(60, "content"));

			await expect(text(caching(mock)(url))).resolves.toBe("content");

			expect(mock).toHaveBeenCalledOnce();

		});

		it("should answer from the store while the stored response is fresh", async () => {

			const mock = serving(fresh(60, "stored"));
			const client = caching(mock);

			await client(url);

			vi.advanceTimersByTime(30_000);

			await expect(text(client(url))).resolves.toBe("stored");

			expect(mock).toHaveBeenCalledOnce();

		});

		it("should relay exchanges once the stored response goes stale", async () => {

			const mock = serving(fresh(60, "stored"), fresh(60, "updated"));
			const client = caching(mock);

			await client(url);

			vi.advanceTimersByTime(61_000);

			await expect(text(client(url))).resolves.toBe("updated");

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should state the age of a replayed response", async () => {

			const client = caching(serving(fresh(60, "stored")));

			await client(url);

			await expect(client(url).then(response => response.headers.get("Age"))).resolves.toBe("0");

		});

		it("should state no age for a relayed response", async () => {

			const client = caching(serving(fresh(60, "stored")));

			await expect(client(url).then(response => response.headers.get("Age"))).resolves.toBeNull();

		});

		it("should relay concurrent exchanges for one target on their own", async () => {

			const mock = serving(fresh(60, "stored"), fresh(60, "updated"));
			const client = caching(mock);

			await Promise.all([ client(url), client(url) ]);

			expect(mock).toHaveBeenCalledTimes(2);

		});

	});

	describe("revalidation", () => {

		it("should revalidate stale entries with the stored validators", async () => {

			const modified = "Wed, 26 Aug 2026 10:00:00 GMT";

			const mock = serving(fresh(0, "stored", { ETag: "\"v1\"", "Last-Modified": modified }), unmodified());
			const client = caching(mock);

			await client(url);
			await client(url);

			const [ , [ input ] ] = mock.mock.calls;

			expect(new Request(input).headers.get("If-None-Match")).toBe("\"v1\"");
			expect(new Request(input).headers.get("If-Modified-Since")).toBe(modified);

		});

		it("should relay stale entries carrying no validator", async () => {

			const mock = serving(fresh(0, "stored"), fresh(60, "updated"));
			const client = caching(mock);

			await client(url);

			await expect(text(client(url))).resolves.toBe("updated");

			const [ , [ input ] ] = mock.mock.calls;

			expect(new Request(input).headers.get("If-None-Match")).toBeNull();

		});

		it("should serve the stored content again on a `304`", async () => {

			const client = caching(serving(fresh(0, "stored", { ETag: "\"v1\"" }), unmodified()));

			await client(url);

			const response = await client(url);

			expect(response.status).toBe(OK);

			await expect(text(response)).resolves.toBe("stored");

		});

		it("should refresh the stored response on a `304`", async () => {

			const mock = serving(
				fresh(0, "stored", { ETag: "\"v1\"" }),
				unmodified({ "Cache-Control": "max-age=60" })
			);

			const client = caching(mock);

			await client(url);
			await client(url);

			vi.advanceTimersByTime(30_000);

			await expect(text(client(url))).resolves.toBe("stored");

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should restate the age of a response replayed after revalidation", async () => {

			const client = caching(serving(fresh(0, "stored", { ETag: "\"v1\"", Age: "60" }), unmodified()));

			await client(url);

			await expect(client(url).then(response => response.headers.get("Age"))).resolves.toBe("0");

		});

		it("should replace the stored response when revalidation delivers a new one", async () => {

			const mock = serving(fresh(0, "stored", { ETag: "\"v1\"" }), fresh(60, "updated"));
			const client = caching(mock);

			await client(url);
			await client(url);

			await expect(text(client(url))).resolves.toBe("updated");

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should report a failed revalidation as it stands", async () => {

			const client = caching(serving(
				fresh(0, "stored", { ETag: "\"v1\"" }),
				new Response("failed", { status: InternalServerError })
			));

			await client(url);

			const response = await client(url);

			expect(response.status).toBe(InternalServerError);

			await expect(text(response)).resolves.toBe("failed");

		});

	});

	describe("stored responses", () => {

		it.each([

			[ "state `no-store`", new Response("stored", { headers: { "Cache-Control": "no-store" } }) ],
			[ "state `Vary: *`", fresh(60, "stored", { Vary: "*" }) ],
			[ "set a cookie", fresh(60, "stored", { "Set-Cookie": "session=token" }) ],
			[ "are partial", new Response("stored", {
				status: PartialContent,
				headers: { "Cache-Control": "max-age=60" }
			}) ],
			[ "are unsuccessful", new Response("stored", { status: InternalServerError }) ]

		])("should not store responses that %s", async (_, response) => {

			const mock = serving(response, fresh(60, "updated"));
			const client = caching(mock);

			await client(url);

			await expect(text(client(url))).resolves.toBe("updated");

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should store responses to authenticated requests", async () => {

			const mock = serving(fresh(60, "stored"));
			const client = caching(mock);
			const request = new Request(url, { headers: { Authorization: "Bearer token" } });

			await client(request);

			await expect(text(client(request))).resolves.toBe("stored");

			expect(mock).toHaveBeenCalledOnce();

		});

		it("should store responses stating `private`", async () => {

			const mock = serving(new Response("stored", { headers: { "Cache-Control": "private, max-age=60" } }));
			const client = caching(mock);

			await client(url);

			await expect(text(client(url))).resolves.toBe("stored");

			expect(mock).toHaveBeenCalledOnce();

		});

	});

	describe("options", () => {

		it("should hold entries in a given store", async () => {

			const entries = new Map<string, Entry>();

			await caching(serving(fresh(60)), mapStore(entries))(url);

			expect(entries.size).toBe(1);

		});

		it("should cap the freshness lifetime under a given ttl", async () => {

			const mock = serving(fresh(600, "stored"), fresh(600, "updated"));
			const client = caching(mock, createMemoryStore(0), 60_000);

			await client(url);

			vi.advanceTimersByTime(61_000);

			await expect(text(client(url))).resolves.toBe("updated");

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should assume a given ttl where the origin server states no freshness", async () => {

			const mock = serving(new Response("stored"), new Response("updated"));
			const client = caching(mock, createMemoryStore(0), 60_000);

			await client(url);

			await expect(text(client(url))).resolves.toBe("stored");

			expect(mock).toHaveBeenCalledOnce();

		});

		it("should assume a share of the age a `Last-Modified` reports where no freshness is stated", async () => {

			const modified = new Date(at-600_000).toUTCString();

			const mock = serving(
				new Response("stored", { headers: { "Last-Modified": modified } }),
				new Response("updated")
			);

			const client = caching(mock);

			await client(url);

			vi.advanceTimersByTime(30_000);

			await expect(text(client(url))).resolves.toBe("stored");

			vi.advanceTimersByTime(31_000);

			await expect(text(client(url))).resolves.toBe("updated");

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should relay the exchanges a skipped pattern selects", async () => {

			const mock = serving(fresh(60, "stored"), fresh(60, "updated"));
			const client = cache({ skip: "https://api.example.com/**" })(mock);

			await client(url);

			await expect(text(client(url))).resolves.toBe("updated");

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should relay the exchanges any of several skipped patterns selects", async () => {

			const mock = serving(fresh(60, "stored"), fresh(60, "updated"));
			const client = cache({ skip: [ "https://api.example.com/other", url ] })(mock);

			await client(url);

			await expect(text(client(url))).resolves.toBe("updated");

			expect(mock).toHaveBeenCalledTimes(2);

		});

		it("should cache the exchanges no skipped pattern selects", async () => {

			const mock = serving(fresh(60, "stored"));
			const client = cache({ skip: "https://api.example.com/other" })(mock);

			await client(url);

			await expect(text(client(url))).resolves.toBe("stored");

			expect(mock).toHaveBeenCalledOnce();

		});

		it("should invalidate the entries a skipped unsafe exchange reports as changed", async () => {

			const other = "https://api.example.com/other";

			const mock = serving(
				fresh(60, "stored"),
				new Response(null, { status: NoContent, headers: { "Content-Location": other } }),
				fresh(60, "updated")
			);

			const client = cache({ skip: url })(mock);

			await client(other);
			await client(url, { method: "DELETE" });

			await expect(text(client(other))).resolves.toBe("updated");

			expect(mock).toHaveBeenCalledTimes(3);

		});

	});

});

describe("createStore()", () => {

	/**
	 * Creates a blob bucket retaining values in the given map.
	 */
	function mapBucket(values: Map<string, Uint8Array<ArrayBuffer>>): Bucket {

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


	it("should take a given store as it stands", async () => {

		const given = createStore(0);

		expect(createStore(given)).toBe(given);

	});

	it("should hold entries in a given bucket", async () => {

		const values = new Map<string, Uint8Array<ArrayBuffer>>();

		await createStore(mapBucket(values)).insert("key", entry());

		expect(values.size).toBe(1);

	});

	it.each([

		[ "a given limit", 0 ],
		[ "null", null ],
		[ "undefined", undefined ],
		[ "a string", "store" ],
		[ "a plain object", {} ],
		[ "a partial store", { lookup: () => undefined, insert: () => undefined } ],
		[ "a partial bucket", { get: () => undefined, put: () => undefined } ]

	])("should hold entries in memory for %s", async (_, store) => {

		// @ts-expect-error the option is typed, so an unusable value only reaches the fallback at run time

		const memory = createStore(store);
		const stored = entry();

		await memory.insert("key", stored);

		await expect(memory.lookup("key")).resolves.toEqual(stored);

	});

});

describe("skipping()", () => {

	it("should skip no target for no pattern", async () => {

		expect(skipping([])(url)).toBe(false);

	});

	it("should skip a target a pattern states in full", async () => {

		expect(skipping([ url ])(url)).toBe(true);

	});

	it("should skip a target any of several patterns selects", async () => {

		expect(skipping([ "https://api.example.com/other", url ])(url)).toBe(true);

	});

	it("should take the whole target rather than a prefix of it", async () => {

		expect(skipping([ "https://api.example.com" ])(url)).toBe(false);

	});

	it("should select any run of characters within a path segment with `*`", async () => {

		expect(skipping([ "https://api.example.com/*" ])(url)).toBe(true);

	});

	it("should stop `*` at a path separator", async () => {

		expect(skipping([ "https://api.example.com/*" ])(`${url}/1`)).toBe(false);

	});

	it("should select any run of characters across path separators with `**`", async () => {

		expect(skipping([ "https://api.example.com/**" ])(`${url}/1`)).toBe(true);

	});

	it("should select one character within a path segment with `?`", async () => {

		expect(skipping([ "https://api.example.com/dat?" ])(url)).toBe(true);

	});

	it("should stop `?` at a path separator", async () => {

		expect(skipping([ "https://api.example.com/data?1" ])(`${url}/1`)).toBe(false);

	});

	it("should take the characters a regular expression reads as operators literally", async () => {

		expect(skipping([ "https://api.example.com/d.ta" ])(url)).toBe(false);

	});

});

describe("resource()", () => {

	it("should tell apart exchanges differing by method", async () => {

		expect(resource(url, "HEAD")).not.toBe(resource(url, "GET"));

	});

	it("should share one key among targets differing by fragment alone", async () => {

		expect(resource(`${url}#one`, "GET")).toBe(resource(`${url}#two`, "GET"));

	});

	it("should tell apart targets differing by query string", async () => {

		expect(resource(`${url}?page=2`, "GET")).not.toBe(resource(url, "GET"));

	});

});

describe("variant()", () => {

	const key = resource(url, "GET");


	it("should ignore the case the varying header fields are named in", async () => {

		const headers = new Headers({ Accept: "text/plain" });

		expect(variant(key, "ACCEPT", headers)).toBe(variant(key, "accept", headers));

	});

	it("should ignore the order the varying header fields are stated in", async () => {

		const headers = new Headers({ Accept: "text/plain", "Accept-Language": "en" });

		expect(variant(key, "Accept, Accept-Language", headers))
			.toBe(variant(key, "Accept-Language, Accept", headers));

	});

	it("should tell apart exchanges differing by the value of a varying header field", async () => {

		expect(variant(key, "Accept", new Headers({ Accept: "application/json" })))
			.not.toBe(variant(key, "Accept", new Headers({ Accept: "text/plain" })));

	});

	it("should tell apart exchanges stating a varying header field from ones leaving it out", async () => {

		expect(variant(key, "Accept", new Headers({ Accept: "text/plain" })))
			.not.toBe(variant(key, "Accept", new Headers()));

	});

});

describe("conditional()", () => {

	it("should state the entity tag as an `If-None-Match` condition", async () => {

		expect(conditional(new Request(url), entry({ headers: { etag: "\"v1\"" } })).headers.get("If-None-Match"))
			.toBe("\"v1\"");

	});

	it("should state the modification date as an `If-Modified-Since` condition", async () => {

		const modified = "Wed, 26 Aug 2026 10:00:00 GMT";

		expect(conditional(new Request(url), entry({ headers: { "last-modified": modified } }))
			.headers.get("If-Modified-Since")
		).toBe(modified);

	});

	it("should state every validator the entry carries", async () => {

		const modified = "Wed, 26 Aug 2026 10:00:00 GMT";

		const request = conditional(new Request(url), entry({
			headers: { etag: "\"v1\"", "last-modified": modified }
		}));

		expect(request.headers.get("If-None-Match")).toBe("\"v1\"");
		expect(request.headers.get("If-Modified-Since")).toBe(modified);

	});

	it("should retain the header fields the request states", async () => {

		const request = new Request(url, { headers: { Accept: "application/json" } });

		expect(conditional(request, entry({ headers: { etag: "\"v1\"" } })).headers.get("Accept"))
			.toBe("application/json");

	});

	it("should report the request as it stands for an entry carrying no validator", async () => {

		const request = new Request(url);

		expect(conditional(request, entry())).toBe(request);

	});

	it("should report the request as it stands for no entry", async () => {

		const request = new Request(url);

		expect(conditional(request)).toBe(request);

	});

});

describe("storable()", () => {

	it("should hold a successful response", async () => {

		expect(storable(new Response("stored"))).toBe(true);

	});

	it("should give up an unsuccessful response", async () => {

		expect(storable(new Response("stored", { status: InternalServerError }))).toBe(false);

	});

	it("should give up a partial response", async () => {

		expect(storable(new Response("stored", { status: PartialContent }))).toBe(false);

	});

	it("should give up a response setting a cookie", async () => {

		expect(storable(new Response("stored", { headers: { "Set-Cookie": "session=token" } }))).toBe(false);

	});

	it("should give up a response stating `no-store`", async () => {

		expect(storable(new Response("stored", { headers: { "Cache-Control": "private, no-store" } }))).toBe(false);

	});

	it("should hold a response stating a directive `no-store` is a prefix of", async () => {

		expect(storable(new Response("stored", { headers: { "Cache-Control": "no-store-remote" } }))).toBe(true);

	});

	it("should give up a response varying unpredictably", async () => {

		expect(storable(new Response("stored", { headers: { Vary: "*" } }))).toBe(false);

	});

	it("should hold a response varying on a header field", async () => {

		expect(storable(new Response("stored", { headers: { Vary: "Accept" } }))).toBe(true);

	});

});

describe("stale()", () => {

	/**
	 * Creates a successful response to an unsafe exchange, optionally reporting a further target it has changed.
	 */
	function changed(headers: Readonly<Record<string, string>> = {}): Response {

		return new Response(null, { status: NoContent, headers });

	}


	it("should report no entry for a failed exchange", async () => {

		expect(stale(new Response(null, { status: InternalServerError }), new URL(url))).toStrictEqual([]);

	});

	it.each([ "GET", "HEAD" ])("should report the %s entries for the target of a successful exchange", async method => {

		expect(stale(changed(), new URL(url))).toContain(resource(url, method));

	});

	it("should leave out the entries for the query string variants of the target", async () => {

		expect(stale(changed(), new URL(url))).not.toContain(resource(`${url}?page=2`, "GET"));

	});

	it.each([ "Location", "Content-Location" ])(
		"should report the entries for a same-origin %s target", async field => {

			const other = "https://api.example.com/other";
			const keys = stale(changed({ [field]: other }), new URL(url));

			expect(keys).toContain(resource(other, "GET"));
			expect(keys).toContain(resource(other, "HEAD"));

		});

	it.each([ "Location", "Content-Location" ])(
		"should resolve a relative %s target against the target of the exchange", async field => {

			expect(stale(changed({ [field]: "/other" }), new URL(url)))
				.toContain(resource("https://api.example.com/other", "GET"));

		});

	it.each([ "Location", "Content-Location" ])(
		"should leave out the entries for a cross-origin %s target", async field => {

			const other = "https://cdn.example.net/other";

			expect(stale(changed({ [field]: other }), new URL(url))).not.toContain(resource(other, "GET"));

		});

});

describe("capture()", () => {

	/**
	 * Restates a response as retrieved from the given URL, as a constructed response states none.
	 */
	function retrieved(response: Response, from: string): Response {

		return Object.defineProperty(response, "url", { value: from });

	}


	it("should capture the status, header fields and content of the response", async () => {

		const captured = await capture(new Response("stored", { headers: { ETag: "\"v1\"" } }), at, at);

		expect(captured.status).toBe(OK);
		expect(captured.headers["etag"]).toBe("\"v1\"");
		expect(new TextDecoder().decode(captured.body)).toBe("stored");

	});

	it("should record the URL the response was retrieved from", async () => {

		const captured = await capture(retrieved(new Response("stored"), url), at, at);

		expect(captured.url).toBe(url);

	});

	it("should record the reason phrase of the response", async () => {

		const captured = await capture(new Response("stored", { statusText: "Some Reason" }), at, at);

		expect(captured.statusText).toBe("Some Reason");

	});

	it("should record the instants the exchange was sent and answered at", async () => {

		const captured = await capture(new Response("stored"), at-2_000, at);

		expect(captured.requested).toBe(at-2_000);
		expect(captured.received).toBe(at);

	});

	it("should leave the response unread", async () => {

		const response = new Response("stored");

		await capture(response, at, at);

		await expect(text(response)).resolves.toBe("stored");

	});

});

describe("age()", () => {

	it("should account for the age the origin server states", async () => {

		expect(age(entry({ headers: { age: "60" } }))).toBe(60_000);

	});

	it.each([ "", "unknown", "-60" ])("should ignore an unusable stated age of <%s>", async stated => {

		expect(age(entry({ headers: { age: stated } }))).toBe(0);

	});

	it("should report the time elapsed since the request was sent", async () => {

		vi.advanceTimersByTime(30_000);

		expect(age(entry())).toBe(30_000);

	});

	it("should account for the round trip that retrieved the response", async () => {

		expect(age(entry({ requested: at-2_000 }))).toBe(2_000);

	});

	it("should add the stated age to the time elapsed since the request was sent", async () => {

		vi.advanceTimersByTime(30_000);

		expect(age(entry({ headers: { age: "60" } }))).toBe(90_000);

	});

});

describe("lifetime()", () => {

	it("should report no freshness lifetime for an entry stating `no-cache`", async () => {

		expect(lifetime(entry({ headers: { "cache-control": "no-cache, max-age=60" } }), 0)).toBe(0);

	});

	it("should take the freshness lifetime from `max-age`", async () => {

		expect(lifetime(entry({ headers: { "cache-control": "max-age=60" } }), 0)).toBe(60_000);

	});

	it.each([ "max-age", "max-age=", "max-age=unknown", "max-age=-60" ])(
		"should report no freshness lifetime for an unusable <%s>", async control => {

			expect(lifetime(entry({ headers: { "cache-control": control } }), 0)).toBe(0);

		});

	it("should ignore the freshness lifetime `s-maxage` states", async () => {

		expect(lifetime(entry({ headers: { "cache-control": "s-maxage=0, max-age=60" } }), 0)).toBe(60_000);

	});

	it("should prefer `max-age` to `Expires`", async () => {

		const expires = new Date(at+600_000).toUTCString();

		expect(lifetime(entry({ headers: { "cache-control": "max-age=60", expires } }), 0)).toBe(60_000);

	});

	it("should take the freshness lifetime from `Expires` when no `max-age` is stated", async () => {

		const expires = new Date(at+60_000).toUTCString();

		expect(lifetime(entry({ headers: { expires } }), 0)).toBe(60_000);

	});

	it("should measure the freshness lifetime `Expires` states from the stated `Date`", async () => {

		const date = new Date(at-30_000).toUTCString();
		const expires = new Date(at+30_000).toUTCString();

		expect(lifetime(entry({ headers: { date, expires } }), 0)).toBe(60_000);

	});

	it("should report no freshness lifetime for an entry whose `Expires` has passed", async () => {

		const date = new Date(at).toUTCString();
		const expires = new Date(at-60_000).toUTCString();

		expect(lifetime(entry({ headers: { date, expires } }), 0)).toBe(0);

	});

	it("should report no freshness lifetime for an entry stating none", async () => {

		expect(lifetime(entry(), 0)).toBe(0);

	});

	it("should cap the freshness lifetime under the ttl", async () => {

		expect(lifetime(entry({ headers: { "cache-control": "max-age=600" } }), 60_000)).toBe(60_000);

	});

	it("should not extend the freshness lifetime under the ttl", async () => {

		expect(lifetime(entry({ headers: { "cache-control": "max-age=60" } }), 600_000)).toBe(60_000);

	});

	it.each([ 0, -1 ])("should leave freshness to the origin server with a ttl of %i", async ttl => {

		expect(lifetime(entry({ headers: { "cache-control": "max-age=600" } }), ttl)).toBe(600_000);

	});

	it("should assume the ttl as the freshness lifetime of an entry stating none", async () => {

		expect(lifetime(entry(), 60_000)).toBe(60_000);

	});

	it.each([ "immutable", "public", "private", "s-maxage=600" ])(
		"should assume the ttl as the freshness lifetime of an entry stating <%s> alone", async control => {

			expect(lifetime(entry({ headers: { "cache-control": control } }), 60_000)).toBe(60_000);

		});

	it.each([ "no-cache", "max-age=0", "must-revalidate", "proxy-revalidate" ])(
		"should prefer the expiration <%s> states to the ttl", async control => {

			expect(lifetime(entry({ headers: { "cache-control": control } }), 60_000)).toBe(0);

		});

	it("should prefer the expiration `Expires` states to the ttl", async () => {

		const date = new Date(at).toUTCString();
		const expires = new Date(at-60_000).toUTCString();

		expect(lifetime(entry({ headers: { date, expires } }), 600_000)).toBe(0);

	});

	it("should prefer an unusable `Expires` to the ttl", async () => {

		expect(lifetime(entry({ headers: { expires: "0" } }), 60_000)).toBe(0);

	});

	it.each([ NonAuthoritativeInformation, NoContent, MovedPermanently, NotFound, Gone, NotImplemented ])(
		"should assume the ttl as the freshness lifetime of a %i entry", async status => {

			expect(lifetime(entry({ status }), 60_000)).toBe(60_000);

		});

	it.each([ Created, Accepted, ResetContent ])(
		"should report no freshness lifetime for a %i entry stating none", async status => {

			expect(lifetime(entry({ status }), 60_000)).toBe(0);

		});


	describe("with a `Last-Modified`", () => {

		const modified = new Date(at-600_000).toUTCString();

		it("should assume a share of the time the content had gone unchanged", async () => {

			expect(lifetime(entry({ headers: { "last-modified": modified } }), 0)).toBe(60_000);

		});

		it("should measure the assumed freshness lifetime from the stated `Date`", async () => {

			const date = new Date(at+400_000).toUTCString();

			expect(lifetime(entry({ headers: { date, "last-modified": modified } }), 0)).toBe(100_000);

		});

		it.each([ "no-cache", "max-age=30", "must-revalidate" ])(
			"should prefer the expiration <%s> states to the assumed freshness lifetime", async control => {

				expect(lifetime(entry({ headers: { "cache-control": control, "last-modified": modified } }), 0))
					.toBe(control === "max-age=30" ? 30_000 : 0);

			});

		it("should prefer the expiration `Expires` states to the assumed freshness lifetime", async () => {

			const expires = new Date(at+30_000).toUTCString();

			expect(lifetime(entry({ headers: { expires, "last-modified": modified } }), 0)).toBe(30_000);

		});

		it("should cap the assumed freshness lifetime under the ttl", async () => {

			expect(lifetime(entry({ headers: { "last-modified": modified } }), 30_000)).toBe(30_000);

		});

		it("should prefer the assumed freshness lifetime to a longer ttl", async () => {

			expect(lifetime(entry({ headers: { "last-modified": modified } }), 600_000)).toBe(60_000);

		});

		it.each([ "", "unknown", "0" ])(
			"should assume the ttl as the freshness lifetime for an unusable <%s>", async unusable => {

				expect(lifetime(entry({ headers: { "last-modified": unusable } }), 60_000)).toBe(60_000);

			});

		it("should report no freshness lifetime for content stated as changed after generation", async () => {

			const ahead = new Date(at+600_000).toUTCString();

			expect(lifetime(entry({ headers: { "last-modified": ahead } }), 60_000)).toBe(0);

		});

		it.each([ Created, Accepted, ResetContent ])(
			"should report no freshness lifetime for a %i entry", async status => {

				expect(lifetime(entry({ status, headers: { "last-modified": modified } }), 0)).toBe(0);

			});

	});

});

describe("replay()", () => {

	it("should serve the stored content", async () => {

		await expect(text(replay(entry({ content: "stored" })))).resolves.toBe("stored");

	});

	it("should serve an entry carrying no content", async () => {

		expect(replay(entry()).body).toBeNull();

	});

	it("should open a fresh body on every call", async () => {

		const stored = entry({ content: "stored" });

		await expect(text(replay(stored))).resolves.toBe("stored");
		await expect(text(replay(stored))).resolves.toBe("stored");

	});

	it("should serve the stored status", async () => {

		expect(replay(entry({ status: NoContent })).status).toBe(NoContent);

	});

	it("should serve the stored reason phrase", async () => {

		expect(replay(entry({ statusText: "Some Reason" })).statusText).toBe("Some Reason");

	});

	it("should state the URL the stored response was retrieved from", async () => {

		expect(replay(entry()).url).toBe(url);

	});

	it("should serve the stored header fields", async () => {

		expect(replay(entry({ headers: { etag: "\"v1\"" } })).headers.get("ETag")).toBe("\"v1\"");

	});

	it("should leave out the header fields the entry holds as unstated", async () => {

		expect(replay(entry({ headers: { etag: undefined } })).headers.has("ETag")).toBe(false);

	});

	it("should state the current age of the entry", async () => {

		vi.advanceTimersByTime(30_000);

		expect(replay(entry()).headers.get("Age")).toBe("30");

	});

	it("should supersede the age the origin server stated", async () => {

		vi.advanceTimersByTime(30_000);

		expect(replay(entry({ headers: { age: "60" } })).headers.get("Age")).toBe("90");

	});

	it("should state the retrieval URL on a clone", async () => {

		expect(replay(entry()).clone().url).toBe(url);

	});

	it("should serve the stored content from both a replayed response and its clone", async () => {

		const replayed = replay(entry({ content: "stored" }));
		const cloned = replayed.clone();

		await expect(text(replayed)).resolves.toBe("stored");
		await expect(text(cloned)).resolves.toBe("stored");

	});

	it("should refuse to clone a replayed response whose content was read", async () => {

		const replayed = replay(entry({ content: "stored" }));

		await text(replayed);

		expect(() => replayed.clone()).toThrow(TypeError);

	});

});

describe("refresh()", () => {

	/**
	 * Creates a `304` response, optionally restating the given header fields.
	 */
	function unmodified(headers: Readonly<Record<string, string>> = {}): Response {

		return new Response(null, { status: NotModified, headers });

	}


	it("should retain the status and content of the stale entry", async () => {

		const refreshed = refresh(entry({ status: NoContent, content: "stored" }), at, at, unmodified());

		expect(refreshed.status).toBe(NoContent);
		expect(new TextDecoder().decode(refreshed.body)).toBe("stored");

	});

	it("should retain the URL and the reason phrase of the stale entry", async () => {

		const refreshed = refresh(entry({ statusText: "Some Reason" }), at, at, unmodified());

		expect(refreshed.url).toBe(url);
		expect(refreshed.statusText).toBe("Some Reason");

	});

	it("should retain the header fields the confirming response leaves out", async () => {

		const refreshed = refresh(entry({ headers: { etag: "\"v1\"" } }), at, at, unmodified());

		expect(refreshed.headers["etag"]).toBe("\"v1\"");

	});

	it("should take the header fields the confirming response restates", async () => {

		const refreshed = refresh(entry({ headers: { "cache-control": "max-age=0" } }), at, at, unmodified({
			"Cache-Control": "max-age=60"
		}));

		expect(refreshed.headers["cache-control"]).toBe("max-age=60");

	});

	it("should age the refreshed entry from the exchange that confirmed it", async () => {

		const refreshed = refresh(entry({ headers: { age: "60" } }), at-2_000, at, unmodified());

		expect(refreshed.requested).toBe(at-2_000);
		expect(refreshed.received).toBe(at);
		expect(refreshed.headers["age"]).toBe("0");

	});

	it("should take the age the confirming response states", async () => {

		const refreshed = refresh(entry(), at, at, unmodified({ Age: "60" }));

		expect(refreshed.headers["age"]).toBe("60");

	});

});
