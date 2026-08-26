# @metreeca/http

[![npm](https://img.shields.io/npm/v/@metreeca/http)](https://www.npmjs.com/package/@metreeca/http)

Composable TypeScript middleware for the standard fetch API.

**@metreeca/http** layers recurring HTTP concerns over the standard
[`fetch`](https://developer.mozilla.org/docs/Web/API/Window/fetch) function, without replacing it. A middleware wraps a
fetch implementation, returning a drop-in replacement that adjusts requests and responses as they flow through, and a
chain of them is assembled into a single client to be shared across an application:

- **Drop-in Clients**: every client is a standard `fetch` function, interchangeable with the platform primitive
- **Ready-Made Concerns**: authentication, default fields, status checking, pacing, timeouts and transport selection
- **Structured Failures**: error responses and transport failures alike surfaced as RFC 9457 problem details

# Installation

```shell
npm install @metreeca/http
```

> [!WARNING]
>
> TypeScript consumers must use `"moduleResolution": "nodenext"/"node16"/"bundler"` in `tsconfig.json`.
> The legacy `"node"` resolver is not supported.

# Usage

> [!NOTE]
>
> This section introduces essential concepts; for complete coverage, see the API reference:
>
> | Module                       | Description                              |
> |------------------------------|------------------------------------------|
> | [@metreeca/http]             | Composable fetch middleware              |
> | [@metreeca/http/status]      | RFC 9110 HTTP status codes               |
> | **Middlewares**              |                                          |
> | [@metreeca/http/basic]       | `Basic` authentication                   |
> | [@metreeca/http/bearer]      | `Bearer` authentication                  |
> | [@metreeca/http/headers]     | Default header fields                    |
> | [@metreeca/http/success]     | Response status checking                 |
> | [@metreeca/http/throttle]    | Adaptive pacing and retries              |
> | [@metreeca/http/timeout]     | Bounded wait for responses               |
> | [@metreeca/http/transport]   | Custom fetch transport                   |

[@metreeca/http]: https://metreeca.github.io/http/modules/index.html

[@metreeca/http/status]: https://metreeca.github.io/http/modules/status.html

[@metreeca/http/basic]: https://metreeca.github.io/http/modules/basic.html

[@metreeca/http/bearer]: https://metreeca.github.io/http/modules/bearer.html

[@metreeca/http/headers]: https://metreeca.github.io/http/modules/headers.html

[@metreeca/http/success]: https://metreeca.github.io/http/modules/success.html

[@metreeca/http/throttle]: https://metreeca.github.io/http/modules/throttle.html

[@metreeca/http/timeout]: https://metreeca.github.io/http/modules/timeout.html

[@metreeca/http/transport]: https://metreeca.github.io/http/modules/transport.html

## Assembling a Client

`createFetch` layers middlewares over the standard `fetch` function in declaration order: requests are processed by the
first middleware first and reach the standard function last, while responses travel back through the chain in reverse.
An empty chain yields the standard function itself:

```typescript
import { createFetch } from "@metreeca/http";
import { bearer } from "@metreeca/http/bearer";
import { headers } from "@metreeca/http/headers";
import { success } from "@metreeca/http/success";

const client = createFetch(              // shared across the application
	bearer(() => session.token),         // Authorization header, resolved per request
	headers({ Accept: "application/json" }),
	success()                            // rejects unless response.ok
);

const response = await client("https://api.example.com/data");
```

The resulting client is a standard `fetch` function, so it is handed to anything expecting the platform primitive and
is itself wrapped again by a further chain.

## Authenticating Requests

`basic` and `bearer` attach credentials to every request, replacing any already carried by it, so they are best applied
to a client dedicated to a single origin. Credentials supplied as values are encoded once when the middleware is
created, while a `bearer` token supplied as a function is resolved on every request, against the request as it is about
to be sent, picking up tokens rotated elsewhere without assembling a new client:

```typescript
import { basic } from "@metreeca/http/basic";
import { bearer } from "@metreeca/http/bearer";

basic("user", "secret");                    // static credentials
bearer(async request => vault.token(request)); // resolved per request
```

`headers` injects default fields instead: a field already carried by the request is left as it is, so injected fields
stand as defaults an exchange may override on its own terms.

## Handling Failures

`success` reduces status handling to a single rejection path: 2xx responses resolve unchanged, while error responses
and transport failures alike reject with an immutable `Problem`, the RFC 9457 problem details shape, carrying the
status, the reason as `detail`, and the parsed body as `report` when the `Content-Type` allows it to be read:

```typescript
import { createFetch } from "@metreeca/http";
import { success } from "@metreeca/http/success";
import { NotFound } from "@metreeca/http/status";

const client = createFetch(success());

try {

	const response = await client("https://api.example.com/data");

} catch ( problem ) { // a Problem, whatever went wrong

	if ( problem.status === NotFound ) { /* handle a missing resource */ }

}
```

The middleware is idempotent: a problem raised by an inner layer is relayed unchanged, rather than reported again as a
transport failure.

## Pacing and Bounding Exchanges

`throttle` holds each exchange until a shared adaptive throttle grants it, so that a client keeps to the rate its
target is willing to serve without the call sites having to coordinate: successful exchanges speed the client up,
failed ones slow it down, and a `Retry-After` header field sets the delay outright. Transient failures, that is `408`,
`429` and any `5xx`, are retried up to the stated budget.

`timeout` bounds the wait for a response, reporting a `504 Gateway Timeout` in place of a response that never arrives;
the bound is lifted as soon as the response is reported, leaving the body free to be streamed for as long as it takes:

```typescript
import { createFetch } from "@metreeca/http";
import { success } from "@metreeca/http/success";
import { throttle } from "@metreeca/http/throttle";
import { timeout } from "@metreeca/http/timeout";

const client = createFetch(
	success(),                             // declared before throttle: retries see responses, not rejections
	throttle({ minimum: 100, attempts: 3 }),
	timeout(5000)                          // bounds each attempt on its own
);
```

## Supplying a Transport

`createFetch` resolves the standard function when the chain is assembled, so a client routes through a global replaced
before its creation, such as a test double or a polyfill installed at start-up, but not through one replaced
afterwards. `transport` binds a client to an implementation of its own, for instance a proxy-bound `undici` fetch, a
platform service binding, or a test double, and is declared last in a chain:

```typescript
import { createFetch } from "@metreeca/http";
import { transport } from "@metreeca/http/transport";

const client = createFetch(transport(custom));
```

## Reading Status Codes

The [@metreeca/http/status] module names the HTTP status codes defined by RFC 9110 § 15, extended with the registered
codes in common use defined by later specifications, so that response handling reads as intent rather than as bare
numeric literals:

```typescript
import { NoContent, TooManyRequests } from "@metreeca/http/status";

if ( response.status === NoContent ) { /* nothing to decode */ }
```

# Support

- open an [issue](https://github.com/metreeca/http/issues) to report a problem or to suggest a new feature
- start a [discussion](https://github.com/metreeca/http/discussions) to ask a how-to question or to share an idea

# License

This project is licensed under the Apache 2.0 License –
see [LICENSE](https://github.com/metreeca/http?tab=Apache-2.0-1-ov-file) file for details.
