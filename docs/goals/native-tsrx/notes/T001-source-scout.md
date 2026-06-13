# T001 Source Scout: Native TSRX

Date: 2026-06-13

## Sources Inspected

- TSRX website:
  - https://tsrx.dev/
  - https://tsrx.dev/features
  - https://tsrx.dev/getting-started
  - https://tsrx.dev/specification
  - https://tsrx.dev/llms.txt
  - https://tsrx.dev/blog/simplifying-tsrx-after-feedback
- Ripple TSRX package:
  - https://github.com/Ripple-TS/ripple/tree/main/packages/tsrx
  - `packages/tsrx/README.md`
  - `packages/tsrx/package.json`
  - `packages/tsrx/src/index.js`
  - `packages/tsrx/src/parse/index.js`
  - `packages/tsrx/src/parse/parse-module.js`
  - `packages/tsrx/src/plugin.js`
  - `packages/tsrx/types/index.d.ts`
- Satteri:
  - https://github.com/bruits/satteri
  - root `README.md`
  - root `Cargo.toml`
  - root `package.json`
  - `crates/satteri-napi-binding/Cargo.toml`
  - `crates/satteri-napi-binding/src/lib.rs`
  - `packages/satteri/package.json`
  - `packages/satteri/README.md`
  - `packages/satteri/index.js`
- Oxc:
  - https://docs.rs/oxc_parser/latest/oxc_parser/
  - https://docs.rs/oxc_semantic/latest/oxc_semantic/
  - https://docs.rs/oxc_ast/latest/oxc_ast/
  - https://oxc.rs/docs/guide/usage/parser.html
  - https://oxc.rs/docs/guide/usage/transformer.html

## TSRX Current Language Surface

The current canonical specification is the TSRX draft dated June 7, 2026. It defines TSRX as an additive TypeScript-compatible syntax extension for JSX-shaped templates, statement containers, template control flow, lazy destructuring, raw style elements, dynamic tags, and server submodule declarations.

Normative syntax and parser obligations:

- `.tsrx` files are TypeScript modules with TSRX enabled.
- Functions remain ordinary TypeScript/ESTree function nodes. `function Name(...) @{ ... }` is a statement-container function body whose body is represented as `JSXCodeBlock`.
- TSRX expression values include `JSXElement`, `JSXFragment`, `JSXStyleElement`, `JSXCodeBlock`, `JSXIfExpression`, `JSXForExpression`, `JSXSwitchExpression`, and `JSXTryExpression`.
- Template children include standard JSX children plus `JSXCodeBlock`, `JSXStyleElement`, and template control-flow expressions.
- `@{ ... }` is a statement container. It contains setup statements first, then exactly one render output.
- Control-flow directives are `@if`, `@for`, `@switch`, and `@try`; their bodies use template blocks.
- `@for` supports optional `index` and `key` clauses and optional `@empty`.
- `@try` supports `@pending` and `@catch`.
- Lazy destructuring uses contiguous `&{` and `&[` syntax. Whitespace-split forms do not count.
- Raw `<style>` captures CSS source for host-defined stylesheet processing.
- Dynamic tags use `<{expression}>` and matching `</{expression}>`; removed forms such as `<@tag />` are not current TSRX.
- Host-defined server extensions include `module Identifier { ... }` and `import ... from Identifier`.

Early errors to preserve:

- Split tag, fragment, or statement-container delimiters are invalid.
- Opening and closing tags/fragments must match.
- Statement containers and template control-flow blocks with setup and render output must put setup before render output and have exactly one render output.
- Bare `JSXExpressionContainer` is not a template output node; wrap text/expression/multiple siblings in a fragment.
- Template children cannot appear outside an element or fragment body.
- Server submodule hosts must require server exports to be imported before use.

AST contract to preserve:

- Standard JSX nodes remain standard where possible: `JSXElement`, `JSXFragment`, `JSXText`, `JSXExpressionContainer`, `JSXAttribute`, `JSXSpreadAttribute`.
- TSRX-specific additions are limited to `JSXCodeBlock`, `JSXStyleElement`, `JSXIfExpression`, `JSXForExpression`, `JSXSwitchExpression`, `JSXTryExpression`, `TSModuleDeclaration`, and `TSModuleBlock`.
- Dynamic tag names are represented as `JSXExpressionContainer` in `JSXOpeningElement.name`; current implementations add `isDynamic` metadata.
- `JSXCodeBlock` has `body` statements and one `render` output.
- `JSXStyleElement` carries style children and optional `css` source.
- Control-flow nodes reuse statement-like fields where possible: `test/consequent/alternate`, loop headers/body/empty, switch cases, try block/handler/pending.

## TSRX Website Fixture Inventory

Current website examples that should become test fixtures:

Homepage:

- `home-greeting-card`: statement-container function body, fragment output, local constant, `<style>`.
- `home-user-list`: `@for`, local declarations inside loop body, nested `@if`, event handler reference.
- `home-lazy-destructuring-counter`: `&{ count, label }` parameter pattern.
- `home-cart-statement-container`: setup statements then single JSX output.

Features page:

- `features-button-with-style`: exported component function with fragment, comments, host-class notes, style block.
- `features-counter-nested-function`: ordinary nested JS control flow inside a TSRX component.
- `features-product-card-nested-code-block`: nested `@{}` inside element child plus nested `@if`.
- `features-js-comments`: line and block comments in template children and control-flow branches.
- `features-lazy-destructuring-user-card`: lazy object parameter destructuring in a normal function with return.
- `features-prop-shorthand`: JSX prop shorthand `{value}` and `{onChange}`.
- `features-lexical-scope`: nested `@{}` block creates local scope.
- `features-conditional-rendering`: `@if` / `@else if` / `@else`.
- `features-list-rendering`: `@for ... of`, `index`, `key`, and `@empty`.
- `features-switch`: `@switch`, `@case`, `@default`.
- `features-error-boundary`: `@try` / `@catch`.
- `features-retry-boundary`: `@catch (e, reset)` with handler using reset.
- `features-async-boundary`: `@try` / `@pending` / `@catch`.
- `features-dynamic-panel`: dynamic host tag `<{as}>`, dynamic component `<{Body}>`, repeated closing expression.
- `features-scoped-card-style`: fragment with colocated scoped `<style>`.
- `features-style-composition`: style expression assigned to local variable and class map passed to child.
- `features-module-style-expression`: module-scope style expression and class map use in component.

Getting Started page:

- Integration/config examples for React, Preact, Solid, Vue, Ripple, Prettier, ESLint, TypeScript plugin, and MCP. These are not parser grammar fixtures, but should become docs/provenance fixtures for TypeScript package integration tests where relevant.

Blog page:

- `simplifying-tsrx-after-feedback` is historical context. Some examples show removed or transitional syntax. Do not use blog snippets as acceptance fixtures unless cross-checked against the current June 7, 2026 spec and Features page.

## Ripple `@tsrx/core` Findings

`@tsrx/core` is currently the source package for parser/compiler infrastructure. Its README says it is framework-agnostic and provides parsing, AST definitions, scope analysis, CSS support, event helpers, HTML helpers, and source maps. It explicitly does not emit runtime code or ship a runtime.

Observed public API and package facts:

- Package name: `@tsrx/core`
- Current package version from `package.json`: `0.1.30`
- Public parse API: `parseModule(source, filename, options?)`.
- `parseModule` calls a parser produced by `createParser(TSRXPlugin())`.
- `createParser` composes `acorn.Parser.extend(tsPlugin({ jsx: true }), ...plugins, elementTemplateClosingTagPlugin)`.
- Parse options support strict mode plus `collect` and `loose` modes for editor-oriented recovery and non-fatal error collection.
- Dependencies include `acorn`, `@sveltejs/acorn-typescript`, `zimmerframe`, `magic-string`, `esrap`, and source-map helpers.

Important implementation patterns to port or explicitly replace:

- A large `TSRXPlugin` extends the TypeScript/JSX parser directly and tracks parser context, template mode, control-flow directive headers, JSX expression-container depth, native template path, function body depth, comments, loose error collection, and dynamic tag validation.
- Comment attachment is a first-class parser concern. Comments inside template children are not rendered as text and need stable attachment for formatting and source mapping.
- Style parsing is separate from JSX parsing: raw style bodies are captured and parsed into stylesheet metadata.
- Scope analysis models bindings, references, lazy bindings, server modules, reactive/tracked metadata, and transform read/assign/update hooks.
- Types currently extend ESTree and ESTree-JSX with TSRX nodes and metadata. A Rust version should preserve an ESTree-compatible JSON export contract before inventing framework-specific lowering.

## Satteri Findings

Satteri is a Rust + TypeScript monorepo for high-performance Markdown/MDX processing. Its key architectural lesson is separation of native core crates from the JS-facing package.

Observed crate/package shape:

- Root Rust workspace members include `satteri`, `satteri-arena`, `satteri-ast`, `satteri-plugin-api`, `satteri-napi-binding`, `satteri-mdxjs-rs`, and `satteri-pulldown-cmark`.
- Workspace Oxc dependencies in the inspected `Cargo.toml` include `oxc_allocator`, `oxc_ast`, `oxc_ast_visit`, `oxc_codegen`, `oxc_estree`, `oxc_parser`, `oxc_span`, and `oxc_syntax`.
- `satteri-napi-binding` is a `cdylib` crate using `napi = 3`, `napi-derive = 3`, and `napi-build = 2`.
- The npm package `satteri` builds native and WASI binaries via `@napi-rs/cli`, exposes generated NAPI bindings, and has tests through Vitest.
- NAPI exports are thin Rust entrypoints with JS-facing option objects, error conversion, and opaque handles for large Rust-side arenas.
- The JS package wraps generated binding loading with platform target selection, optional platform packages, WASI fallback, and TypeScript declarations.

Transferable pattern for `native-tsrx`:

- Start with a Rust workspace even if there is initially one crate.
- Keep the Rust parse/AST crate independent from NAPI.
- Add a `native-tsrx-napi` or `native-tsrx-node` crate as a `cdylib`.
- Add a TypeScript package that exports stable user APIs and owns binding loading.
- Use tests at both layers: Rust parser fixture tests and TS/NAPI API tests.
- Prefer an explicit JSON/ESTree export from Rust before exposing raw arena internals.

## Oxc Findings

Oxc parser supports JavaScript, TypeScript, JSX, and TSX. Its Rust parser API takes an allocator, source string, and `SourceType`, then returns `ParserReturn` with a program and errors. Oxc AST lives in `oxc_ast`, uses arena allocation via `oxc_allocator`, and supports ESTree JSON serialization behind crate features. `oxc_semantic` builds semantic analysis over the parsed program, including scopes, symbols, and references.

Implications for native TSRX:

- Oxc is a strong baseline for TypeScript/JSX/TSX, spans, diagnostics, AST visitors, semantic analysis, and ESTree serialization.
- TSRX requires parser-level syntax additions not expressible as a normal transform: `@{}`, `@if`, `@for`, `@switch`, `@try`, lazy destructuring `&{}/&[]`, raw `<style>`, dynamic tag syntax, and identifier-source imports.
- The first implementation should avoid pretending that Oxc transform plugins can parse new syntax. It should either:
  - build a TSRX-aware parser layer around Oxc-compatible AST/ESTree output, or
  - extend/fork Oxc parser/AST crates in a controlled way.
- Since the user wants Rolldown eventually to use the same parser, the project should preserve a Rust crate API first and expose NAPI second.

## Candidate `.codex` Rules

Rules to create in the new project before implementation:

- Source of truth: current `tsrx.dev/specification` plus captured fixtures; do not infer syntax from older blog posts.
- Test-first parser work: every new syntax feature starts with a fixture and an expected parse/assertion.
- Preserve spans and source provenance for every fixture.
- Keep Rust parser/core independent from NAPI and package loading.
- Keep TypeScript package APIs as wrappers around stable Rust/NAPI functions, not as the source parser.
- Do not implement framework lowering before the native parser and ESTree-compatible AST contract are stable.
- Treat comments and raw style bodies as parser responsibilities.
- Treat `.codex/` as project-local guidance and keep it gitignored.

## Candidate `.codex` Skills

Skills to create in the new project before implementation:

- `native-tsrx-fixture`: add a source-backed TSRX fixture from `tsrx.dev`, record provenance, write a failing parser test, then implement only enough parser support for that fixture.
- `native-tsrx-parser`: implement parser grammar support while preserving spans, comments, early errors, and ESTree compatibility.
- `native-tsrx-napi`: expose Rust parser functions to TypeScript using `napi-rs`, with Rust tests first and TS API tests second.
- `native-tsrx-source-sync`: refresh spec/package evidence from `tsrx.dev`, Ripple `packages/tsrx`, and Satteri before broad parser or API changes.

## Risks And Open Decisions For Judge

- Oxc version selection: current docs.rs latest Oxc parser is ahead of Satteri's pinned workspace versions; pick current crates for a new project unless a compatibility reason says otherwise.
- Parser integration strategy: native support inside Oxc-style AST vs a TSRX parser layer that emits ESTree-compatible JSON. The former improves Rolldown alignment but has higher AST ripple cost.
- `.tsrx` SourceType handling: Oxc does not currently advertise a `.tsrx` source type in public docs, so the first slice may need `SourceType::tsx()` plus a TSRX mode wrapper or a custom source-type enum.
- Raw style parsing: choose whether first slice stores raw CSS only or parses stylesheet metadata immediately.
- Dynamic tags: current spec uses `<{expression}>`, while older blog text discusses removed forms. Tests must enforce current spec.
- Sibling repo creation requires escalation because `/Users/jacksm5pro/dev/open-source/native-tsrx` is outside the current writable root.

## Candidate Next Worker Slice

After Judge validation, the largest safe first write slice is:

Create `/Users/jacksm5pro/dev/open-source/native-tsrx` as a Rust + TypeScript workspace scaffold, with `.gitignore` including `.codex/`, `.codex` project rules and skills generated from this note, fixture/provenance directories, and empty/failing Rust fixture tests. Do not implement parser behavior in this slice beyond compileable stubs.
