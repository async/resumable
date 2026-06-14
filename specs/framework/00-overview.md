# Framework Overview

High-level product contract and index. Use this as the entry point before loading a narrower spec.

**Original title:** Resumable TSRX Framework — Design

**Date:** 2026-06-12
**Status:** Approved direction, pre-implementation
**Tagline:** A resumable UI framework for async-first apps.
**Package:** `@async/resumable`

## Summary

A new JavaScript framework that is fully resumable (Qwik-level: zero execution on
load, closures lazy-loaded on first interaction) without any author-facing markers
(no `$`, no `.value`, no `track()`, no `&` lazy destructuring). It achieves this by
supporting exactly one authoring language: **TSRX** (https://tsrx.dev — `.tsrx`
files, `@{}` component blocks, first-class `@if`/`@for`, co-located `<style>`).
Because the framework owns the language via a TSRX codegen plugin, the compiler
sees every component, every state creation site, every closure, and every async
boundary structurally — which is what makes marker-free resumability, async
dataflow, and a plain-value state API tractable.

The central model is: UI structure is a tree-shaped graph, but state dependencies
are a general directed graph. Current web frameworks often force that general
graph through tree-shaped tools: provider ancestry, hook call order, component
subscriptions, rerender boundaries, and hydration boundaries. This framework
does the opposite: the dataflow graph is the boundary. Components project graph
nodes into DOM; events write back into graph nodes; async work derives graph
nodes from awaited data; resumability serializes graph state and edges rather
than re-entering component trees.

JSX/TSX is explicitly **not** supported.

## Goals

1. **Full resumability.** Component bodies never execute on the client — not even
   once. Initial render serializes state, the reactivity graph, and listener
   wiring into HTML; a ~1KB browser resume entry wakes up only the code a user
   actually interacts with.
2. **Zero markers.** No `$` suffixes, no `.value`, no `Tracked<T>` boxes, no
   special destructuring syntax, no reactive collection subclasses
   (`RippleArray`-style). The reactive surface is plain values and plain mutation.
3. **No VDOM, no re-renders.** Solid-style fine-grained architecture: templates
   compile to real DOM operations; each dynamic binding is its own subscription.
   "Signal" is an implementation detail of compiled output, never API vocabulary.
4. **TSRX-only.** State and reactivity are language features of `.tsrx` files,
   not a runtime library importable from arbitrary TS.
5. **First-class async.** Async dataflow is a compiler-tracked graph feature, not
   an effect/task/resource wrapper. Pending/error UI is expressed with TSRX
   boundaries, and async dependencies are serializable/resumable.

## Non-Goals

- TSX/JSX support, now or later.
- Reactivity in plain `.ts` files. Plain TS receives values via function calls,
  never live bindings. (This is the boundary that lets the compiler guarantee the
  no-marker property.)
- Qwik-style serialization of arbitrary lexical scopes (see Capture Rule).

## Architecture Overview

Four implementation areas:

1. **Compiler** — first implemented in JS/TS on `@tsrx/core` as a TSRX codegen
   plugin (the framework is a TSRX compile target, alongside React/Solid/Vue
   targets). Responsible for: rewriting state reads and writes, compiling
   templates to DOM instructions, extracting closures into lazily-loadable
   symbols, splitting async derivations into key functions and run functions,
   compiling async boundaries, computing capture sets, and emitting diagnostics
   when the capture or async tracking rules are violated. A future OXC/native
   backend may replace parser/lowering internals only behind the same pass
   artifacts and behavior tests.
2. **Runtime** — a small fine-grained reactive core (graph state, object state,
   async node state, cancellation/versioning, DOM binding helpers, initial render
   entry, and browser resume entry). The in-memory graph shape is private and is
   not a VDOM. Never exposed as user vocabulary.
3. **Serialization and render/resume protocol** — initial render runs component
   bodies once, renders HTML, awaits demanded async nodes in v1 non-streaming
   mode, and serializes the resumability payload (state values, async snapshots,
   subscription graph, listener→symbol map) into compact private data scripts.
   The browser resume entry attaches one global event listener (plus a shared
   IntersectionObserver for `onVisible`-wired elements), lazy-loads symbols on
   first interaction or visibility, and re-attaches bindings on first relevant
   state change. No hydration pass, no component execution.
4. **Build integration** — a Rolldown plugin base exported by
   `@async/resumable`,
   with framework adapters such as Vite consuming that base plugin. Extracted
   symbols become code-split entry points, and production builds emit the
   generated symbol resolver plus manifest metadata needed by the unified
   render/resume runtime, preload/runtime graph, and cached SSR fragments.

Do not split the framework into separate "server" and "client" products or
packages. The authoring model is one unified render/resume model: initial render
and browser resume are environment-specific phases of the same runtime and
protocol. Implementation entry points may be environment-specific, but there is
no standalone `server` package and no public two-sided deployment model for app
authors to manage.

Monorepo libraries are implementation boundaries first, not public API
guarantees. The repo may contain internal packages such as protocol, core,
runtime, serializer, compiler, Rolldown, Vite, and test utilities, but v1 should
expose only the main package and explicitly curated re-exports. `protocol` and
`compiler` may become independently consumable once implementation tests prove
their contracts; until then, do not document or rely on deep package APIs as
public framework surface.

The proof implementation lives under `poc/packages/*` and proof fixtures live
under `poc/fixtures/proofs/*`. That POC tree is executable evidence that the
design is possible, but it is not the production source tree. Real framework
implementation begins in root `packages/*` using the same boundaries.

Initial internal production package map:

- `packages/resumable` — main package for `@async/resumable`; curated public
  re-exports only.
- `packages/core` — compiler-known author intrinsics and public types.
- `packages/protocol` — private shared contracts: graph IDs, symbol IDs,
  payload schema types, manifest types, diagnostics, and protocol/version
  constants.
- `packages/runtime` — graph state, computed/async nodes, scheduler, DOM
  mutation journal, sync policy execution, DOM locator resolution, symbol
  resolver integration, initial render, and browser resume.
- `packages/serializer` — tiered value serializer and compact payload
  encode/decode, talking to runtime through snapshot interfaces.
- `packages/compiler` — TSRX semantic graph, lowering passes, capture analysis,
  symbol extraction, artifact planning, and diagnostics.
- `packages/rolldown` — Rolldown-first build plugin, virtual modules, symbol
  chunks, and manifest output.
- `packages/vite` — Vite adapter over the Rolldown plugin: dev/HMR/HTML
  integration only.
- `packages/test-utils` — fixture harnesses, artifact assertions,
  serializer/resume helpers, browser helpers, and witness integration helpers.

There is no `packages/server`.

The repository/package-manager model is a pnpm workspace. The root
`package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` own dependency
resolution and workspace package membership. Vite-plus remains the preferred
tooling surface, so pnpm scripts should be thin aliases for `vp pack`,
`vp test`, `vp check`, `vp fmt`, `vp lint`, and related vite-plus commands.

The build architecture is Rolldown-first, not Vite-first. The base Rolldown
plugin owns compiler transforms, virtual modules, emitted symbol chunks,
manifest generation, diagnostics, and browser/initial-render/library build
modes. The Vite plugin is an adapter that wraps the Rolldown plugin with
Vite-specific environment detection, dev-server transforms, HMR, HTML/dev-tag
injection, build orchestration, and public extension APIs. This mirrors the
`qwik-bundler` structure: a reusable `rolldown` entry point is the core, and
`vite` is one consumer of it.

Build scripts and production optimization must go through Rolldown or Vite.
Do not add standalone esbuild, terser, Rollup, SWC, webpack, Babel build
pipelines, or similar secondary transformers/minifiers. If Vite or Rolldown use
an internal tool as an implementation detail, that is owned by them; this
framework's build surface depends only on Vite/Rolldown APIs.

## Runtime And Build Portability

Core framework code is runtime-agnostic ESM. The compiler, runtime graph,
serializer, render/resume protocol, payload tools, and shared build
helpers must not require a specific JavaScript host as the execution environment.
Server runtimes, edge workers, and browser-hosted tooling should be able to run
the same framework semantics through thin host adapters.

The implementation rules are:

- no `node:*` imports, `fs`, `path`, `process`, `Buffer`, or `node:crypto` in
  shared framework packages
- file access, module resolution, environment variables, hashing, timers beyond
  standard globals, and dev-server integration are host capabilities injected by
  the build/runtime adapter
- prefer Web-standard APIs (`URL`, `URLSearchParams`, `TextEncoder`,
  `Uint8Array`, `ReadableStream`, `AbortController`, `crypto.subtle` when
  available) and portable libraries for gaps
- prefer runtime-agnostic path/URL helpers such as the unjs packages `pathe` and
  `ufo` over Node's `path` or `url` modules
- generated code uses standard ESM and `import()`; the symbol resolver receives
  already-normalized URLs/specifiers from the build manifest rather than doing
  environment-specific path math at runtime
- Node/Vite/Rolldown-specific behavior lives only in adapter packages or clearly
  isolated integration modules, never in the semantic compiler/runtime core

This is a design constraint, not just packaging polish. If framework behavior
differs between supported hosts because core code depended on host-specific APIs,
that is a framework bug.

## Split Spec Index

- [TSRX Host Contract](./01-tsrx-host-contract.md)
- [Compiler Pipeline](./02-compiler-pipeline.md)
- [State Graph](./03-state-graph.md)
- [Events, Symbols, And Behaviors](./04-events-symbols-behaviors.md)
- [Resumability Payload](./05-resumability-payload.md)
- [Runtime Render/Resume](./06-runtime-resumer.md)
- [Diagnostics](./07-diagnostics.md)
- [Deferred Decisions](./08-deferred-decisions.md)
- [Archived design thread](./archive/design-thread.md)

The split files are the implementation-facing specs. The archive preserves the design conversation as a single document for historical context.
