# @metreeca/http

[![npm](https://img.shields.io/npm/v/@metreeca/http)](https://www.npmjs.com/package/@metreeca/http)

Composable TypeScript middleware for the standard fetch API.

**@metreeca/http** layers recurring HTTP concerns over the standard
[`fetch`](https://developer.mozilla.org/docs/Web/API/Window/fetch) function, without introducing a bespoke client API. A
middleware wraps a fetch implementation, returning a new one with the same signature that adjusts requests and responses
as they flow through, and a chain of them is assembled into a single client to be shared across an application:

- **Drop-in Clients**: every client is a standard `fetch` function, interchangeable with the platform primitive
- **Focused Composition**: each middleware handles one concern, and a client stacks just the ones it needs
- **Bundled Middlewares**: recurring concerns come solved and tested, keeping call sites free of boilerplate
- **Open Customisation**: your own middlewares are written and layered exactly like the bundled ones

# Installation

```shell
npm install @metreeca/http
```

> [!WARNING]
>
> TypeScript consumers must use `"moduleResolution": "nodenext"/"node16"/"bundler"` in `tsconfig.json`.
> The legacy `"node"` resolver is not supported.

# Usage

A client is assembled once from the middlewares an application needs and shared across it, with the root module
supplying the assembler and each subpath module a middleware:

```typescript
import { createFetch } from "@metreeca/http";
import { bearer } from "@metreeca/http/bearer";
import { headers } from "@metreeca/http/headers";
import { success } from "@metreeca/http/success";
import { timeout } from "@metreeca/http/timeout";

const client = createFetch(                // shared across the application
	bearer(() => session.token),             // Authorization header, resolved per request
	headers({ Accept: "application/json" }),
	success(),                               // rejects unless response.ok
	timeout(5000)                            // gives up on a server that never replies
);

const response = await client("https://api.example.com/data");
```

Middlewares are layered in declaration order: requests are processed by the first middleware first and reach the
standard `fetch` function last, while responses travel back through the chain in reverse. The resulting client is
itself a standard `fetch` function, so it is handed to anything expecting the platform primitive and is itself wrapped
again by a further chain.

> [!NOTE]
>
> This section introduces the overall organisation; each module documents its own concern in detail in the API
> reference:
>
> | Module                     | Description                      |
> |----------------------------|----------------------------------|
> | [@metreeca/http]           | Client assembly and status codes |
> | **Exchange Control**       |                                  |
> | [@metreeca/http/headers]   | Default header fields            |
> | [@metreeca/http/throttle]  | Adaptive pacing and retries      |
> | [@metreeca/http/timeout]   | Bounded wait for responses       |
> | [@metreeca/http/success]   | Response status checking         |
> | [@metreeca/http/transport] | Custom fetch transport           |
> | **Authentication**         |                                  |
> | [@metreeca/http/basic]     | `Basic` authentication           |
> | [@metreeca/http/bearer]    | `Bearer` authentication          |

[@metreeca/http]: https://metreeca.github.io/http/modules/index.html

[@metreeca/http/headers]: https://metreeca.github.io/http/modules/controllers_headers.html

[@metreeca/http/success]: https://metreeca.github.io/http/modules/controllers_success.html

[@metreeca/http/throttle]: https://metreeca.github.io/http/modules/controllers_throttle.html

[@metreeca/http/timeout]: https://metreeca.github.io/http/modules/controllers_timeout.html

[@metreeca/http/transport]: https://metreeca.github.io/http/modules/controllers_transport.html

[@metreeca/http/basic]: https://metreeca.github.io/http/modules/authenticators_basic.html

[@metreeca/http/bearer]: https://metreeca.github.io/http/modules/authenticators_bearer.html

# Support

- open an [issue](https://github.com/metreeca/http/issues) to report a problem or to suggest a new feature
- start a [discussion](https://github.com/metreeca/http/discussions) to ask a how-to question or to share an idea

# License

This project is licensed under the Apache 2.0 License –
see [LICENSE](https://github.com/metreeca/http?tab=Apache-2.0-1-ov-file) file for details.
