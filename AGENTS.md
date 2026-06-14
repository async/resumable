# Async Resumable Project Rules

This repo is currently specification-first. When implementation starts, this file
is the Codex-facing always-on guidance for building the TSRX resumable framework.

## Source Of Truth

- Read `specs/framework-design.md` first, then the relevant split spec under
  `specs/framework/`.
- Treat `specs/framework/archive/design-thread.md` as historical context, not the
  current implementation contract.
- Project-local task skills live under `.codex/skills/`. Use
  `$async-await-implementation` for implementation work and
  `$async-await-spec-maintenance` for spec edits when available.

## Core Framework Constraints

- TSRX-only. Do not add TSX/JSX support or reactive behavior in plain `.ts`
  files.
- No hydration. Component bodies execute during initial render, not during
  browser resume.
- No VDOM. Runtime graph data is state/dataflow and DOM locator metadata, not a
  virtual element tree or render-output reconciliation layer.
- Do not create a standalone `server` package. Initial render and browser
  resume are two phases of one unified runtime/render model, not separate
  framework products or authoring models.
- Treat monorepo libraries as internal implementation boundaries until tests
  prove what should be public. Most consumers should use the main package and
  curated re-exports; do not publish or document deep package APIs prematurely.
- First compiler implementation is JS/TS on `@tsrx/core`. OXC/native work is
  deferred until the framework behavior and artifact contracts are proven.
- Core packages are runtime-agnostic ESM. Avoid `node:*`, `fs`, `path`,
  `process`, `Buffer`, and Node-only assumptions in shared compiler/runtime code.
  Use host adapters for file access, module resolution, hashing, environment
  state, and dev-server integration.
- Prefer Web APIs plus `pathe` for filesystem-like path handling and `ufo` for
  URL/pathname/query handling.
- Build scripts and production optimization must use Rolldown or Vite only. Do
  not add standalone esbuild, terser, Rollup, SWC, webpack, Babel build
  pipelines, or similar secondary transformers/minifiers.

## Vite-Plus Monorepo Shape

This framework will be a **Deno workspace** and vite-plus monorepo with multiple
libraries. Deno owns the workspace/dependency source of truth; vite-plus is the
preferred command and tooling surface for build, test, check, format, and lint.

Use Witness as the Deno workspace reference:

- `/Users/jacksm5pro/dev/open-source/witness/deno.json`
- `/Users/jacksm5pro/dev/open-source/witness/vite.config.ts`

Use QDS and qwik-bundler as shape references for the root vite-plus config,
multi-lib pack configuration, and plugin/fixture organization:

- `/Users/jacksm5pro/dev/open-source/qwik-design-system/vite.config.ts`
- `/Users/jacksm5pro/dev/open-source/qwik-bundler/vite.config.ts`

Expected shape:

- root `deno.json` is the canonical workspace and dependency manifest
- root `vite.config.ts` owns pack, test, lint, format, and staged configuration
  through vite-plus
- initial package folders are `packages/resumable`, `packages/core`,
  `packages/protocol`, `packages/runtime`, `packages/serializer`,
  `packages/compiler`, `packages/rolldown`, `packages/vite`, and
  `packages/test-utils`
- `packages/resumable` is the main package for `@async/resumable`; the other
  packages are internal implementation boundaries until tests prove what should
  become public
- do not create `packages/server`
- package/library builds are represented as multiple vite-plus `pack` configs,
  similar to QDS's `buildOrder`
- framework packages live as multiple libs/packages rather than one large package
- prefer vite-plus commands directly: `vp pack`, `vp test`, `vp check`,
  `vp fmt`, `vp lint`, and `vp config`
- Deno tasks are allowed as thin repo-boundary aliases or for Deno-specific host
  scripts, but they should normally invoke vite-plus commands rather than
  replacing them
- use vite-plus test projects for Node/unit integration and browser/component
  testing where appropriate
- use `vite-plus/test/browser-playwright` for Vitest browser-mode provider wiring
- use vite-plus-managed formatting/linting tooling, including oxfmt/oxlint-style
  behavior exposed through `vp fmt`, `vp lint`, and `vp check`

Do not introduce pnpm, npm, or yarn as the primary workspace package manager.
If npm package metadata is needed for publishing or local package consumption,
generate it from the Deno-owned source of truth rather than hand-maintaining a
second manifest. Do not use this as an excuse to replace vite-plus commands with
Deno-native build/test/lint/format commands.

Do not add separate Jest, standalone Vitest CLI conventions, Prettier, ESLint,
Biome, tsup, tsdown, or custom build script stacks unless the spec is explicitly
reopened. The repo's default tooling entry point is vite-plus.

The QDS config is a reference for the monorepo/vite-plus shape, not permission
to copy Node-specific helpers into shared framework packages. The runtime-
agnostic rule still applies to compiler/runtime/render-resume code.

## Test-Driven Development

Everything is test-driven. For behavior changes and bug fixes, write or update
the closest focused test first, run it, and confirm it fails for the expected
reason before implementing.

Use the red-green-refactor loop:

1. Add the failing test that describes the missing behavior.
2. Run the narrowest command that proves the failure.
3. Implement the smallest code change that makes the test pass.
4. Rerun the focused test.
5. Broaden verification only when the change touches shared behavior.

Do not skip the failing-test step for implementation work. If the task is
spec-only, formatting-only, generated metadata, or genuinely impossible to test
first, say why in the final response.

Tests should assert observable behavior or artifact contracts, not incidental
implementation details. Compiler tests should prefer pass artifacts and
diagnostics over giant generated-bundle snapshots unless the final emit is the
thing under test.

## Test Types

- **Unit tests:** use `vite-plus` / `vp test` once the package exists. Cover pure
  compiler passes, graph runtime behavior, serializer units, symbol resolver
  helpers, path/URL utilities, and diagnostics.
- **Integration tests:** use `vite-plus` / `vp test` for fixture-backed
  integration across the compiler, runtime graph, unified render/resume runtime,
  Rolldown plugin, and Vite adapter.
- **Component/browser tests:** use Vitest browser mode for component-level DOM,
  SSR/resume, event, and interaction behavior. Model the harness after
  `/Users/jacksm5pro/dev/open-source/vitest-browser-qwik`, adapted for this
  framework instead of Qwik.
- **Pipeline tests:** use the local witness package at
  `/Users/jacksm5pro/dev/open-source/witness` to inspect how the Vite/Rolldown
  pipeline behaved. Use witness receipts for HMR, server restarts, client reloads,
  build artifacts, manifest output, leaked server-only values, and edit-to-update
  behavior.

## Bundler And Fixture References

For bundling behavior, structure the framework plugins similarly to:

`/Users/jacksm5pro/dev/open-source/qwik-bundler`

Use its `src` and `fixtures` as the reference shape for Rolldown and Vite plugin
architecture:

- `src/rolldown.ts` style entry for Rolldown-first plugin behavior.
- `src/vite/*` style adapter layer for Vite-specific dev/HMR/HTML integration.
- `src/build/*` style helpers for manifest, chunking, and build artifact logic.
- fixture-backed tests for real plugin behavior.

There is no router plugin for this framework. Do not copy router-specific
behavior or route-framework assumptions from `qwik-bundler`; use only the
bundler, Vite, Rolldown, fixture, and HMR structure that applies to the core
framework.

## Verification

- Start with the narrowest failing test command.
- Use `vp test` for unit/integration tests once vite-plus is configured.
- Use Vitest browser mode for component/browser behavior.
- Use witness boxes for pipeline and HMR behavior.
- Run `git diff --check` for spec or Markdown-only edits.
- Before finalizing, scan the diff for accidental hydration, VDOM, Node-only
  APIs, non-Rolldown/Vite build tooling, or untested behavior changes.
