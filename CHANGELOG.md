# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unpublished](https://github.com/metreeca/http/compare/v0.1.1...HEAD)

### Changed

- **BREAKING**: the `@metreeca/http/cache` `ttl` option states a single freshness budget rather than a cap alone,
  supplying the freshness to assume where a response states none, as permitted by RFC 9111 § 4.2.2, so that a response
  carrying no expiration is reused instead of revalidated on every exchange; freshness is assumed only for the status
  codes RFC 9110 § 15.1 defines as heuristically cacheable and only where no `Cache-Control` `no-cache`, `max-age`,
  `must-revalidate` or `proxy-revalidate` directive and no `Expires` header field is stated, so a stated expiration
  keeps winning, however short it is
- **BREAKING**: `@metreeca/http/cache` assumes as the freshness of a response stating no expiration a tenth of the
  interval its `Last-Modified` reports its content as having gone unchanged, as RFC 9111 § 4.2.2 encourages, so that a
  resource edited a minute ago is revalidated sooner than one untouched for a year rather than both being reused for
  the same span; the assumed share is capped by `ttl`, which supplies the freshness where no usable `Last-Modified` is
  reported, and a stated expiration keeps winning over both

## [0.1.1](https://github.com/metreeca/http/releases/tag/v0.1.1) - 2026-08-28

### Added

- `@metreeca/http/cache` RFC 9111 response caching middleware, replaying and revalidating stored responses under the
  freshness the origin server states, invalidating on unsafe exchanges, capping reuse with a `ttl` option, keeping
  selected targets out with a `skip` option and holding entries in memory, in a custom `Store` or in a `Bucket`
- `@metreeca/http/protocol` custom protocol handler middleware, serving a URI scheme the platform doesn't resolve
  through a handler supplied by the consumer and relaying every other exchange downstream, so that local and remote
  content is addressed uniformly by URI through a single client
- `@metreeca/http/monitor` exchange reporting middleware, relaying exchanges untouched
- `@metreeca/http` request accessors reporting the method, target and header fields an exchange states, whatever the
  form it is stated in
- `@metreeca/http` header field parsing helpers reporting integers, instants, durations, quoted strings, lists,
  parameters and parameterised items, with malformed input reported as missing rather than as an error

### Changed

- `@metreeca/http/throttle` reads the `Retry-After` header field through the shared parsing helpers, ignoring a delay
  already elapsed

### Fixed

- the declared `@metreeca/core` floor is raised to `0.9.22`, the version first providing the glob matcher
  `@metreeca/http/cache` relies on to compile its `skip` patterns

## [0.1.0](https://github.com/metreeca/http/releases/tag/v0.1.0) - 2026-08-26

Initial release, migrated from `@metreeca/core/fetch` and `@metreeca/core/http`, which have since been removed from
`@metreeca/core`.

- `@metreeca/http` composable fetch middleware, exposing the `Fetch` and `Middleware` types, the `createFetch`
  assembler and the RFC 9110 HTTP status code constants
- `@metreeca/http/basic` and `@metreeca/http/bearer` authentication middlewares
- `@metreeca/http/headers` default header field injection middleware
- `@metreeca/http/success` middleware admitting only 2xx responses, exposing the `Problem` type and reporting failures
  as RFC 9457 problem details
- `@metreeca/http/throttle` adaptive pacing and retry middleware
- `@metreeca/http/timeout` response timeout middleware
- `@metreeca/http/transport` middleware routing exchanges through a given fetch implementation
