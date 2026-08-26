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
 * Fetch client assembly and HTTP status codes.
 *
 * Provides a composable middleware layer over the standard
 * {@link https://developer.mozilla.org/docs/Web/API/Window/fetch `fetch`} function, with ready-made middlewares for
 * recurring concerns published as subpath modules. A {@link Middleware} wraps a {@link Fetch} implementation, returning
 * a drop-in replacement that adjusts requests and responses as they flow through, and {@link createFetch} assembles a
 * chain of them into a single client to be shared across an application.
 *
 * Named constants for the HTTP status codes are provided alongside, so that response handling reads as intent rather
 * than as bare numeric literals. Coverage is complete for the codes defined by RFC 9110 § 15, extended with the
 * registered codes in common use defined by later specifications; placeholders reserved without a name and codes
 * registered by narrower protocol extensions are left out and compared as plain numbers.
 *
 * **Usage**
 *
 * ```typescript
 * import { createFetch } from "@metreeca/http";
 * import { basic } from "@metreeca/http/basic";
 * import { success } from "@metreeca/http/success";
 *
 * // shared across the application
 *
 * const client = createFetch(
 *   basic("user", "secret"),
 *   success()
 * );
 *
 * // rejects unless response.ok
 *
 * const response = await client("https://api.example.com/data");
 * ```
 *
 * @module index
 *
 * @see {@link https://fetch.spec.whatwg.org/ WHATWG Fetch Standard}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15 RFC 9110 § 15 - Status Codes}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status MDN - HTTP response status codes}
 * @see {@link https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml IANA HTTP Status Code
 *     Registry}
 */


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * The initial part of the request was received and not yet rejected.
 *
 * @group 1xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.2.1 RFC 9110 § 15.2.1 - 100 Continue}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/100 MDN - 100 Continue}
 */
export const Continue = 100;

/**
 * The server is switching to the protocol requested through the `Upgrade` header field.
 *
 * @group 1xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.2.2 RFC 9110 § 15.2.2 - 101 Switching Protocols}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/101 MDN - 101 Switching Protocols}
 */
export const SwitchingProtocols = 101;

/**
 * The server is likely to send a final response including the header fields of this informational response.
 *
 * @group 1xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc8297#section-2 RFC 8297 § 2 - 103 Early Hints}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/103 MDN - 103 Early Hints}
 */
export const EarlyHints = 103;


/**
 * The request succeeded.
 *
 * @group 2xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.3.1 RFC 9110 § 15.3.1 - 200 OK}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/200 MDN - 200 OK}
 */
export const OK = 200;

/**
 * The request was fulfilled and one or more new resources were created.
 *
 * @group 2xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.3.2 RFC 9110 § 15.3.2 - 201 Created}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/201 MDN - 201 Created}
 */
export const Created = 201;

/**
 * The request was accepted for processing, which hasn't completed.
 *
 * @group 2xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.3.3 RFC 9110 § 15.3.3 - 202 Accepted}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/202 MDN - 202 Accepted}
 */
export const Accepted = 202;

/**
 * The request succeeded, but a transforming intermediary modified the enclosed content.
 *
 * @group 2xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.3.4 RFC 9110 § 15.3.4 - 203 Non-Authoritative
 *     Information}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/203 MDN - 203 Non-Authoritative Information}
 */
export const NonAuthoritativeInformation = 203;

/**
 * The request was fulfilled and there is no additional content to send.
 *
 * @group 2xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.3.5 RFC 9110 § 15.3.5 - 204 No Content}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/204 MDN - 204 No Content}
 */
export const NoContent = 204;

/**
 * The request was fulfilled and the user agent is expected to reset the document view that sent it.
 *
 * @group 2xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.3.6 RFC 9110 § 15.3.6 - 205 Reset Content}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/205 MDN - 205 Reset Content}
 */
export const ResetContent = 205;

/**
 * The range request was fulfilled by transferring one or more parts of the selected representation.
 *
 * @group 2xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.3.7 RFC 9110 § 15.3.7 - 206 Partial Content}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/206 MDN - 206 Partial Content}
 */
export const PartialContent = 206;


/**
 * The target resource has more than one representation, with information about the alternatives provided for selection.
 *
 * @group 3xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.4.1 RFC 9110 § 15.4.1 - 300 Multiple Choices}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/300 MDN - 300 Multiple Choices}
 */
export const MultipleChoices = 300;

/**
 * The target resource was assigned a new permanent URI, to be used by future references.
 *
 * @group 3xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.4.2 RFC 9110 § 15.4.2 - 301 Moved Permanently}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/301 MDN - 301 Moved Permanently}
 */
export const MovedPermanently = 301;

/**
 * The target resource resides temporarily under a different URI.
 *
 * @group 3xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.4.3 RFC 9110 § 15.4.3 - 302 Found}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/302 MDN - 302 Found}
 */
export const Found = 302;

/**
 * The user agent is redirected to a different resource, as an indirect response to the original request.
 *
 * @group 3xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.4.4 RFC 9110 § 15.4.4 - 303 See Other}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/303 MDN - 303 See Other}
 */
export const SeeOther = 303;

/**
 * The condition of a conditional `GET` or `HEAD` request evaluated to false, leaving the cached response current.
 *
 * @group 3xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.4.5 RFC 9110 § 15.4.5 - 304 Not Modified}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/304 MDN - 304 Not Modified}
 */
export const NotModified = 304;

/**
 * The target resource is to be accessed through a proxy.
 *
 * @group 3xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.4.6 RFC 9110 § 15.4.6 - 305 Use Proxy}
 *
 * @deprecated Defined by a previous version of the specification and deprecated by RFC 9110 § 15.4.6
 */
export const UseProxy = 305;

/**
 * The target resource resides temporarily under a different URI, to be requested with the same method.
 *
 * @group 3xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.4.8 RFC 9110 § 15.4.8 - 307 Temporary Redirect}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/307 MDN - 307 Temporary Redirect}
 */
export const TemporaryRedirect = 307;

/**
 * The target resource was assigned a new permanent URI, to be requested with the same method.
 *
 * @group 3xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.4.9 RFC 9110 § 15.4.9 - 308 Permanent Redirect}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/308 MDN - 308 Permanent Redirect}
 */
export const PermanentRedirect = 308;


/**
 * The request won't be processed, as it is perceived to be a client error.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.1 RFC 9110 § 15.5.1 - 400 Bad Request}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/400 MDN - 400 Bad Request}
 */
export const BadRequest = 400;

/**
 * The request lacks valid authentication credentials for the target resource.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.2 RFC 9110 § 15.5.2 - 401 Unauthorized}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/401 MDN - 401 Unauthorized}
 */
export const Unauthorized = 401;

/**
 * Reserved for future use.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.3 RFC 9110 § 15.5.3 - 402 Payment Required}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/402 MDN - 402 Payment Required}
 */
export const PaymentRequired = 402;

/**
 * The server understood the request but refuses to fulfil it.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.4 RFC 9110 § 15.5.4 - 403 Forbidden}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/403 MDN - 403 Forbidden}
 */
export const Forbidden = 403;

/**
 * The origin server found no current representation for the target resource, or won't disclose that one exists.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.5 RFC 9110 § 15.5.5 - 404 Not Found}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/404 MDN - 404 Not Found}
 */
export const NotFound = 404;

/**
 * The request method is known to the server but not supported by the target resource.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.6 RFC 9110 § 15.5.6 - 405 Method Not Allowed}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/405 MDN - 405 Method Not Allowed}
 */
export const MethodNotAllowed = 405;

/**
 * No response matching the proactive content negotiation header fields of the request can be produced.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.7 RFC 9110 § 15.5.7 - 406 Not Acceptable}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/406 MDN - 406 Not Acceptable}
 */
export const NotAcceptable = 406;

/**
 * The client needs to authenticate with a proxy.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.8 RFC 9110 § 15.5.8 - 407 Proxy Authentication
 *     Required}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/407 MDN - 407 Proxy Authentication Required}
 */
export const ProxyAuthenticationRequired = 407;

/**
 * No complete request message was received within the time the server was prepared to wait.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.9 RFC 9110 § 15.5.9 - 408 Request Timeout}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/408 MDN - 408 Request Timeout}
 */
export const RequestTimeout = 408;

/**
 * The request conflicts with the current state of the target resource.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.10 RFC 9110 § 15.5.10 - 409 Conflict}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/409 MDN - 409 Conflict}
 */
export const Conflict = 409;

/**
 * Access to the target resource is no longer available at the origin server, likely permanently.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.11 RFC 9110 § 15.5.11 - 410 Gone}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/410 MDN - 410 Gone}
 */
export const Gone = 410;

/**
 * The request is refused without a defined `Content-Length` header field.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.12 RFC 9110 § 15.5.12 - 411 Length Required}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/411 MDN - 411 Length Required}
 */
export const LengthRequired = 411;

/**
 * One or more conditions given in the request header fields evaluated to false.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.13 RFC 9110 § 15.5.13 - 412 Precondition Failed}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/412 MDN - 412 Precondition Failed}
 */
export const PreconditionFailed = 412;

/**
 * The request content is larger than the server is willing or able to process.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.14 RFC 9110 § 15.5.14 - 413 Content Too Large}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/413 MDN - 413 Content Too Large}
 */
export const ContentTooLarge = 413;

/**
 * The target URI is longer than the server is willing to process.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.15 RFC 9110 § 15.5.15 - 414 URI Too Long}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/414 MDN - 414 URI Too Long}
 */
export const URITooLong = 414;

/**
 * The request content is in a format unsupported by this method on the target resource.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.16 RFC 9110 § 15.5.16 - 415 Unsupported Media Type}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/415 MDN - 415 Unsupported Media Type}
 */
export const UnsupportedMediaType = 415;

/**
 * No range in the `Range` header field overlaps the current extent of the selected representation.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.17 RFC 9110 § 15.5.17 - 416 Range Not Satisfiable}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/416 MDN - 416 Range Not Satisfiable}
 */
export const RangeNotSatisfiable = 416;

/**
 * The expectation given in the `Expect` header field couldn't be met.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.18 RFC 9110 § 15.5.18 - 417 Expectation Failed}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/417 MDN - 417 Expectation Failed}
 */
export const ExpectationFailed = 417;

/**
 * The request was directed at a server unable or unwilling to answer authoritatively for the target URI.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.20 RFC 9110 § 15.5.20 - 421 Misdirected Request}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/421 MDN - 421 Misdirected Request}
 */
export const MisdirectedRequest = 421;

/**
 * The request content was syntactically correct, but its instructions couldn't be processed.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.21 RFC 9110 § 15.5.21 - 422 Unprocessable Content}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/422 MDN - 422 Unprocessable Content}
 */
export const UnprocessableContent = 422;

/**
 * The request is refused under the current protocol, but might be served after an upgrade.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.5.22 RFC 9110 § 15.5.22 - 426 Upgrade Required}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/426 MDN - 426 Upgrade Required}
 */
export const UpgradeRequired = 426;

/**
 * The origin server requires the request to be conditional.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6585#section-3 RFC 6585 § 3 - 428 Precondition Required}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/428 MDN - 428 Precondition Required}
 */
export const PreconditionRequired = 428;

/**
 * The client sent too many requests within a given amount of time.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6585#section-4 RFC 6585 § 4 - 429 Too Many Requests}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/429 MDN - 429 Too Many Requests}
 */
export const TooManyRequests = 429;

/**
 * The request is refused because its header fields are too large.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6585#section-5 RFC 6585 § 5 - 431 Request Header Fields Too Large}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/431 MDN - 431 Request Header Fields Too
 *     Large}
 */
export const RequestHeaderFieldsTooLarge = 431;

/**
 * Access to the resource is denied as a consequence of a legal demand.
 *
 * @group 4xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc7725#section-3 RFC 7725 § 3 - 451 Unavailable For Legal Reasons}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/451 MDN - 451 Unavailable For Legal Reasons}
 */
export const UnavailableForLegalReasons = 451;


/**
 * The server met an unexpected condition preventing it from fulfilling the request.
 *
 * @group 5xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.6.1 RFC 9110 § 15.6.1 - 500 Internal Server Error}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/500 MDN - 500 Internal Server Error}
 */
export const InternalServerError = 500;

/**
 * The server doesn't support the functionality required to fulfil the request.
 *
 * @group 5xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.6.2 RFC 9110 § 15.6.2 - 501 Not Implemented}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/501 MDN - 501 Not Implemented}
 */
export const NotImplemented = 501;

/**
 * The server, acting as a gateway or proxy, received an invalid response from an inbound server.
 *
 * @group 5xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.6.3 RFC 9110 § 15.6.3 - 502 Bad Gateway}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/502 MDN - 502 Bad Gateway}
 */
export const BadGateway = 502;

/**
 * The server is temporarily unable to handle the request, for instance under overload or scheduled maintenance.
 *
 * @group 5xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.6.4 RFC 9110 § 15.6.4 - 503 Service Unavailable}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/503 MDN - 503 Service Unavailable}
 */
export const ServiceUnavailable = 503;

/**
 * The server, acting as a gateway or proxy, received no timely response from an upstream server.
 *
 * @group 5xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.6.5 RFC 9110 § 15.6.5 - 504 Gateway Timeout}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/504 MDN - 504 Gateway Timeout}
 */
export const GatewayTimeout = 504;

/**
 * The server doesn't support, or refuses to support, the major HTTP version of the request.
 *
 * @group 5xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-15.6.6 RFC 9110 § 15.6.6 - 505 HTTP Version Not
 *     Supported}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/505 MDN - 505 HTTP Version Not Supported}
 */
export const HTTPVersionNotSupported = 505;

/**
 * The client needs to authenticate to gain network access.
 *
 * @group 5xx Codes
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6585#section-6 RFC 6585 § 6 - 511 Network Authentication Required}
 * @see {@link https://developer.mozilla.org/docs/Web/HTTP/Reference/Status/511 MDN - 511 Network Authentication
 *     Required}
 */
export const NetworkAuthenticationRequired = 511;


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Fetch function signature.
 *
 * Types both the standard {@link https://developer.mozilla.org/docs/Web/API/Window/fetch `fetch`} function and the
 * drop-in replacements derived from it, so that wrapped clients stay interchangeable with the platform primitive.
 */
export type Fetch = typeof fetch;

/**
 * Fetch middleware.
 *
 * Wraps a {@link Fetch} implementation, returning a drop-in replacement that adjusts requests before delegating to it
 * and responses after it replies. Middlewares are layered into a client by {@link createFetch}, each seeing the
 * exchange as the layers above it left it.
 */
export type Middleware = (fetch: Fetch) => Fetch


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a fetch client from a chain of middlewares.
 *
 * Layers `middlewares` over the standard
 * {@link https://developer.mozilla.org/docs/Web/API/Window/fetch `fetch`} function in declaration order: requests are
 * processed by the first middleware first and reach the standard function last; responses travel back through the
 * chain in reverse. An empty chain yields the standard function itself.
 *
 * The standard function is resolved when the chain is assembled, so a client routes through a global replaced before
 * its creation, such as a test double or a polyfill installed at start-up, but not through one replaced afterwards.
 * To bind a client to an implementation of its own, regardless of the global one, close the chain with
 * {@link controllers/transport!transport transport}.
 *
 * @param middlewares The {@link Middleware | middlewares} to be layered over the standard `fetch` function, in request
 *     processing order
 *
 * @returns A drop-in replacement for the standard `fetch` function routing every exchange through `middlewares`
 */
export function createFetch(...middlewares: readonly Middleware[]): Fetch {

	return middlewares.reduceRight((next, middleware) => middleware(next), fetch);

}
