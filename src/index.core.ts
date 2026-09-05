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
 * Request and field value parsing helpers.
 *
 * Converts the textual values HTTP exchanges are made of into the plain JavaScript values client code works with:
 * request methods, target URIs and header fields, instants and durations, quoted strings, comma-separated lists, and
 * the parameterised items and name / value pairs that field grammars are assembled from.
 *
 * Malformed input is reported as stated or as missing, never as an error, so the consumer decides how to handle
 * whatever a peer got wrong.
 *
 * @module
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5 RFC 9110 § 5 - Fields}
 */

import { Nullable } from "@metreeca/core";


/**
 * The method names the Fetch standard folds to uppercase, leaving every other name as stated.
 *
 * @see {@link https://fetch.spec.whatwg.org/#concept-method-normalize Fetch - Method Normalization}
 */
const Methods: ReadonlyArray<string> = [ "DELETE", "GET", "HEAD", "OPTIONS", "POST", "PUT" ];

/**
 * The fragment of a target, if any, together with the hash mark introducing it.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc3986#section-3.5 RFC 3986 § 3.5 - Fragment}
 */
const FragmentPattern = /#.*$/su;


/**
 * The greatest `delta-seconds` value a recipient is required to handle, standing in for any longer duration, in
 * seconds.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111#section-1.2.2 RFC 9111 § 1.2.2 - Delta Seconds}
 */
const DurationLimit = 2_147_483_648;

/**
 * A bare sequence of digits, as both a numeric field value and a `delta-seconds` are stated.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-8.6 RFC 9110 § 8.6 - Content-Length}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111#section-1.2.2 RFC 9111 § 1.2.2 - Delta Seconds}
 */
const DigitsPattern = /^\d+$/;


/**
 * The month names an `HTTP-date` states, in calendar order.
 */
const Months: ReadonlyArray<string> = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/**
 * The length of each month, in days, February taken as common and corrected for a leap year where required.
 */
const MonthDays: ReadonlyArray<number> = [ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ];

/**
 * The span of a Gregorian cycle, in years, after which the calendar repeats exactly.
 *
 * Shifting a year by a whole cycle keeps it clear of the two-digit range `Date.UTC` maps onto the twentieth century,
 * without moving the instant it names within its year.
 */
const GregorianYears = 400;

/**
 * The exact length of a {@link GregorianYears}-year cycle, in milliseconds.
 */
const GregorianCycle = 146_097*24*60*60*1000;

/**
 * The number of years ahead beyond which a two-digit year is read as the most recent past year ending in the same
 * digits.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.7 RFC 9110 § 5.6.7 - Date/Time Formats}
 */
const YearWindow = 50;

/**
 * The preferred `IMF-fixdate` format, capturing day, month, year, hour, minute and second.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.7 RFC 9110 § 5.6.7 - Date/Time Formats}
 */
const FixdatePattern = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

/**
 * The obsolete `rfc850-date` format, capturing day, month, two-digit year, hour, minute and second.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.7 RFC 9110 § 5.6.7 - Date/Time Formats}
 */
const RFC850Pattern =
	/^(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, (\d{2})-(\w{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

/**
 * The obsolete `asctime-date` format, capturing month, day, hour, minute, second and year.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.7 RFC 9110 § 5.6.7 - Date/Time Formats}
 */
const AsctimePattern = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\w{3}) ([ \d]\d) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/;


/**
 * A quoted string, capturing its content.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.4 RFC 9110 § 5.6.4 - Quoted Strings}
 */
const QuotedPattern = /^"((?:[^"\\]|\\.)*)"$/s;

/**
 * An escaped character inside a quoted string.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.4 RFC 9110 § 5.6.4 - Quoted Strings}
 */
const EscapePattern = /\\(.)/gs;

/**
 * The elements of a comma-separated field value.
 *
 * A quoted string is taken whole, so that a comma it carries doesn't split the element around it.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.1 RFC 9110 § 5.6.1 - Lists (#rule ABNF Extension)}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.4 RFC 9110 § 5.6.4 - Quoted Strings}
 */
const ElementsPattern = /(?:"(?:[^"\\]|\\.)*"|[^,])+/g;

/**
 * A name / value pair, capturing the name and the value it states past the first equals sign.
 *
 * Everything past the name is optional, so a pair stating no value matches with the value capture unset.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.6 RFC 9110 § 5.6.6 - Parameters}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111#section-5.2 RFC 9111 § 5.2 - Cache-Control}
 */
const PairPattern = /^([^=]*)(?:=(.*))?$/s;

/**
 * An item, capturing the value it opens with and the parameters trailing it, either possibly empty.
 *
 * A quoted string is taken whole, so that a semicolon it carries doesn't cut the value short.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.6 RFC 9110 § 5.6.6 - Parameters}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.4 RFC 9110 § 5.6.4 - Quoted Strings}
 */
const ItemPattern = /^((?:"(?:[^"\\]|\\.)*"|[^;])*)(.*)$/s;

/**
 * The parameters trailing an item value, separated by semicolons rather than commas.
 *
 * A quoted string is taken whole, so that a semicolon it carries doesn't split the parameter around it.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.6 RFC 9110 § 5.6.6 - Parameters}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.4 RFC 9110 § 5.6.4 - Quoted Strings}
 */
const ParametersPattern = /(?:"(?:[^"\\]|\\.)*"|[^;])+/g;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Retrieves the method of a request.
 *
 * > [!NOTE]
 * > A method name is case-sensitive, so an extension method is reported exactly as stated and only the standard names
 * > `fetch` normalises are folded to uppercase: what is reported is the method the origin server is asked for, so it
 * > compares directly against the standard names without ever misreporting an extension method defined in lowercase.
 *
 * @param input The request or target URL the method is to be retrieved from, unless overridden by `init`
 * @param init The request options the method is to be retrieved from, taking precedence over `input`
 *
 * @returns The name of the method stated by `init` or by `input`, defaulting to `GET`, uppercased if it names one of
 *     the methods `fetch` case-normalises
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-9.1 RFC 9110 § 9.1 - Methods (Overview)}
 * @see {@link https://fetch.spec.whatwg.org/#concept-method-normalize Fetch - Method Normalization}
 */
export function getMethod(input: RequestInfo | URL, init?: RequestInit): string {

	const method = init?.method ?? (input instanceof Request ? input.method : "GET");
	const standard = method.toUpperCase();

	return Methods.includes(standard) ? standard : method;

}

/**
 * Retrieves the target URI of a request.
 *
 * > [!NOTE]
 * > A fragment identifies a secondary resource indirectly and is never sent to the origin server, so it plays no part
 * > in what is reported: a target and the same target carrying a fragment are requested alike and compare equal.
 * >
 * > A target is reported parsed, so that the scheme, the origin and the path are read without parsing it again and a
 * > reference is resolved against it. A target stated as a string is accordingly required to be absolute: a relative
 * > reference is the consumer's to resolve against the applicable base URI before the exchange is performed.
 *
 * @param input The request or target URL the target URI is to be retrieved from
 *
 * @returns The target URI identifying the resource `input` is addressed to, stripped of any fragment
 *
 * @throws {@link !TypeError TypeError} If `input` states a target that is not an absolute URI
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-7.1 RFC 9110 § 7.1 - Determining the Target Resource}
 * @see {@link https://www.rfc-editor.org/rfc/rfc3986#section-3.5 RFC 3986 § 3.5 - Fragment}
 */
export function getTarget(input: RequestInfo | URL): URL {

	return new URL((input instanceof Request ? input.url : input.toString()).replace(FragmentPattern, ""));

}

/**
 * Retrieves the header fields of a request.
 *
 * > [!NOTE]
 * > Header fields stated by the options replace those stated by a request input rather than adding to them, as `fetch`
 * > has it, so what is reported is the field list the origin server is asked with.
 *
 * @param input The request or target URL the header fields are to be retrieved from, unless overridden by `init`
 * @param init The request options the header fields are to be retrieved from, taking precedence over `input`
 *
 * @returns The header fields stated by `init` or by `input`, empty if neither states any
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-6.3 RFC 9110 § 6.3 - Header Fields}
 */
export function getHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {

	return new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Parses a numeric field value.
 *
 * > [!NOTE]
 * > A number a peer states is plain digits and nothing else, so a sign, a decimal point or an exponent marks a value
 * > no peer is required to understand: it is reported as missing rather than repaired, leaving the consumer to decide
 * > what to make of it.
 * >
 * > How large a number may grow is settled by each field rather than by HTTP at large, so the ceiling is the caller's
 * > to state. It defaults to the greatest number JavaScript counts exactly, past which arithmetic would quietly
 * > drift.
 *
 * @param value The field value to be parsed, possibly missing
 * @param limit The greatest number to be reported, standing in for anything larger
 *
 * @returns The number `value` states, never negative and never above `limit`; `undefined` if `value` is missing or
 *     states anything but a bare sequence of digits
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-8.6 RFC 9110 § 8.6 - Content-Length}
 */
export function parseInteger(value: Nullable<string>, limit: number = Number.MAX_SAFE_INTEGER): undefined | number {

	const integer = value?.trim() ?? "";

	return DigitsPattern.test(integer) ? Math.min(Number(integer), limit) : undefined;

}

/**
 * Parses a date field value.
 *
 * > [!NOTE]
 * > Every date format HTTP defines is read, the preferred one and the two obsolete ones alike, and no other: a date
 * > in some other notation, an ISO 8601 one included, is reported as missing rather than guessed at, leaving the
 * > consumer to decide what to make of it. So is a date naming no real day, a thirtieth of February among them.
 * >
 * > Where a format states a two-digit year, it is read as the most recent past year ending in those digits rather
 * > than as a date more than fifty years ahead.
 * >
 * > A leap second, which the grammar admits, rolls over into the following minute rather than being reported as
 * > missing.
 *
 * @param value The field value to be parsed, possibly missing
 *
 * @returns The instant `value` states, in milliseconds since the epoch; `undefined` if `value` is missing or doesn't
 *     state a date in one of the three formats HTTP defines
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.7 RFC 9110 § 5.6.7 - Date/Time Formats}
 */
export function parseInstant(value: Nullable<string>): undefined | number {

	const date = value ?? "";

	// the two `GMT`-suffixed formats state the same components in the same order, a two-digit year telling the obsolete
	// `rfc850-date` apart from the preferred `IMF-fixdate`

	const suffixed = FixdatePattern.exec(date) ?? RFC850Pattern.exec(date);
	const asctime = AsctimePattern.exec(date);

	if ( suffixed ) {

		const [ , day = "", month = "", year = "", hour = "", minute = "", second = "" ] = suffixed;

		return instant(
			year.length === 2 ? expand(Number(year)) : Number(year),
			month, Number(day), Number(hour), Number(minute), Number(second)
		);

	} else if ( asctime ) {

		const [ , month = "", day = "", hour = "", minute = "", second = "", year = "" ] = asctime;

		return instant(Number(year), month, Number(day), Number(hour), Number(minute), Number(second));

	} else {

		return undefined;

	}


	/**
	 * Converts the components of an `HTTP-date` to an instant.
	 */
	function instant(

		year: number, month: string, day: number,
		hour: number, minute: number, second: number

	): undefined | number {

		const index = Months.indexOf(month);

		// a leap second is left to roll over into the following minute, unlike an out-of-range component

		return index < 0 || day < 1 || day > length(year, index) || hour > 23 || minute > 59 || second > 60 ? undefined
			: Date.UTC(year+GregorianYears, index, day, hour, minute, second)-GregorianCycle;

	}

	/**
	 * Reports the length of a month, in days.
	 */
	function length(year: number, month: number): number {

		const leap = year%4 === 0 && year%100 !== 0 || year%400 === 0;

		return month === 1 && leap ? 29 : MonthDays[month] ?? 0;

	}

	/**
	 * Expands a two-digit year to the century that doesn't place it more than {@link YearWindow} years ahead.
	 */
	function expand(year: number): number {

		const current = new Date().getUTCFullYear();
		const expanded = Math.floor(current/100)*100+year;

		return expanded > current+YearWindow ? expanded-100 : expanded;

	}

}

/**
 * Parses a duration field value.
 *
 * > [!NOTE]
 * > A duration a peer states is a plain count of seconds, so a sign, a decimal point or an exponent marks a value no
 * > peer is required to understand: it is reported as missing rather than repaired, leaving the consumer to decide
 * > what to make of it.
 * >
 * > However far ahead a peer places a deadline, the duration reported stays within the range every recipient is
 * > required to handle, so it is always safe to add to a clock reading.
 *
 * @param value The field value to be parsed, possibly missing
 *
 * @returns The duration `value` states, in milliseconds, never negative and never longer than roughly sixty-eight
 *     years; `undefined` if `value` is missing or states anything but a bare count of seconds
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111#section-1.2.2 RFC 9111 § 1.2.2 - Delta Seconds}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3 RFC 9110 § 10.2.3 - Retry-After}
 */
export function parseDuration(value: Nullable<string>): undefined | number {

	const delta = value?.trim() ?? "";

	return DigitsPattern.test(delta) ? Math.min(Number(delta), DurationLimit)*1000 : undefined;

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Parses a value stated as a quoted string.
 *
 * > [!NOTE]
 * > A value stated as a token is reported as it stands, a token and a quoted string stating the same value being
 * > equivalent, so this is safe to apply to whatever a field states in a value position. A value opening a quote it
 * > doesn't close isn't taken as quoted and is reported verbatim, quote included.
 * >
 * > Not every quoted field value is meant to be unquoted: an entity tag is compared with its quotes and any weak
 * > prefix in place, so `ETag` and `If-None-Match` are to be read as they stand.
 *
 * @param value The value to be parsed
 *
 * @returns The content `value` states, unquoted and unescaped where stated as a quoted string, as it stands otherwise
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.4 RFC 9110 § 5.6.4 - Quoted Strings}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.6 RFC 9110 § 5.6.6 - Parameters}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-8.8.3.2 RFC 9110 § 8.8.3.2 - Comparison}
 */
export function parseQuoted(value: string): string {

	return QuotedPattern.exec(value)?.[1]?.replace(EscapePattern, "$1") ?? value;

}

/**
 * Parses a list field value.
 *
 * > [!NOTE]
 * > The comma is all a list states: what sits between commas is the field's own business, so elements are handed over
 * > as stated, quotes and all, for whoever knows the field to read. Every comma-separated field shares this one list,
 * > whatever its elements turn out to hold.
 * >
 * > A comma inside a quoted string doesn't split the element carrying it, so elements with quoted values survive
 * > intact; a comma stated anywhere else does split the element, as happens inside the angle brackets `Link` wraps
 * > its target reference in. Empty elements are dropped, a sender being required to state none and a recipient to
 * > ignore the ones a careless merge leaves behind.
 * >
 * > Elements are never rejected: nothing is checked against the field grammar. A quote left unclosed protects
 * > nothing, so the commas following it split elements as any other would, and a value the sender left malformed
 * > yields malformed elements rather than an error.
 *
 * @param value The field value to be parsed, possibly missing
 *
 * @returns An immutable list of the elements of `value`, trimmed of the whitespace surrounding them, in the order
 *     they are stated; empty if `value` is missing or states no non-empty element
 *
 * @example
 *
 * Elements are read by mapping a parser over them: {@link parseItem} where a field states parameters on each element,
 * as `Accept` and `TE` do, or one of your own where this package doesn't cover the grammar. Pass a lambda rather than
 * the parser itself, which `map` would also feed the element index.
 *
 * ```typescript
 * parseList(headers.get("accept-encoding")).map(element => parseItem(element));
 * ```
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.1 RFC 9110 § 5.6.1 - Lists (#rule ABNF Extension)}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.4 RFC 9110 § 5.6.4 - Quoted Strings}
 */
export function parseList(value: Nullable<string>): readonly string[] {

	return (value?.match(ElementsPattern) ?? [])
		.map(element => element.trim())
		.filter(element => element !== "");

}

/**
 * Parses a name / value pair.
 *
 * > [!NOTE]
 * > Reads one parameter of an {@link parseItem item} and equally one directive of a field stating name / value
 * > directives, `Cache-Control` among them, the two differing only in whether the value is optional. Names are
 * > case-insensitive and reported in lowercase; a value stated as a quoted string is unquoted and unescaped, and one
 * > left unstated is reported as empty, so presence alone answers a flag.
 *
 * @param parameter The name / value pair to be parsed
 *
 * @returns An immutable pair of the lowercase name `parameter` states and the value it states past the first equals
 *     sign, empty if unstated
 *
 * @example
 *
 * Mapped over {@link parseList}, this reads a field keyed by name, `Map` resolving a repeated name last-wins as
 * those fields prescribe.
 *
 * ```typescript
 * new Map(parseList(headers.get("cache-control")).map(directive => parseParameter(directive)));
 * ```
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.6 RFC 9110 § 5.6.6 - Parameters}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9111#section-5.2 RFC 9111 § 5.2 - Cache-Control}
 */
export function parseParameter(parameter: string): readonly [name: string, value: string] {

	const [ , name = "", value = "" ]=PairPattern.exec(parameter) ?? [];

	return [ name.toLowerCase(), parseQuoted(value) ];

}

/**
 * Parses an item field value.
 *
 * > [!NOTE]
 * > Reads a value a field states on its own, as `Content-Type` and `Content-Disposition` do, and equally one element
 * > of a list already split with {@link parseList}. Leading and trailing whitespace is trimmed away.
 * >
 * > The shape recurs across field definitions rather than being defined once, `Content-Type`, the `q` weights and the
 * > `Link` parameters among them; RFC 9651 later codified it as a typed structured field, whose types this reads as
 * > plain text.
 * >
 * > The value is reported as stated, as its case-sensitivity depends on the field, and unquoted and unescaped where
 * > stated as a quoted string; a value left unstated is reported as empty. Parameter names are case-insensitive and
 * > reported in lowercase; where a name is repeated, the last value wins.
 * >
 * > The item is reported as stated and never rejected: nothing is checked against the field grammar. A value opening
 * > a quote it doesn't close isn't taken as quoted and is reported verbatim, quote included; whitespace around an
 * > equals sign, which the grammar forbids, is reported as part of the parameter name and of its value.
 *
 * @param value The field value to be parsed, possibly missing
 *
 * @returns An immutable pair of the value `value` opens with and an immutable map of the parameters qualifying it,
 *     keyed by lowercase name; both empty if `value` is missing or states nothing
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.6 RFC 9110 § 5.6.6 - Parameters}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-5.6.4 RFC 9110 § 5.6.4 - Quoted Strings}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9651 RFC 9651 - Structured Field Values for HTTP}
 */
export function parseItem(value: Nullable<string>): readonly [value: string, parameters: ReadonlyMap<string, string>] {

	const [ , head = "", tail = "" ]=ItemPattern.exec(value ?? "") ?? [];

	return [ parseQuoted(head.trim()), new Map((tail.match(ParametersPattern) ?? [])

		.map(parameter => parameter.trim())
		.filter(parameter => parameter !== "")
		.map(parameter => parseParameter(parameter))

	) ];

}
