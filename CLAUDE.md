> [!CAUTION]
>
> - **UNDER NO CIRCUMSTANCES** rearchitect or refactor unrelated code beyond the requested scope.
> - **NEVER** make unsolicited changes or revert **unrelated** user edits.
> - **ONLY** modify code when explicitly requested or clearly required.

> [!IMPORTANT]
>
> - **ALL** relevant skills **MUST** be used when applicable without continuous prompting.
> - **SKILL** guidance **ALWAYS** supersedes internal general-purpose knowledge.

# Overview

`@metreeca/http` is the HTTP substrate shared across Metreeca packages: a composable middleware layer over the standard
`fetch` function, ready-made middlewares for recurring concerns, and the RFC 9110 status code constants.

Each middleware is published as its own subpath module, so consumers pay only for what they import; the root module
carries the `Fetch`, `Middleware` and `Problem` types and the `createFetch` assembler.

The package was migrated from `@metreeca/core/fetch` and `@metreeca/core/http`, which still carry the original modules.

# References

- [@metreeca/core](https://github.com/metreeca/core) - Core utilities and shared types

# NPM Scripts

- **`npm run clean`** - Remove build artifacts and dependencies (dist, docs, node_modules)
- **`npm run setup`** - Install dependencies
- **`npm run build`** - Build TypeScript and generate TypeDoc documentation
- **`npm run check`** - Run Vitest test suite
- **`npm run proof`** - Start TypeDoc watch mode and documentation server

# Documentation Synchronization

The following descriptions must be kept in sync:

- `package.json`: `description` field
- `README.md`: first line after badges
- GitHub repository "About" section
