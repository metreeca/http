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
 * XSRF protection middleware.
 *
 * Proves to the server that a state-changing request comes from a document it served, rather than from a page merely
 * riding the session cookie.
 *
 * The convention is the one Angular established and servers widely implement: the server states the token in a
 * script-readable `XSRF-TOKEN` cookie, the client echoes it in an `X-XSRF-TOKEN` field.
 *
 * **Usage**
 *
 * ```typescript
 * import { createFetch } from "@metreeca/http";
 * import { xsrf } from "@metreeca/http/xsrf";
 *
 * const client = createFetch(xsrf());
 * ```
 *
 * @module
 *
 * @see {@link https://angular.dev/best-practices/security#httpclient-xsrf-csrf-security Angular - HttpClient XSRF/CSRF security}
 * @see {@link https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html OWASP - Cross-Site Request Forgery Prevention}
 */

import type { Middleware } from "../index.js";
import { headers } from "./headers.js";


/**
 * The name of the header field echoing the protection token.
 */
const TokenHeader="X-XSRF-TOKEN";

/**
 * The pattern matching the protection token in the document cookies.
 *
 * Matching is anchored to a cookie boundary, so that neither a cookie whose name ends in `XSRF-TOKEN` nor one whose
 * value states it is read in place of the token.
 */
const TokenPattern=/(?:^|;)\s*XSRF-TOKEN\s*=\s*"?([^\s,;\\"]*)"?/;


/**
 * The set of safe HTTP methods, which carry no protection field.
 */
const SafeMethods: ReadonlySet<string>=new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates an XSRF protection middleware.
 *
 * Protects unsafe same-origin exchanges only: a safe method changes nothing on the server, and a cross-origin target
 * is no place to disclose the token to. An exchange stating its method in lowercase is protected as one stating it in
 * uppercase, as the platform normalises the standard methods before the exchange is inspected.
 *
 * The token is read from the document on every exchange, rather than once when the middleware is created, so that a
 * token renewed or rotated mid-session is echoed as it stands without the client being assembled again.
 *
 * An exchange stating a field of its own is left as it is, leaving a call site taking care of the token on its own
 * terms in charge; one running in a document stating no token, or an empty one, is sent unprotected, for the server
 * to refuse; one attempted outside a browser, where no document is there to state a token, is rejected without being
 * sent.
 *
 * > [!IMPORTANT]
 * > This is the client half of the protection only: the server completes it by refusing an unsafe request whose field
 * > doesn't match the cookie it stated. On a server that doesn't check, echoing the token protects nothing.
 * >
 * > The server is expected to bind the token to the session, as signed double-submit prescribes: where it merely
 * > compares the cookie to the header, whoever controls a sibling subdomain plants a token of their choosing under the
 * > parent domain and echoes it back.
 * >
 * > An application and an endpoint on separate origins, as `app.example.com` and `api.example.com` are, draw no
 * > protection from this scheme: the domain-scoped session cookie is still sent while the field is not, so the server
 * > refuses every unsafe exchange, and the deployment calls for a scheme of its own.
 *
 * @returns A {@link Middleware} echoing the token stated by the document on every exchange it protects
 *
 * @see {@link https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#signed-double-submit-cookie-recommended OWASP - Signed double-submit cookie}
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110#section-9.2.1 RFC 9110 § 9.2.1 - Safe Methods}
 */
export function xsrf(): Middleware {

	return headers(({ method, url }): HeadersInit => {

		const protectable=!SafeMethods.has(method) && new URL(url).origin === location.origin;

		const token=protectable ? (TokenPattern.exec(document.cookie) ?? [])[1] : undefined;

		return token ? { [TokenHeader]: token } : {};

	});

}
