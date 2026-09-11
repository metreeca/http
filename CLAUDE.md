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
carries the `Fetch` and `Middleware` types, the `createFetch` assembler and the status code constants.

The package was migrated from `@metreeca/core/fetch` and `@metreeca/core/http`, which have since been removed from
`@metreeca/core`.

# References

- [@metreeca/core](https://github.com/metreeca/core) - Core utilities and shared types

# NPM Scripts

- **`npm run clean`** - Remove dependencies and build artefacts
- **`npm run prime`** - Install dependencies from the lockfile
- **`npm run setup`** - Install dependencies and link sibling `@metreeca/*` repositories
- **`npm run build`** - Compile sources and generate docs
- **`npm run check`** - Run the test suite
- **`npm run proof`** - Serve live docs

> [!CAUTION]
> **`prime` and `setup` are not interchangeable.** Run `prime` when finalising a public release: `@metreeca/*` imports
> resolve to the published releases recorded in the lockfile. Run `setup` for local development against unpublished
> sibling branches: imports resolve to the working copies in the neighbouring repositories.

# Documentation Synchronization

The following descriptions must be kept in sync:

- `package.json`: `description` field
- `README.md`: first line after badges
- GitHub repository "About" section

The module listing order must be kept in sync as well:

- `package.json`: `exports` field
- `README.md`: module table and its link reference definitions

Modules are listed by `src` directory, root module first: `authenticators`, `controllers`, `resolvers`. TypeDoc derives
its entry points from `exports` and preserves their order (`sortEntryPoints: false`), so this order also drives the
generated documentation navigation.
