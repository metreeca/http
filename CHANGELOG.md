# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unpublished](https://github.com/metreeca/http/commits/HEAD)

### Added

- `@metreeca/http` composable fetch middleware, exposing the `Fetch` and `Middleware` types, the `createFetch`
  assembler and the RFC 9110 HTTP status code constants, migrated from `@metreeca/core/fetch` and
  `@metreeca/core/http`
- `@metreeca/http/basic` and `@metreeca/http/bearer` authentication middlewares
- `@metreeca/http/headers` default header field injection middleware
- `@metreeca/http/success` middleware admitting only 2xx responses, exposing the `Problem` type and reporting failures
  as RFC 9457 problem details
- `@metreeca/http/throttle` adaptive pacing and retry middleware
- `@metreeca/http/timeout` response timeout middleware
- `@metreeca/http/transport` middleware routing exchanges through a given fetch implementation
