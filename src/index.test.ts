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
import {
	getHeaders,
	getMethod,
	getTarget,
	parseDuration,
	parseInstant,
	parseInteger,
	parseQuoted,
	parseList,
	parseParameter,
	parseItem
} from "./index.core.js";
import { createFetch, type Fetch, type Middleware } from "./index.js";
import { transport } from "./resolvers/transport.js";


const url = "https://api.example.com/data";


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

describe("createFetch()", () => {

	/**
	 * Creates a middleware tagging the requests and the responses flowing through it.
	 *
	 * Tags accumulate in the `Trace` header in processing order, making the traversal of a chain observable from either
	 * end of an exchange.
	 */
	function tracing(tag: string): Middleware {

		return fetch => async (input, init) => {

			const request = new Request(input, init);

			request.headers.append("Trace", tag);

			const response = await fetch(request);

			response.headers.append("Trace", tag);

			return response;

		};

	}


	it("should delegate to the standard fetch function", async () => {
		const expected = new Response();
		const standard = vi.spyOn(globalThis, "fetch").mockResolvedValue(expected);

		const client = createFetch();

		await expect(client(url)).resolves.toBe(expected);
		expect(standard).toHaveBeenCalled();

		standard.mockRestore();
	});

	it("should process requests in declaration order", async () => {
		const mock = vi.fn<Fetch>().mockResolvedValue(new Response());
		const client = createFetch(tracing("outer"), tracing("inner"), transport(mock));

		await client(url);

		const [ [ input, init ] ] = mock.mock.calls;

		expect(new Request(input, init).headers.get("Trace")).toBe("outer, inner");
	});

	it("should process responses in reverse declaration order", async () => {
		const mock = vi.fn<Fetch>().mockResolvedValue(new Response());
		const client = createFetch(tracing("outer"), tracing("inner"), transport(mock));

		const response = await client(url);

		expect(response.headers.get("Trace")).toBe("inner, outer");
	});

});

describe("getMethod()", () => {

	it("should report `GET` for an exchange stating no method", async () => {

		expect(getMethod(url)).toBe("GET");

	});

	it("should report the method stated by the options", async () => {

		expect(getMethod(url, { method: "post" })).toBe("POST");

	});

	it("should report the method stated by a request input", async () => {

		expect(getMethod(new Request(url, { method: "put" }))).toBe("PUT");

	});

	it("should prefer the method stated by the options to the one stated by a request input", async () => {

		expect(getMethod(new Request(url, { method: "PUT" }), { method: "POST" })).toBe("POST");

	});

	it("should report an extension method as stated", async () => {

		expect(getMethod(url, { method: "patch" })).toBe("patch");

	});

	it("should report an extension method as the request states it", async () => {

		expect(getMethod(new Request(url, { method: "patch" }))).toBe("patch");

	});

});

describe("getTarget()", () => {

	it("should report the target stated as a string", async () => {

		expect(getTarget(url).href).toBe(url);

	});

	it("should report the target stated as a URL", async () => {

		expect(getTarget(new URL(url)).href).toBe(url);

	});

	it("should report the target stated by a request input", async () => {

		expect(getTarget(new Request(url)).href).toBe(url);

	});

	it("should reject a malformed target", async () => {

		expect(() => getTarget("not a url")).toThrow(TypeError);

	});

	it("should reject a relative target", async () => {

		expect(() => getTarget("/data")).toThrow(TypeError);

	});

	it("should drop the fragment of a target stated as a string", async () => {

		expect(getTarget(`${ url }#section`).href).toBe(url);

	});

	it("should drop the fragment of a target stated as a URL", async () => {

		expect(getTarget(new URL(`${ url }#section`)).href).toBe(url);

	});

});

describe("getHeaders()", () => {

	it("should report no header field for an exchange stating none", async () => {

		expect([ ...getHeaders(url) ]).toStrictEqual([]);

	});

	it("should report the header fields stated by the options", async () => {

		expect(getHeaders(url, { headers: { Accept: "text/plain" } }).get("Accept")).toBe("text/plain");

	});

	it("should report the header fields stated by a request input", async () => {

		expect(getHeaders(new Request(url, { headers: { Accept: "text/plain" } })).get("Accept")).toBe("text/plain");

	});

	it("should prefer the header fields stated by the options to those stated by a request input", async () => {

		const input = new Request(url, { headers: { Accept: "text/plain", Range: "bytes=0-3" } });

		const headers = getHeaders(input, { headers: { Accept: "application/json" } });

		expect(headers.get("Accept")).toBe("application/json");
		expect(headers.has("Range")).toBe(false);

	});

	it("should report header fields the exchange doesn't state as unstated", async () => {

		expect(getHeaders(url).has("Range")).toBe(false);

	});

});

describe("parseInteger()", () => {

	it("should report the number a value states", async () => {

		expect(parseInteger("60")).toBe(60);

	});

	it("should report a value stating leading zeroes", async () => {

		expect(parseInteger("007")).toBe(7);

	});

	it("should tolerate whitespace around a value", async () => {

		expect(parseInteger(" 60 ")).toBe(60);

	});

	it("should cap a value beyond the stated limit", async () => {

		expect(parseInteger("60", 10)).toBe(10);

	});

	it("should cap a value beyond exact representation", async () => {

		expect(parseInteger("99999999999999999999")).toBe(Number.MAX_SAFE_INTEGER);

	});

	it.each([
		null, undefined, "", "  ", "unknown", "-60",
		"+60", // a signed form
		"1.5", // a fractional form
		"1e3", // an exponent form
		"0x10" // a hexadecimal form
	])("should report no number for <%s>", async value => {

		expect(parseInteger(value)).toBeUndefined();

	});

});

describe("parseDuration()", () => {

	it("should convert delta seconds to milliseconds", async () => {

		expect(parseDuration("60")).toBe(60_000);

	});

	it("should tolerate whitespace around delta seconds", async () => {

		expect(parseDuration(" 60 ")).toBe(60_000);

	});

	it("should cap a duration beyond the representable range", async () => {

		expect(parseDuration("99999999999")).toBe(2_147_483_648_000);

	});

	it.each([
		null, undefined, "", "  ", "unknown", "-60",
		"+60", // a signed form
		"1.5", // a fractional form
		"1e3", // an exponent form
		"0x10" // a hexadecimal form
	])("should report no duration for <%s>", async value => {

		expect(parseDuration(value)).toBeUndefined();

	});

});

describe("parseInstant()", () => {

	const instant = Date.UTC(1994, 10, 6, 8, 49, 37);

	it("should report the instant a date states", async () => {

		expect(parseInstant(new Date(60_000).toUTCString())).toBe(60_000);

	});

	it.each([
		[ "IMF-fixdate", "Sun, 06 Nov 1994 08:49:37 GMT" ],
		[ "rfc850-date", "Sunday, 06-Nov-94 08:49:37 GMT" ],
		[ "asctime-date", "Sun Nov  6 08:49:37 1994" ]
	])("should report the instant an %s states", async (_, date) => {

		expect(parseInstant(date)).toBe(instant);

	});

	it("should report a single-digit asctime day", async () => {

		expect(parseInstant("Sun Nov 16 08:49:37 1994")).toBe(Date.UTC(1994, 10, 16, 8, 49, 37));

	});

	it("should read a two-digit year within fifty years ahead in the current century", async () => {

		expect(parseInstant("Tuesday, 06-Nov-40 08:49:37 GMT")).toBe(Date.UTC(2040, 10, 6, 8, 49, 37));

	});

	it("should carry a leap second over into the following minute", async () => {

		expect(parseInstant("Sun, 31 Dec 1995 23:59:60 GMT")).toBe(Date.UTC(1996, 0, 1, 0, 0, 0));

	});

	it.each([
		null, undefined, "", "soon",
		"1994-11-06T08:49:37Z", // ISO 8601 isn't an `HTTP-date`
		"Sun, 06 Nov 1994 08:49:37", // no time zone
		"Sun, 06 Nov 1994 08:49:37 UTC", // a time zone other than `GMT`
		"Sun, 6 Nov 1994 08:49:37 GMT", // a single-digit day
		"Sat, 30 Feb 2019 00:00:00 GMT", // an impossible calendar date
		"Sun, 06 Nov 1994 24:00:00 GMT" // an out-of-range hour
	])("should report no instant for <%s>", async date => {

		expect(parseInstant(date)).toBeUndefined();

	});

});

describe("parseQuoted()", () => {

	it("should unquote a quoted string", async () => {

		expect(parseQuoted("\"gzip\"")).toBe("gzip");

	});

	it("should unescape a quoted character", async () => {

		expect(parseQuoted("\"a\\\"b\"")).toBe("a\"b");

	});

	it("should unescape an escaped backslash", async () => {

		expect(parseQuoted("\"a\\\\b\"")).toBe("a\\b");

	});

	it("should retain a separator carried by a quoted string", async () => {

		expect(parseQuoted("\"a, b; c\"")).toBe("a, b; c");

	});

	it("should report a quoted string stating nothing as empty", async () => {

		expect(parseQuoted("\"\"")).toBe("");

	});

	it.each([
		[ "a token", "gzip" ],
		[ "a quote left unclosed", "\"gzip" ],
		[ "a value merely carrying quotes", "a\"b\"c" ],
		[ "nothing", "" ]
	])("should report %s as it stands", async (_, value) => {

		expect(parseQuoted(value)).toBe(value);

	});

});

describe("parseList()", () => {

	it("should report the elements of a list", async () => {

		expect(parseList("one, two, three")).toStrictEqual([ "one", "two", "three" ]);

	});

	it("should trim the whitespace surrounding an element", async () => {

		expect(parseList("  one  ,\ttwo\t")).toStrictEqual([ "one", "two" ]);

	});

	it("should retain the parameters an element carries", async () => {

		expect(parseList("\"cache\"; hit; ttl=60, \"other\"; fwd=miss"))
			.toStrictEqual([ "\"cache\"; hit; ttl=60", "\"other\"; fwd=miss" ]);

	});

	it("should retain a separator carried by a quoted value", async () => {

		expect(parseList("private=\"a,b\", max-age=60")).toStrictEqual([ "private=\"a,b\"", "max-age=60" ]);

	});

	it("should retain an escaped quote carried by a quoted value", async () => {

		expect(parseList("key=\"a\\\",b\", other")).toStrictEqual([ "key=\"a\\\",b\"", "other" ]);

	});

	it("should report a list stating a single element", async () => {

		expect(parseList("gzip")).toStrictEqual([ "gzip" ]);

	});

	it.each([
		[ "a leading comma", ",gzip, identity" ],
		[ "a trailing comma", "gzip, identity," ],
		[ "merged empty elements", "gzip,, identity" ],
		[ "whitespace around the separators", "gzip  ,\tidentity" ]
	])("should ignore %s", async (_, value) => {

		expect(parseList(value)).toStrictEqual([ "gzip", "identity" ]);

	});

	it.each([ null, undefined, "", "  ", " , ", ",,," ])("should report no element for <%s>", async value => {

		expect(parseList(value)).toStrictEqual([]);

	});

});

describe("parseParameter()", () => {

	it("should report the name and the value a parameter states", async () => {

		expect(parseParameter("max-age=60")).toStrictEqual([ "max-age", "60" ]);

	});

	it("should report a name in lowercase", async () => {

		expect(parseParameter("Max-Age=60")).toStrictEqual([ "max-age", "60" ]);

	});

	it("should retain the case of a value", async () => {

		expect(parseParameter("fwd=Stale")).toStrictEqual([ "fwd", "Stale" ]);

	});

	it("should report a parameter stating no value with an empty value", async () => {

		expect(parseParameter("no-store")).toStrictEqual([ "no-store", "" ]);

	});

	it("should unquote and unescape a quoted value", async () => {

		expect(parseParameter("private=\"a\\\",b\"")).toStrictEqual([ "private", "a\",b" ]);

	});

	it("should split on the first equals sign alone", async () => {

		expect(parseParameter("key=a=b")).toStrictEqual([ "key", "a=b" ]);

	});

	it("should report the whitespace an equals sign is padded with as stated", async () => {

		expect(parseParameter(" q =0.5 ")).toStrictEqual([ " q ", "0.5 " ]);

	});

	it("should report nothing for an empty parameter", async () => {

		expect(parseParameter("")).toStrictEqual([ "", "" ]);

	});

});

describe("parseItem()", () => {

	it("should report the value and the parameters an item states", async () => {

		expect(parseItem("text/html; charset=utf-8"))
			.toStrictEqual([ "text/html", new Map([ [ "charset", "utf-8" ] ]) ]);

	});

	it("should report an item stating no parameter with no parameter", async () => {

		expect(parseItem("text/html")).toStrictEqual([ "text/html", new Map() ]);

	});

	it("should retain the case of a value", async () => {

		expect(parseItem("Text/HTML")).toStrictEqual([ "Text/HTML", new Map() ]);

	});

	it("should unquote and unescape a quoted value", async () => {

		expect(parseItem("\"a\\\"b\"")).toStrictEqual([ "a\"b", new Map() ]);

	});

	it("should retain a separator carried by a quoted value", async () => {

		expect(parseItem("\"a;b\"")).toStrictEqual([ "a;b", new Map() ]);

	});

	it("should key parameters by lowercase name", async () => {

		expect(parseItem("text/html; Charset=utf-8"))
			.toStrictEqual([ "text/html", new Map([ [ "charset", "utf-8" ] ]) ]);

	});

	it("should report a valueless parameter with an empty value", async () => {

		expect(parseItem("\"proxy\"; hit; ttl=60"))
			.toStrictEqual([ "proxy", new Map([ [ "hit", "" ], [ "ttl", "60" ] ]) ]);

	});

	it("should unquote and unescape a quoted parameter value", async () => {

		expect(parseItem("form-data; name=\"a\\\"b\""))
			.toStrictEqual([ "form-data", new Map([ [ "name", "a\"b" ] ]) ]);

	});

	it("should trim the whitespace surrounding an item", async () => {

		expect(parseItem("  text/html ;\tcharset=utf-8\t"))
			.toStrictEqual([ "text/html", new Map([ [ "charset", "utf-8" ] ]) ]);

	});

	it.each([ null, undefined, "", "  " ])("should report no value and no parameter for <%s>", async value => {

		expect(parseItem(value)).toStrictEqual([ "", new Map() ]);

	});

});
