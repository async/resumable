# Implementation State

This file tracks implementation progress in the current worktree. It is a
progress ledger, not a framework behavior contract. The source of truth remains
`specs/framework-design.md` and the split specs under `specs/framework/`.

Use this file for status questions such as "what has been completed?" or "what
is still missing?" Do not use it to introduce new framework semantics. If this
ledger and a split spec disagree, fix the ledger or reopen the owning split
spec deliberately.

Status entries have the scope named by their section. A completed spec or
tooling entry means the current worktree contains the documented file/config and
the relevant formatting, inventory, or build evidence. A completed
implementation entry means the current worktree contains implementation and
focused coverage for that slice. None of these entries imply the broader feature
family is complete unless the remaining-work section says so explicitly.

## Full Spec Implementation Distance

The current worktree is in the early production-implementation phase. It has
real package scaffolding, pass-owned compiler modules, compiler artifacts,
focused diagnostics, runtime graph pieces, payload helpers, and initial adapter
surfaces. It is not close to full framework completion yet because the vertical
render/resume contract is not proven end to end.

Completed slices are concentrated in:

- workspace/package scaffolding and vite-plus tooling
- compiler module ownership and pass graph validation
- semantic graph collection for early state, event, alias, async, and capture
  inputs
- focused state-lowering diagnostics and graph write forms including assignment,
  update, collection calls, and static property deletes
- payload arena and symbol resolver planning artifacts
- runtime graph scheduling, invalidation, collection-method calls, and partial
  resume wiring
- pure-value serializer support for identity/cycles and the accepted built-in
  value set
- early public package re-exports and Rolldown/Vite adapter shells

The critical path to "full spec implementation" still requires:

- template/view lowering and final emit that consume the current artifacts
- TSRX control-flow identity metadata for keyed `@for` lists, branch-local
  `@if`/`@switch` scopes, unkeyed stateful-loop diagnostics, branch/list locator
  streams, and disposal behavior
- children/projection metadata and diagnostics, including opaque `children`
  projection records, projection disposal behavior, and React-style child
  inspection/manipulation diagnostics
- dynamic tag/component and scoped-style host semantics, including dynamic
  `<{expr}>` lowering, host/component ownership decisions, style scoping, style
  composition metadata, and diagnostics for unsupported dynamic cases
- authored template-comment and statement-container lexical-scope host metadata,
  including comment-aware locator planning so generated async anchors are not
  confused with authored comments
- a real initial-render runtime entry that executes component bodies once,
  serializes graph/view/symbol/async snapshots, and uses the current
  payload-script-only compiler `renderShell` artifact as input rather than
  treating it as the whole render pipeline
- browser resume that performs concrete DOM replacement/mutation behavior for
  all planned binding and async-boundary cases
- `onVisible` visibility-event support, including shared IntersectionObserver
  wiring, fires-once-per-element semantics, current-value reads, returned cleanup
  handling, and cleanup on host removal
- lazy `element()` handle materialization for browser symbols, including
  handle-id/name lookup, current DOM resolution, initial-render absence, and
  removed-locator `undefined` semantics
- generated symbol resolver integration with real build chunks and manifests,
  including source-to-module extraction, generated exports, and resolver tables
  derived from build output rather than fixture-supplied symbol tables
- `shared()` definition and instance support, including stable definition IDs,
  request/container/page scopes, graph-context resolution, dependency/cycle
  diagnostics, payload records, and cross-runtime patch behavior
- fixture-backed Rolldown/Vite build, dev, HMR, and witness receipts
- component/browser and resumability end-to-end tests proving no component body
  execution on browser resume
- broad diagnostic coverage for unsupported state, capture, async, event, and
  serializer cases beyond the current package/artifact-level diagnostics

In practical terms, the project has proven several important compiler/runtime
subcontracts, but the product-level invariant is still unproven until the
initial-render -> serialized payload -> browser-resume -> lazy-symbol interaction
path is covered by fixtures and browser tests.

## Current Snapshot

- The split framework spec index exists in `specs/framework-design.md`, with
  detailed ownership files under `specs/framework/`.
- The pnpm/vite-plus workspace scaffolding exists through root `package.json`,
  `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `vite.config.ts`.
- Root scripts are thin vite-plus aliases. The current `vite.config.ts` uses one
  flat pack entry map for ten source entries and one Node test project include;
  it does not yet model package-local publish output or browser/witness test
  projects.
- Production package folders exist for `resumable`, `core`, `protocol`,
  `runtime`, `serializer`, `compiler`, `rolldown`, `vite`, and `test-utils`.
- The current package inventory has package manifests for those nine production
  folders and no `packages/server` manifest.
- The current split-spec inventory has `00` through `09` under
  `specs/framework/`.
- `packages/compiler` has the initial production pass-boundary layout with
  shared artifact/diagnostic modules, AST/source helpers, graph-path helpers, a
  pass registry, pass graph validation, a compile orchestrator, pass-owned
  modules, semantic collector modules, and pass-level tests.
- `packages/compiler/src/index.ts` is a curated export surface rather than the
  home for pass implementation logic.
- The compiler module split plan is documented in
  `specs/framework/09-compiler-module-split-plan.md`.

## Evidence Anchors

Use these anchors when auditing whether a status entry still reflects the
current worktree. They are evidence pointers only; behavior requirements remain
in the split specs.

- Workspace/tooling shape: `package.json`, `pnpm-workspace.yaml`,
  `pnpm-lock.yaml`, and `vite.config.ts`.
- Compiler pass boundaries: `packages/compiler/src/index.ts`,
  `packages/compiler/src/compile-module.ts`,
  `packages/compiler/src/pass-graph.ts`,
  `packages/compiler/src/pass-registry.ts`, `packages/compiler/src/artifacts.ts`,
  `packages/compiler/src/diagnostics.ts`, `packages/compiler/src/ast/*`,
  `packages/compiler/src/artifact-helpers/*`,
  `packages/compiler/src/passes/*`, and `packages/compiler/test/*`.
- Semantic collector split: `packages/compiler/src/passes/semantic-graph/*` and
  the focused semantic collector tests under `packages/compiler/test/`.
- Runtime payload/resume boundaries: `packages/runtime/src/index.ts`,
  `packages/runtime/src/graph.ts`, `packages/runtime/src/payload.ts`,
  `packages/runtime/src/resume.ts`, and `packages/runtime/test/*`.
- Serializer boundaries: `packages/serializer/src/index.ts`,
  `packages/serializer/src/value.ts`,
  `packages/serializer/src/protocol-state.ts`,
  `packages/serializer/src/payload-scripts.ts`, and
  `packages/serializer/test/*`.
- Core/protocol/test utility surfaces: `packages/core/src/index.ts`,
  `packages/protocol/src/index.ts`, `packages/test-utils/src/index.ts`, and
  their package tests.
- Curated public surface and build adapters: `packages/resumable/src/index.ts`,
  `packages/resumable/src/vite.ts`, `packages/rolldown/src/index.ts`,
  `packages/vite/src/index.ts`, and their package tests.

## Completed Work Recorded In This Tree

### Workspace And Specs

- The split framework spec index exists in `specs/framework-design.md`.
- `specs/framework-design.md` explicitly points to this progress ledger.
- The production compiler split target is documented in
  `specs/framework/09-compiler-module-split-plan.md`.
- Implementation-facing split specs use `tsrx` code fences for TSRX examples;
  the archived design thread remains historical and is not normalized as current
  contract text.
- Current-contract split specs prefer `initial render`, `browser resume`, and
  `render/resume` terminology over generic SSR/server phrasing, except where a
  deferred topic is explicitly named as Streaming SSR.
- The deferred high-level build order now points compiler work at pass-boundary
  artifacts before any end-to-end demo path, matching the implementation
  sequencing guardrail.
- Deferred native-compiler and compiler-substrate language now say the first
  compiler implementation uses JS/TS on `@tsrx/core`, matching the
  production-started status without reopening OXC/native work.
- Diagnostic examples use implemented stable codes and docs URL shapes such as
  `AA_CAPTURE_UNSUPPORTED_VALUE` and `https://async.await.dev/errors/...`
  instead of placeholder diagnostic names or domains.
- The diagnostics split spec includes the currently implemented diagnostic phases
  used by package source/tests, including `semantic-graph`, `sync-policy`,
  `state-lowering`, `capture-analysis`, `serialization`, and `resume`.
- The thin internal support packages have focused package tests for current
  narrow surfaces: `core` compiler-intrinsic stubs fail loudly when run without
  the TSRX compiler, including `shared()`; `protocol` exports the current
  protocol version and payload TypeScript shapes; and `test-utils` provides
  opening payload script marker assertions plus selected protocol record-count
  summaries.
- The root workspace uses pnpm and vite-plus through `package.json`,
  `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `vite.config.ts`.
- The current vite-plus pack configuration emits ESM and declaration outputs for
  `core`, `protocol`, `serializer`, `compiler`, `runtime`, `rolldown`, `vite`,
  `resumable`, `resumable/vite`, and `test-utils`.

### Compiler Boundaries

- `packages/compiler` has a pass-owned source layout with shared artifacts,
  diagnostics, AST helpers, graph-path helpers, pass registry, pass graph
  validation, and compile orchestration outside the package entry file.
- `packages/compiler/src/index.ts` re-exports the compiler surface and does not
  contain AST walking, graph mutation, pass registry construction, pass graph
  validation, or compile orchestration bodies.
- The default pass registry currently declares nine pass IDs and artifact
  boundaries: `tsrx-semantic-graph`, `state-lowering`, `payload-arena`,
  `symbol-resolver`, `capture-analysis`, `protocol-state`, `protocol-view`,
  `payload-scripts`, and `symbol-resolver-module`.
- Pass-owned modules exist for semantic graph collection, state lowering,
  payload arena planning, symbol resolver planning, capture analysis, protocol
  state planning, protocol view planning, payload script rendering, and symbol
  resolver module emission.
- Semantic graph collection is split into collector modules for module-scope
  diagnostics, components, elements, state/computed/element bindings, aliases,
  async boundaries, sync policy, and expression read/write collection.
- Focused module-boundary tests cover the compiler split and semantic collector
  ownership.
- `compileTsrxModule` validates the default pass graph and orchestrates the
  current source-to-artifacts path by manually calling the pass-owned modules in
  registry order.

### Semantic Graph And Diagnostics

- Semantic graph collection records components, host elements, events, state
  bindings, computed bindings, element handles, template reads, graph
  reads/writes, aliases, async boundaries, and sync policy candidates.
- Semantic graph collection records the first component parameter as a read-only
  `prop` binding when it is an identifier or object pattern; object-pattern props
  produce aliases rooted at `props`.
- Semantic graph diagnostics cover module-scope graph state creation,
  unextractable sync policies, post-`await` reactive reads, async computed reads
  outside async boundaries, sync computeds that transitively depend on async
  computeds, invalid/duplicate element handle bindings, and `use` on
  components.
- The current implemented stable diagnostic code inventory is
  `AA_STATE_MODULE_SCOPE`, `AA_ASYNC_POST_AWAIT_READ`,
  `AA_ASYNC_BOUNDARY_REQUIRED`, `AA_ELEMENT_HANDLE_REQUIRED`,
  `AA_ELEMENT_HANDLE_DUPLICATE`, `AA_USE_HOST_ELEMENT_REQUIRED`,
  `AA_SYNC_POLICY_UNEXTRACTABLE`, `AA_STATE_UNRESOLVED_WRITE`,
  `AA_STATE_DYNAMIC_PATH_READ`, `AA_STATE_DYNAMIC_PATH_WRITE`,
  `AA_STATE_OPTIONAL_CHAIN_WRITE`, `AA_STATE_REST_ALIAS_EXCLUDED_PATH`,
  `AA_STATE_READ_ONLY_WRITE`, `AA_STATE_CONST_REASSIGNMENT`,
  `AA_CAPTURE_UNSUPPORTED_VALUE`, `AA_SERIALIZE_UNSUPPORTED_VALUE`, and
  `AA_SYMBOL_UNKNOWN`.
- Semantic graph async collection records async boundary ownership, catches
  post-`await` graph reads in async computed bodies, and propagates
  async-capable status through sync computeds that depend on async computeds.
- Semantic graph element/behavior collection records `el` handle bindings and
  host-element `use` behavior sources, while rejecting `el` bindings that do not
  target `element()` handles, duplicate live handle bindings, and `use` on
  components.
- Semantic graph element collection currently classifies static lowercase tag
  names as host elements and static uppercase tag names as components for host
  node records and `use` diagnostics.
- Semantic graph sync-policy extraction records selected graph-state/event-field
  guard policies for synchronous `preventDefault()` / `stopPropagation()`
  actions and reports `AA_SYNC_POLICY_UNEXTRACTABLE` when a browser-critical
  action cannot be represented in the current policy IR. Current policy
  condition variants cover graph truthiness, event-field equality,
  `and`/`or`/`not` composition, and literal event comparison values.
- Collector modules cover module-scope diagnostics, component/host collection,
  element attributes, state/computed/element bindings, aliases/destructuring,
  async boundaries, sync event policy extraction, and expression reads/writes.
- Alias collection supports array destructuring artifacts by mapping positional
  bindings such as `firstItem` to graph paths such as `items.0` when the TSRX
  semantic artifact supplies array pattern elements.

### Capture Analysis

- Semantic graph collection records local function values in `localBindings`.
- `capture-analysis` reports `AA_CAPTURE_UNSUPPORTED_VALUE` when a lazy symbol
  captures a local function value.
- Semantic graph collection propagates unsupported local binding kinds through
  simple aliases, so `capture-analysis` reports the alias name when a lazy
  symbol captures a local function alias.
- Semantic graph collection records local class instance values and local DOM
  node values from document lookups or document-created elements in
  `localBindings`; `capture-analysis` reports
  `AA_CAPTURE_UNSUPPORTED_VALUE` for those captures.
- Semantic graph collection records local object/array constants containing
  functions, class instances, or DOM nodes as non-serializable constants, and
  `capture-analysis` reports `AA_CAPTURE_UNSUPPORTED_VALUE` when lazy symbols
  capture them.
- Semantic graph collection source allow-lists spec-listed serializable built-in
  constructors such as `Date`, `RegExp`, `Map`, `Set`, `URL`, `ArrayBuffer`, and
  typed arrays instead of reporting them as local class instances. Focused tests
  currently prove this positive path for `Date`.
- Semantic graph collection inspects serializable built-in constructor
  arguments, so built-ins such as `Map` are reported as non-serializable
  constants when their contents include functions, class instances, or DOM
  nodes.
- Semantic graph collection treats identifiers that resolve to existing
  unsupported local bindings as non-serializable contents when inspecting
  object/array constants and serializable built-in constructor arguments.
- Semantic graph collection propagates non-serializable local constants through
  object/array spread forms, including the current TSRX parser shorthand shape
  for object spread.
- Semantic graph collection propagates unsupported local binding kinds through
  object and array destructuring patterns, so destructured aliases of
  non-serializable constants are diagnosed when captured by lazy symbols.
- Semantic graph collection classifies unsupported values destructured directly
  from inline object and array initializers, so local function/class/DOM or
  non-serializable constant values are diagnosed without requiring an
  intermediate local binding.
- `capture-analysis` ignores unsupported local binding names that appear only
  inside string literals, member property names, object property keys, object
  method keys, top-level lazy symbol parameters, or top-level lazy symbol body
  declarations.
- Focused coverage exists in
  `packages/compiler/test/capture-analysis.test.ts`.

### State, Payload, Symbols, And Protocol

- State lowering resolves plain graph reads/writes, prop reads, array
  destructuring aliases represented in semantic graph artifacts,
  computed-write diagnostics, prop-write diagnostics, and const graph binding
  reassignment diagnostics.
- Current prop handling proves compiler-artifact read semantics only: the first
  component parameter becomes a synthetic read-only prop binding
  (`prop:<name>` for identifier parameters or `prop:props` plus aliases for
  object patterns), prop aliases lower to that binding, and writes to props
  report `AA_STATE_READ_ONLY_WRITE`.
- State lowering read-only diagnostics use binding-kind-specific explanations,
  so prop writes point at parent graph ownership instead of reusing
  computed-specific guidance.
- Semantic graph expression collection records update operator and
  prefix/postfix metadata for `++x`, `x++`, `--x`, and `x--` style graph writes,
  and state lowering preserves that metadata for later final emit to keep
  JavaScript expression value semantics intact.
- State lowering reports `AA_STATE_DYNAMIC_PATH_WRITE` when a write targets a
  known graph root through a non-static bracket path such as `items[index]`,
  keeping unsupported lvalue forms distinct from fully unresolved writes.
- State lowering reports `AA_STATE_DYNAMIC_PATH_READ` when a read targets a
  known graph root through a non-static bracket path, preventing dynamic graph
  subscriptions from silently disappearing.
- State lowering reports `AA_STATE_REST_ALIAS_EXCLUDED_PATH` when a write targets
  a property path that object-rest destructuring explicitly excluded from the
  alias, keeping rest-alias mistakes distinct from generic unresolved writes.
- Semantic graph expression collection recognizes Map/Set-style mutating
  collection calls such as `cache.set(...)` and `selected.add(...)` as graph
  writes while preserving argument reads.
- Semantic graph expression collection no longer treats dynamic computed method
  lookups such as `items[push](nextItem)` as static collection writes; those
  calls remain read artifacts for later dynamic-path diagnostics.
- Semantic graph expression collection marks optional collection calls such as
  `items?.push(nextItem)` and optional deletes such as `delete menu?.open`; state
  lowering reports `AA_STATE_OPTIONAL_CHAIN_WRITE` instead of emitting graph
  writes whose artifacts could not preserve optional-chain short-circuit
  semantics.
- Semantic graph expression collection records static object-property
  `delete menu.open` forms as `delete` graph writes without treating the deleted
  property value as a graph read.
- State lowering resolves `delete` write artifacts to static graph paths so the
  runtime can preserve JavaScript property-delete behavior with path-granular
  invalidation.
- Payload arena planning separates graph state from view wiring metadata.
- Payload arena planning materializes async boundary records with generated
  start/end DOM-order comment anchor locators, keeping boundary wiring as view
  metadata rather than render-output or VDOM state.
- Payload arena planning records the async-capable computed reads protected by
  each async boundary, so `async/view` can connect boundary anchors to demanded
  graph data without re-walking TSRX source.
- Payload arena and protocol view planning carry element handle locator records,
  host behavior records, and behavior symbol IDs into the current `async/view`
  payload shape.
- Resume runtime tests can recover a DOM element by host node ID through the
  current `getElement(hostNodeId)` API, but lazy symbol context does not yet
  expose authored `element()` handle lookup by handle ID or local handle name.
- Symbol resolver planning assigns source-bearing lazy symbol records from
  current event, binding, behavior, and async-computed-runner artifacts. Resolver
  module emission owns dynamic import dispatch for the supplied chunk/export
  table, but source-to-module extraction and build-derived chunk/export mapping
  are not implemented yet.
- Symbol resolver module emission fails closed for unknown symbol IDs with
  `AA_SYMBOL_UNKNOWN`, `resume` phase, the missing `symbolId`, and a stable docs
  URL on the thrown error object.
- Symbol resolver module emission now exports a symbol manifest with protocol
  version, optional build/resolver identity, and the ordered chunk/export table
  supplied to the compiler by the current fixture/adapter boundary.
- Protocol view planning links payload arena records to lazy symbol IDs.
- Protocol view planning links each async boundary read to the generated
  async-computed-runner symbol ID, so visible/demanded boundaries can resolve
  async work through the symbol resolver.
- Payload script planning emits canonical `async/state` and `async/view` data
  scripts.

### Runtime, Serializer, And Build Adapters

- The runtime graph supports path-granular invalidation, microtask flush
  scheduling, direct sync computed lazy recomputation after path-granular
  invalidation, async computed request versioning, abort-signal wiring, stale
  fulfilled async completion suppression, and collection of subscriber-produced
  DOM mutation journal records.
- The runtime graph can return either the previous or next value from graph
  updates, giving generated update-expression code a target for preserving
  postfix and prefix JavaScript value semantics.
- The runtime graph has a supported collection-call path for Array, Map, and
  Set graph paths, preserving JavaScript method return values while invalidating
  the mutated graph path.
- The runtime graph preserves `Map.delete` / `Set.delete` boolean return values
  and skips path invalidation when those calls return `false`, because no
  collection entry was removed.
- The runtime graph skips `Map.clear()` / `Set.clear()` path invalidation when
  the collection is already empty, while still preserving the JavaScript method
  return value.
- The runtime graph skips `Set.add(value)` path invalidation when the value is
  already present, while still preserving the JavaScript method return value.
- The runtime graph skips `Map.set(key, value)` path invalidation when the key
  already maps to the same value, while still preserving the JavaScript method
  return value.
- The runtime graph skips `Array.pop()` path invalidation when the array is
  already empty, while still preserving the JavaScript method return value.
- The runtime graph skips `Array.shift()` path invalidation when the array is
  already empty, while still preserving the JavaScript method return value.
- The runtime graph skips `Array.push()` / `Array.unshift()` path invalidation
  when no values are added, while still preserving the JavaScript method return
  value.
- The runtime graph rejects unsupported collection method calls such as
  non-mutating `map`, preventing runtime callers from marking graph paths dirty
  for methods the compiler will not lower as writes.
- The runtime graph applies object-property deletes at static graph paths,
  preserving the JavaScript delete return value while invalidating the deleted
  graph path.
- The runtime graph skips object-property delete invalidation when no own
  property is removed, while still preserving the JavaScript `delete` return
  value.
- The resume runtime materializes view records, registers delegated DOM events,
  evaluates sync event policy before lazy symbol loading, dispatches delegated
  events from nested targets to owner element records, and registers async view
  bindings as graph subscriptions. Current runtime tests cover single-symbol
  event dispatch.
- Compiler/protocol tests preserve ordered event handler `symbolIds` for handler
  arrays, and the resume source iterates matched event symbol IDs in protocol
  order. Focused runtime tests do not yet execute multiple handler symbols for
  one event.
- For element behaviors, compiler/protocol tests preserve behavior source records
  and symbol IDs in authored/view order. The resume source loads behavior symbols
  in view-record order with `{ graph, element }` only and stores returned
  cleanups by host, while focused runtime tests currently exercise one behavior
  install/cleanup path on explicit host disposal.
- The resume runtime materializes `async/view` async boundary records against
  DOM-order comment anchors and exposes the boundary-side table for later async
  demand/revalidation work.
- The resume runtime now subscribes materialized async boundary reads to their
  graph paths, demands those reads during start, and runs the resolver-owned
  boundary runner symbol on pending/fulfilled status changes in the current
  Node fake-DOM test path, where runner output is observed as DOM journal
  records.
- Runtime payload helpers parse canonical JSON `async/state` and `async/view`
  data scripts, check the shared protocol version, deserialize serialized cell
  values into a runtime graph, and return decoded view records.
- The runtime exposes a payload-driven resume helper that decodes caller-supplied
  payload script strings, creates the runtime graph from serialized
  `async/state` cell values, materializes the `async/view` resume runtime, and
  starts delegated event/boundary wiring against a caller-supplied DOM-like root.
- The pure-value `serializeGraphValue` / `deserializeGraphValue` path preserves
  identity/cycles and supports primitives, plain objects/arrays, `Date`,
  `RegExp`, `URL`, `BigInt`, `Map`, `Set`, `ArrayBuffer`, and the current
  typed-array source table; direct unsupported values report the state path.
- The main package exposes the curated public surface, including author
  intrinsics, the payload-driven resume helper, and source-entry Rolldown/Vite
  adapters. Current adapter tests cover `.tsrx` transform metadata,
  resolver/payload virtual module loading, and Vite transform/load forwarding.

## Remaining Major Work

- Continue state-lvalue coverage beyond the current focused cases, including
  additional array write forms, nested aliases, collection-method edge cases,
  delete edge cases, and remaining invalid write diagnostics.
- Implement `shared()` beyond the current intrinsic stub/re-export surface,
  including semantic graph records for definitions and instance calls, stable
  definition IDs, request/container/page scope handling, shared-definition
  dependency and cycle diagnostics, payload serialization, runtime graph-instance
  resolution, and cross-runtime patch synchronization.
- Preserve the compiler pass-boundary split as new behavior lands; future
  compiler additions should name the touched pass ID, consumed/produced
  artifacts, owning module, and focused artifact test.
- Add generic pass execution and human-readable artifact dump tooling beyond the
  current manual `compileTsrxModule` pass calls, and add focused coverage for
  duplicate pass-ID validation.
- Finish template/view lowering and final emit beyond the early payload and
  resolver artifacts.
- Implement TSRX control-flow identity support beyond the current generic AST
  walk, including keyed loop scope records, positional/unkeyed loop diagnostics
  for stateful or interactive bodies, branch-local graph scope records, branch
  disposal diagnostics, branch/list payload locators, and runtime disposal of
  branch/list-owned graph state, bindings, events, async work, and behaviors.
- Implement children/projection support beyond current prop aliases, including
  opaque projection artifacts, projection-site payload metadata, pass-through and
  wrapping behavior, disposal semantics, and diagnostics for inspecting, mapping,
  cloning, counting, or mutating `children`.
- Implement TSRX dynamic tag/component and scoped-style handling beyond current
  static tag-name collection, including dynamic `<{expr}>` artifacts,
  host/component ownership decisions, style-scope and style-composition records,
  payload/runtime metadata, and focused diagnostics.
- Implement authored template-comment and statement-container lexical-scope
  support beyond current generic AST traversal, including preservation or skip
  rules for authored comments, comment-aware locator planning, statement-scope
  artifacts, and tests where authored comments interact with generated async
  boundary anchors.
- Implement symbol source extraction and chunk/export generation beyond current
  planned symbol IDs and fixture-supplied symbol tables, including event handler,
  DOM binding, behavior, and async-runner source-to-module extraction plus
  resolver manifests derived from real build output.
- Broaden payload/protocol coverage beyond the current simple DOM-order locator
  and data-script wrappers, including branch/list/fragment locator streams,
  compact production encoding, and resolver tables derived from real build
  chunks.
- Broaden sync event policy coverage beyond the current graph-state/event-field
  guard cases, including IR/runtime support for props/constants allowed by the
  spec, handler-array policy behavior, more unsupported-policy diagnostics, and
  real browser default-action timing.
- Broaden event-handler array runtime behavior beyond current ordered symbol-ID
  iteration, including focused tests for multiple lazy handlers on one event,
  stop-at-first thrown or rejected handler, normal error-boundary routing,
  committed-write no-rollback behavior, and ignored return values for ordinary
  events.
- Implement `onVisible` visibility-event behavior beyond current delegated DOM
  event records, including one shared observer per resumed root/page, lazy symbol
  loading on first intersection, current-value read semantics, returned cleanup
  storage, and cleanup on host disposal.
- Broaden diagnostics beyond current package object shapes, including docs pages
  for every stable code, human code frames, editor/dev-server overlays, runtime
  error-hook routing, version/hash mismatch metadata, and coverage for required
  diagnostics that are not yet implemented.
- Broaden element handle and behavior coverage beyond current compiler/payload
  artifacts, including lazy-symbol `element()` handle materialization by handle
  ID/name, missing or removed locator behavior, initial-render `undefined`
  semantics, behavior input serialization and change reruns, focused
  multiple-behavior install/cleanup ordering coverage, and real DOM removal
  cleanup.
- Continue async boundary work beyond the current resume-runtime demand slice,
  including initial-render awaiting, pending/fulfilled/rejected branch DOM
  replacement between anchors, branch cleanup, rejected/error rendering policy,
  emitted async runner modules, and build-manifest integration that connects
  generated runner symbols to real chunks.
- Build the initial-render runtime entry, connect it to the existing compiler
  payload-script/render-shell artifacts, and broaden the browser resume entry
  into component/browser and end-to-end coverage around the unified
  runtime/protocol model.
- Add fixture-backed Rolldown/Vite build behavior, emitted symbol chunks,
  build-manifest files, Vite dev HTML/HMR coverage, and witness receipts.
- Finish production packaging/build metadata beyond the current flat root
  `dist/` output, including package-local export wiring, package build ordering,
  dependency externalization policy, and the final public/internal package split.
- Broaden `packages/test-utils` beyond the current payload script helpers into
  fixture harnesses, artifact assertions, browser helpers, and witness
  integration helpers as real package/browser/pipeline tests land.
- Add component/browser and eventual resumability end-to-end tests that prove no
  component execution on browser resume.

## Verification Ledger

Verification entries are scoped evidence. A focused compiler/runtime test proves
the slice named by the test, and a spec-only format or whitespace check proves
only the edited documentation files. Do not use a narrow command as evidence for
broader product completion.

Recorded commands are receipts from the worktree at the time they were run, not
permanent green status. Before claiming a slice is currently complete, rerun the
latest narrow command that covers that slice or record why a stronger source of
evidence now supersedes it.

Current `vp test` receipts use the root vite-plus Node test project
(`environment: 'node'`) and include `packages/*/test/**/*.test.ts`; at this
ledger update, that is 37 package test files. Treat those results as
package/unit-integration evidence. They do not prove browser-mode component
tests, real browser resume, witness HMR/build-pipeline behavior, or end-to-end
no-component-execution-on-resume behavior.

The production package implementation and split spec files are now tracked on
the current `impl` branch. `git diff --check` proves whitespace only for the
current tracked modifications; use `vp fmt --check`, `vp check`, focused tests,
and explicit file scans when verification needs to include the broader tracked
package/source set. The current untracked `dist/` directory is generated
pack-output evidence, not source-of-truth implementation state.

Historical focused implementation receipts retained for context:

- `pnpm exec vp test packages/compiler/test/semantic-alias-collector.test.ts packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/*.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-expression-collector.test.ts packages/compiler/test/state-lowering-delete.test.ts packages/runtime/test/runtime-graph.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-expression-collector.test.ts packages/compiler/test/state-lowering-update.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-expression-collector.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-expression-collector.test.ts packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-expression-collector.test.ts packages/compiler/test/state-lowering-delete.test.ts`
- `pnpm exec vp test packages/runtime/test/runtime-graph.test.ts`
- `pnpm exec vp test packages/runtime/test/*.test.ts`
- `pnpm exec vp test`

Historical spec/progress maintenance and build receipts retained for context:

- `pnpm exec vp check package.json pnpm-lock.yaml pnpm-workspace.yaml vite.config.ts packages specs/framework-design.md specs/state.md`
- `git diff --check`
- architecture/path scans
- `pnpm exec vp pack`

Latest implementation/build receipts for current package slices:

These commands were rerun during the implementation and ledger-update sequence
after the current package files were created or changed. They remain scoped
receipts, not permanent green status; rerun the relevant command before using it
as evidence for a new source change.

- `pnpm exec vp pack`
- `pnpm exec vp test`
- `pnpm exec vp test packages/compiler/test/*.test.ts`
- `pnpm exec vp test packages/compiler/test/capture-analysis.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-*.test.ts`
- `pnpm exec vp test packages/compiler/test/state-lowering.test.ts packages/compiler/test/state-lowering-update.test.ts packages/compiler/test/state-lowering-delete.test.ts packages/compiler/test/semantic-expression-collector.test.ts`
- `pnpm exec vp test packages/compiler/test/module-split.test.ts packages/compiler/test/pass-pipeline.test.ts`
- `pnpm exec vp test packages/compiler/test/payload-arena.test.ts packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/symbol-resolver-emit.test.ts packages/compiler/test/compile-module.test.ts packages/runtime/test/payload-scripts.test.ts packages/serializer/test/payload-scripts.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-sync-policy-collector.test.ts packages/compiler/test/sync-policy.test.ts packages/compiler/test/semantic-diagnostics.test.ts packages/runtime/test/resume.test.ts packages/runtime/test/payload-scripts.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/symbol-resolver.test.ts packages/runtime/test/behaviors.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/semantic-graph.test.ts packages/compiler/test/semantic-collector-boundaries.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/symbol-resolver.test.ts packages/runtime/test/runtime-graph.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/semantic-alias-collector.test.ts packages/compiler/test/state-lowering.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/semantic-collector-boundaries.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-graph.test.ts packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/payload-arena.test.ts`
- `pnpm exec vp test packages/compiler/test/protocol-view.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/symbol-resolver-emit.test.ts packages/compiler/test/compile-module.test.ts packages/rolldown/test/transform.test.ts packages/vite/test/adapter.test.ts`
- `pnpm exec vp test packages/compiler/test/protocol-view.test.ts packages/compiler/test/symbol-resolver.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/runtime/test/behaviors.test.ts packages/runtime/test/payload-scripts.test.ts`
- `pnpm exec vp test packages/compiler/test/symbol-resolver-emit.test.ts packages/compiler/test/semantic-diagnostic-constructors.test.ts`
- `pnpm exec vp test packages/runtime/test/runtime-graph.test.ts`
- `pnpm exec vp test packages/runtime/test/*.test.ts`
- `pnpm exec vp test packages/runtime/test/resume.test.ts packages/runtime/test/payload-scripts.test.ts packages/runtime/test/behaviors.test.ts packages/runtime/test/bindings.test.ts`
- `pnpm exec vp test packages/serializer/test/serializer.test.ts`
- `pnpm exec vp test packages/resumable/test/public-surface.test.ts packages/rolldown/test/transform.test.ts packages/vite/test/adapter.test.ts`
- `pnpm exec vp test packages/core/test/intrinsics.test.ts packages/protocol/test/protocol.test.ts packages/test-utils/test/payload-helpers.test.ts`

Current spec/ledger-maintenance receipts:

These checks were rerun or directly refreshed while updating the design index and
progress ledger. They cover documentation whitespace/formatting, package
formatting/lint coverage through `vp check`, inventory facts, and guardrail
scans. They do not refresh implementation test or pack receipts unless those
commands are listed in the implementation/build section above.

- `git diff --check`
- `pnpm exec vp fmt --check specs/framework-design.md specs/state.md specs/framework/*.md`
- `pnpm exec vp check package.json pnpm-lock.yaml pnpm-workspace.yaml vite.config.ts packages specs/framework-design.md specs/state.md specs/framework/*.md`
- code-fence scan over current implementation-facing specs confirmed no `tsx`
  or `jsx` fence labels remain outside the historical archive.
- terminology scan over current split specs confirmed generic current-contract
  SSR/server-rendering references were replaced with initial-render or
  render/resume wording; explicit Streaming SSR deferred-decision text remains.
- build-order scan confirmed no current split spec asks for a CSR-first compiler
  demo path.
- status-wording scan confirmed current native/compiler-substrate language says
  first compiler implementation rather than first prototype; remaining
  prototype references are explicit temporary-prototype guardrails.
- architecture scan over `packages` and the edited spec files for accidental
  Node-only APIs, hydration/VDOM/client-rerender paths, `packages/server`, and
  TSX/JSX references; hits were expected non-goal/contrast text or local
  implementation identifiers such as DOM node variables and `ArrayBuffer`.
- diagnostic code scan compared implemented `AA_*` diagnostics against the
  diagnostics split spec and replaced placeholder example code/domain text with
  implemented stable diagnostic shapes.
- diagnostic inventory audit confirmed 17 implemented `AA_*` codes across
  semantic graph, state lowering, capture analysis, serializer unsupported-value,
  and generated unknown-symbol resolver paths, and aligned the diagnostics spec
  phase list with the implemented `semantic-graph` phase.
- diagnostic-scope audit confirmed current diagnostics coverage is limited to
  package/artifact-level object shapes for compiler passes, serializer
  unsupported-value failures, and generated unknown-symbol resume errors.
- semantic-collector audit confirmed current semantic graph coverage is
  concentrated in eight focused `semantic-*.test.ts` files plus pass-boundary
  tests for module split and pass graph validation.
- async-boundary audit confirmed current coverage is focused on compiler
  diagnostics for post-`await` reads and missing async boundaries, payload/view
  runner symbol wiring, runtime async request versioning/stale suppression, and
  Node fake-DOM boundary runner dispatch for pending/fulfilled status changes.
- runtime-async-status audit confirmed the graph source has pending, fulfilled,
  and rejected async snapshot paths and applies version/abort guards before
  fulfilled and rejected commits, but current focused runtime tests assert
  pending/fulfilled snapshots and stale fulfilled completion suppression only.
- async-boundary DOM audit confirmed current resume tests use a boundary runner
  symbol that returns `setText` journal records for pending/fulfilled status; no
  package source or test applies pending, fulfilled, or catch branch DOM
  replacement between async boundary anchors.
- state-lowering audit confirmed current coverage is focused on semantic
  expression collection plus state-lowering artifact tests for assignment,
  update, selected static collection-call artifacts (`push`, `Map.set`,
  `Set.add`, and static computed method literals), static deletes, selected
  aliases, and selected diagnostics; runtime graph tests separately cover
  broader Array/Map/Set method behavior.
- sync-event-policy audit confirmed current coverage is focused on compiler
  policy IR for graph-state truthiness, event-field equality, `and`/`or`/`not`
  composition, one unextractable-policy diagnostic shape, and Node fake-DOM
  runtime evaluation before lazy symbol dispatch.
- sync-policy prop/constant audit confirmed the current compiler, protocol, and
  runtime condition IR has graph-truthy and event-equals variants only, with
  literals used as event comparison values; no package source or focused test
  covers prop reads or serializable constant reads in synchronous policy guards.
- onVisible audit confirmed current package source has no `onVisible`
  special-case, visibility event record kind, or `IntersectionObserver`
  implementation path. Event collection uses the generic `on*` attribute path
  from `@tsrx/core`, and resume tests cover delegated DOM-event dispatch only,
  not visibility-triggered lazy symbol loading, fires-once behavior,
  current-value reads, or returned cleanup handling.
- event-handler-array audit confirmed protocol/compiler tests preserve ordered
  handler sources and event `symbolIds` for handler arrays, and the resume source
  iterates those IDs sequentially, but runtime tests cover only single-symbol
  event dispatch and do not cover multiple handlers on one event,
  rejected/throwing handlers,
  error-boundary routing, committed-write no-rollback behavior, or ignored
  return values.
- element-handle runtime audit confirmed compiler/payload/protocol tests carry
  `elementHandles` records with `hostNodeId`, `handleId`, and local `name`, and
  runtime payload-resume tests expose `getElement(hostNodeId)` for host-node
  lookup. Runtime symbol context still exposes only the owner element, not an
  authored handle lookup table, so no package source materializes
  `element()` handles for lazy symbols by handle ID or local handle name.
- behavior-lifecycle audit confirmed compiler/protocol tests preserve two
  behavior source records and symbol IDs in authored/view order, and the resume
  source installs behavior records in view order with `{ graph, element }` only
  and reverses recorded cleanup callbacks on `disposeHost`. Current focused
  runtime coverage exercises one behavior only, and no package source emits
  serialized behavior input records, materializes behavior inputs, or wires
  input-change reruns.
- element/behavior audit confirmed current coverage is focused on compiler
  diagnostics and payload records for `el` / `use`, behavior symbol planning, and
  one Node fake-DOM runtime behavior install/cleanup path.
- capture-analysis audit confirmed current coverage is focused on semantic
  `localBindings` categories, planned symbol sources, selected alias/destructuring
  propagation, one positive `Date` serializable-constant case, `Map`
  non-serializable-content cases, and selected false-positive guards for strings,
  property keys, method keys, parameters, and top-level symbol body declarations.
- payload/symbol audit confirmed current coverage is focused on compiler
  `payload-arena`, `symbol-resolver`, `protocol-view`,
  `symbol-resolver-module`, and `payload-scripts` artifacts, serializer JSON
  data-script wrappers, and runtime payload decoding/resume helpers against
  small Node fake-DOM fixtures.
- runtime-payload audit confirmed `decodePayloadScripts` validates the canonical
  script wrapper and shared protocol version, while
  `createRuntimeGraphFromStatePayload` deserializes protocol state cell values
  into runtime graph cells only.
- runtime payload-resume audit confirmed `resumeFromPayloadScripts` composes
  payload decoding, runtime graph creation, `async/view` materialization, and
  delegated event/boundary startup for caller-supplied payload strings and a
  DOM-like root. It does not scan a real browser document for payload scripts or
  prove real DOM/browser startup behavior.
- package/spec inventory scan confirmed nine production package manifests, no
  `packages/server` manifest, and split spec files `00` through `09` under
  `specs/framework/`.
- path-reference audit normalized ledger source/spec paths to repo-root
  `specs/...` paths where they appear beside repo-root `packages/...` paths.
- evidence-anchor audit aligned compiler pass-boundary pointers with the current
  concrete compiler files, including `pass-graph.ts`, `pass-registry.ts`,
  `ast/*`, and `artifact-helpers/*`.
- compiler-pass-registry audit confirmed the default registry exposes nine pass
  IDs with declared `consumes` / `produces` boundaries, `compileTsrxModule`
  returns the validated pass graph, and current pass execution is still manually
  wired through pass-owned module calls.
- compiler-pass-graph audit confirmed `validateCompilerPassGraph` rejects
  duplicate pass IDs in source, while current focused pass graph tests still
  cover runnable ordering, missing artifacts, duplicate artifact producers, and
  dependency cycles rather than a duplicate pass-ID fixture.
- non-compiler evidence-anchor audit aligned runtime, serializer, public-surface,
  and adapter pointers with current concrete entry files instead of broad source
  globs.
- test inventory scan confirmed 37 package test files currently match the root
  vite-plus Node test include, `packages/*/test/**/*.test.ts`.
- package-manifest audit confirmed all nine production package manifests are
  `private`, export source entry points under `./src/...`, and are not wired to
  generated `dist/` artifacts; `packages/resumable` additionally exposes its
  `./vite` source subpath.
- workspace/build-config audit confirmed root scripts are thin vite-plus aliases,
  `pnpm-workspace.yaml` uses only `packages/*` as a package glob while keeping
  shared dependency versions in the default pnpm catalog, and the current
  `vite.config.ts` uses a flat ten-entry source map for `vp pack` plus a
  Node-only package test include.
- pack-output audit confirmed `pnpm exec vp pack` currently cleans the untracked
  root `dist/` directory and emits 26 ESM/declaration files for the configured
  ten-entry source map plus hashed shared chunks. The command still reports
  dependency-bundling hints for packages such as `pathe`, `acorn`, and TSRX
  parser support dependencies.
- initial-render gap scan confirmed the runtime package currently exposes graph,
  payload, and resume-helper modules, but no runtime initial-render entry,
  document-scanning browser bootstrap, or initial-render package test.
- initial-render remaining-work audit clarified that the existing compiler
  `renderShell` is a payload-script artifact, not the initial-render runtime
  pipeline.
- bundler-adapter source/test audit confirmed current Rolldown/Vite coverage is
  limited to source-level `.tsrx` transforms, transform manifests,
  resolver/payload virtual module loads, and Vite transform/load forwarding; it
  does not exercise a real plugin container, build, or dev server.
- public-surface source/test audit confirmed `packages/resumable` currently
  re-exports author intrinsics, `resumeFromPayloadScripts`, the Rolldown adapter,
  and its `./vite` adapter subpath through private source-entry package
  manifests; current tests import those source entries directly rather than
  proving installed package export resolution.
- core/protocol/test-utils audit confirmed support-package coverage is limited to
  runtime failure messages for compiler-only intrinsics, protocol version/type
  fixtures, opening payload script marker assertions, and selected protocol
  record-count summaries for cells, locators, events, bindings, and behaviors.
  The current test-utils summary helper does not parse payload JSON, validate
  closing script tags, or count computed entries, element handles, or async
  boundary records.
- shared-state audit confirmed current `shared()` support is limited to the
  `@async/resumable-core` compiler-intrinsic stub, the main package re-export,
  public-surface presence checks, and diagnostic suggestion text. The semantic
  graph collector currently records `state()`, `computed()`, and `element()`
  calls, but not shared definitions or shared instance calls. The current core
  stub/test use a placeholder `shared(id, create, options)` call shape and do
  not prove the authored `shared(() => ...)` definition/instance-call surface
  from `03-state-graph.md`.
- props/projection audit confirmed current component parameter support is limited
  to first-parameter synthetic `prop` graph bindings, object-pattern aliases,
  prop reads, and read-only prop-write diagnostics. This is a compiler-artifact
  path only; no current package source emits runtime getter-backed prop wiring,
  component-boundary prop propagation, children projection artifacts, projection
  payload metadata, or React-style child manipulation diagnostics.
- control-flow identity audit confirmed the semantic walker descends generic
  `childNodes()` for non-special AST nodes and gives only `TryStatement` a
  dedicated async-boundary context. No current focused fixture exercises authored
  TSRX `@if`, `@for`, or `@switch`, and no package source emits keyed loop
  identity records, branch-local graph scope records, unkeyed stateful-loop
  diagnostics, branch/list locator streams, or control-flow disposal metadata.
- dynamic-tag/style audit confirmed current element collection derives static
  host/component classification from identifier tag names and lowercase host
  names, and tests static component-vs-host `use` diagnostics. The current split
  specs only list dynamic tags/components and scoped styles as TSRX baseline
  syntax; no package source emits dynamic tag/component artifacts, dynamic
  ownership diagnostics, style-scope records, style-composition records, or
  scoped-style payload metadata.
- authored-comment/scope audit confirmed current generic AST traversal ignores
  `leadingComments` / `trailingComments`, payload planning assigns generated
  async-boundary anchors to raw `dom-order-comment` indexes, and runtime resume
  materializes those indexes by walking every comment node under the root. No
  package source emits authored template-comment records, authored-comment skip
  metadata, comment-aware async-anchor offsets, or statement-container lexical
  scope artifacts.
- symbol-extraction audit confirmed `planSymbolResolver` creates source-bearing
  planned symbols for event handlers, DOM bindings, behaviors, and
  async-computed runners, while `compileTsrxModule`, `transformTsrxModule`, the
  Rolldown adapter, and the Vite wrapper still accept caller-supplied
  `id`/`chunk`/`exportName` tables for resolver emission. No package source
  extracts planned symbol source strings into emitted handler, binding,
  behavior, or async-runner modules, and no build adapter derives resolver tables
  from real chunk output.
- runtime-graph journal audit confirmed current graph source accepts the full
  `DomJournalRecord` union, records subscription-produced DOM journal entries,
  and exposes them through `takeJournal`; executable coverage currently
  exercises `setText` records and one `setAttr` resume path, with no `setProp`,
  range-operation, cleanup, real-DOM application, or browser-ordering coverage.
- runtime sync-computed audit confirmed current runtime graph source lazily
  recomputes dirty sync computed nodes on read and marks dependent computed and
  async-computed nodes dirty when a computed node changes; focused tests
  directly exercise one state-path dependency and its subscriber journal update,
  not computed-on-computed chains or generated binding integration.
- runtime collection-call audit confirmed the semantic expression collector and
  runtime share the current static mutating-method allow-list, while focused
  tests directly cover only selected representative methods and no-op cases:
  `push`, `unshift`, `pop`, `shift`, `Map.set`, `Map.delete`, `Map.clear`,
  `Set.add`, `Set.delete`, and `Set.clear`.
- runtime-resume harness audit confirmed current resume and payload-resume tests
  run in Node against minimal DOM-like objects, not a real browser DOM or
  component/browser harness.
- serializer-scope audit confirmed current serializer coverage is focused on
  pure value built-ins, identity/cycles, typed-array backing-buffer identity and
  offsets, direct `serializeGraphValue` unsupported-function diagnostics,
  successful protocol state payload construction, and canonical `async/state` /
  `async/view` script wrappers. Source has encode/decode branches for the
  current typed-array family, while focused tests directly exercise `Uint8Array`
  and `Int16Array`.
- serializer-tier audit confirmed current package source implements pure
  built-in value graph serialization and protocol-state wrapping only. It does
  not yet implement framework graph reference records, async/shared snapshot
  serialization, app-owned or third-party value class restoration, or compact
  production arena encoding from the payload spec tiers.
- diagnostic-inventory audit confirmed the implemented stable code list in this
  ledger matches package source for compiler, serializer, and generated resolver
  diagnostics; it also confirmed `sync-policy` is an implemented/tested
  diagnostic phase through `AA_SYNC_POLICY_UNEXTRACTABLE`.
- completion-scope wording audit confirmed status entries now distinguish
  spec/tooling evidence from implementation evidence and still keep product-level
  render/resume completion explicitly unproven.

## Known Caveats

- `dist/` is untracked generated output from `pnpm exec vp pack`; do not treat it
  as source.
- Package manifests are still internal/development oriented: all production
  packages are marked `private`, their `exports` fields point at `./src/...`
  entry points rather than generated `dist/` files, and the main package's
  `./vite` subpath also points at source. Current `vp pack` success proves the
  configured flat entry-map build emits ESM/declaration artifacts into root
  `dist/`; it does not prove publish-ready package metadata, package-local output
  wiring, package build ordering, dependency externalization policy, or final
  dependency chunking.
- The compiler has an early render-shell artifact path for payload scripts, but
  the runtime package does not yet contain a working initial-render entry. Treat
  payload-resume decoding as a resumed-runtime slice, not proof of the
  initial-render -> payload -> browser-resume pipeline.
- The current payload-driven resume helper takes explicit payload script strings
  and a root object from the caller. It is not yet a document-scanning browser
  bootstrap that locates `async/state` / `async/view` scripts or proves startup
  in a real browser document.
- Current payload/symbol tests prove simple DOM-order locators, protocol state
  cell/computed metadata planning, protocol view wiring, source-bearing planned
  symbol records, symbol ID wiring, resolver module string emission from supplied
  chunk/export tables, fail-closed unknown-symbol metadata, canonical JSON
  data-script wrappers, and Node fake-DOM payload decoding/resume helpers. They
  do not prove async snapshot records, shared snapshot records, protocol schema
  validation beyond wrapper/version checks, protocol computed entries becoming
  runtime computed/async nodes, compact production payload encoding,
  branch/list/fragment locator materialization, symbol source extraction into
  emitted chunks, resolver tables generated by a real build manifest, generated
  symbol exports, browser-loaded dynamic imports, or a real initial-render
  payload. Current chunk/export tables are fixture inputs, not build-derived
  evidence.
- Current TSRX control-flow coverage proves ordinary nested element traversal,
  source-level generic `childNodes()` descent for non-special nodes, and
  async-boundary records for `TryStatement` parser output. It does not prove
  authored `@if`, `@for`, or `@switch` parsing fixtures; keyed `@for` identity;
  positional/unkeyed loop diagnostics; branch-local graph scope ownership;
  `@if`/`@switch` branch disposal; branch/list payload locators; or runtime
  cleanup of graph state, events, bindings, async work, and behaviors owned by
  removed control-flow ranges.
- Current sync-event-policy tests prove selected compiler IR extraction,
  `AA_SYNC_POLICY_UNEXTRACTABLE` object shape for one unsupported guard, and
  runtime execution before lazy symbol dispatch against fake DOM events. They do
  not prove prop policy reads, serializable constant policy reads, protocol or
  runtime condition variants for those reads, all unsupported guard diagnostics,
  handler array edge cases, real browser default-action timing, navigation/form
  cancellation timing, or generated-build integration.
- Current event-runtime coverage proves delegated DOM events against Node
  DOM-like test doubles. It does not prove `onVisible` as a visibility-triggered
  event distinct from normal event names, shared `IntersectionObserver` wiring,
  one-shot visibility triggering, current-value read semantics, returned cleanup
  storage, cleanup on element removal, or browser observer timing.
- Current event-handler array coverage proves ordered handler source extraction,
  ordered `symbolIds` in compiler/protocol artifacts, and source-level
  sequential iteration in the resume runtime. Runtime tests currently prove
  single-symbol event dispatch only. They do not prove runtime behavior for
  multiple handlers on one event, stop-at-first-error semantics, error-boundary
  routing, no rollback after committed writes, or ignored ordinary-event return
  values.
- Current element/behavior tests prove invalid and duplicate `el` diagnostics,
  `use`-on-component diagnostics, element handle payload/protocol records,
  multiple behavior source records and symbol IDs in authored/view order,
  host-node lookup through `getElement(hostNodeId)`, and one fake-DOM behavior
  install/cleanup path. The resume source stores returned behavior cleanups and
  reverses them on explicit host disposal, but focused runtime tests do not prove
  multiple-behavior install/cleanup ordering. They also do not prove lazy-symbol
  `element()` handle materialization by handle ID/name, initial-render absence,
  removed-locator `undefined` semantics, behavior input serialization,
  materialized behavior inputs in symbol context, behavior reruns on input
  changes, real DOM removal cleanup, or browser-loaded behavior chunks.
- Current async computed/boundary tests prove selected compiler diagnostics,
  async-capable propagation, payload runner IDs, runtime request versioning,
  abort signals, stale fulfilled completion suppression, and fake-DOM boundary
  runner dispatch for pending/fulfilled status through journal records. They do
  not prove committed rejected async snapshots, stale rejected completion
  suppression, initial-render awaiting, serialized async snapshots that prevent
  browser refetch, rejected-status runner dispatch, rejected branch rendering,
  pending/fulfilled/error DOM range replacement between anchors, branch cleanup,
  real browser timing, or build-generated async runner chunks.
- Current resume-runtime tests prove delegated event, sync policy, behavior,
  binding, async-boundary, and payload-resume behavior against DOM-like test
  doubles in the Node test project. They do not prove real browser DOM behavior,
  component/browser execution, layout/locator behavior in an actual document, or
  no-component-execution-on-resume in a browser.
- Current runtime graph tests prove in-memory graph invalidation, scheduling,
  one direct sync-computed lazy recompute path, async request versioning,
  abort-signal wiring, stale fulfilled completion suppression, selected
  collection calls and no-op invalidation behavior, static deletes, and
  subscriber-produced `setText` journal collection. The runtime graph source
  marks dependent computed and async-computed nodes dirty when a computed node
  changes, but focused tests do not directly exercise computed-on-computed
  dependency chains. The runtime and expression-collector source allow-lists
  also include `copyWithin`, `fill`, `reverse`, `sort`, and `splice`, but
  focused tests do not directly exercise those methods. Current resume-runtime
  tests add one `setAttr` journal path. They do not prove `setProp`,
  `insertRange`, `removeRange`, `moveRange`, or `runCleanup` records; that
  compiler-emitted binding symbols apply the DOM journal to real browser nodes;
  generated binding-symbol integration for computed dependencies; or that
  journal ordering is correct under a browser event loop.
- Current state-lowering tests prove artifact lowering and diagnostics for
  selected graph reads/writes, assignment/update metadata, static collection
  calls, static deletes, optional graph writes, rest-alias exclusions, read-only
  writes, and const reassignment. They do not prove final emitted JavaScript
  preserves value/short-circuit semantics in generated code, generated
  collection-call wiring into runtime `graph.call`, coverage for all nested alias
  or array mutation forms, or browser/runtime integration beyond focused runtime
  graph tests.
- Current props/projection coverage proves first-parameter synthetic prop
  binding collection, object-pattern prop aliases, `prop:props` read lowering,
  and read-only prop write diagnostics. It does not prove default/rest/nested
  parameter handling beyond the current object-pattern alias collector, runtime
  getter-backed props, parent graph re-read behavior, prop update propagation
  through component boundaries, `children` projection artifacts, projection
  payload records, projection disposal, pass-through projection behavior, or
  diagnostics for React-style child inspection/manipulation.
- Current dynamic tag/component/style coverage proves static identifier tag
  handling only: lowercase names become host node records, uppercase names stay
  component-like for `use` diagnostics, and protocol locators preserve the static
  `tagName`. It does not prove dynamic `<{expr}>` lowering, dynamic
  host/component ownership diagnostics, style scoping/composition, style payload
  metadata, or runtime behavior for dynamically selected hosts/components.
- Current authored-comment and statement-scope coverage proves generated
  async-boundary `dom-order-comment` records and runtime materialization by raw
  comment index only. It does not prove authored TSRX comment preservation,
  comment-skipping or offset logic, statement-container lexical-scope artifacts,
  or locator behavior when authored comments appear before generated
  async-boundary anchors.
- Current `shared()` coverage proves only that the compiler-intrinsic stub throws
  when executed directly and that the main package re-exports the function. It
  does not prove the final authored `shared()` call shape, shared definition
  parsing, stable shared definition IDs, graph-context resolution,
  request/container/page scoped instances, shared dependency/cycle diagnostics,
  payload records, browser resume of shared instances, cross-runtime patch
  events, or design-system widget graph instance identity.
- Current serializer tests prove selected pure built-in value round-trips,
  identity/cycles, typed-array backing-buffer identity and offsets for
  `Uint8Array` / `Int16Array`, pathful unsupported-function diagnostics from
  `serializeGraphValue`, successful protocol-state wrapping, and canonical
  payload script tags. They do not prove exhaustive typed-array class coverage,
  app-owned or third-party value class restoration, framework graph reference
  serialization, shared or async snapshot integration, structured diagnostic
  propagation through protocol-state or initial-render payload construction,
  secret-leak/resource diagnostics, compact production wire encoding, or
  integration with a real initial-render payload.
- Current core/protocol/test-utils tests prove the compiler-only intrinsic
  runtime failure path, protocol version sharing across empty state/view payloads,
  opening payload script marker checks, and selected protocol record counting for
  cells, locators, events, bindings, and behaviors. They do not prove full
  payload script parsing, closing-tag validation, public API stability for
  internal packages, runtime protocol validation, protocol migration/version
  negotiation, complete protocol fixture assertions for computed entries,
  element handles, or async boundaries, browser helpers, or witness integration
  helpers.
- Current diagnostics coverage proves selected compiler/serializer/resolver
  diagnostic object shapes, stable codes, docs URL shape, and the implemented
  `semantic-graph` / `sync-policy` / `state-lowering` / `capture-analysis` /
  `serialization` / `resume` phase names in package tests. It does not prove
  end-user CLI output, editor integration, dev-server overlays,
  source-map/source range rendering, published error documentation,
  browser/runtime error routing, build-pipeline diagnostic propagation, runtime
  protocol/hash mismatch diagnostics, async result serialization diagnostics, or
  every required compile-time diagnostic in `specs/framework/07-diagnostics.md`.
- Current capture-analysis tests prove selected unsupported local binding
  categories against planned symbol source strings. They do not prove a complete
  lexical closure graph, exhaustive serializable built-in allow-list coverage,
  module import re-emission, type/value flow analysis, final emitted chunk
  capture validation, or runtime serializer integration.
- Current compiler pass-boundary tests prove the pass ID list, selected
  `consumes` / `produces` boundaries, runnable order derivation, missing-artifact
  failures, duplicate-producer failures, dependency-cycle failures, source layout
  ownership, and the returned `compileTsrxModule` pass graph. They do not prove a
  generic pass executor, artifact dump tooling, disabled/reordered pass
  execution, focused duplicate pass-ID fixture coverage despite source-level
  validation, or full artifact-focused coverage for every pass output.
- Current Rolldown/Vite adapter and public-surface tests exercise curated source
  re-exports, unit-level `.tsrx` transforms, resolver/payload virtual module
  loads, transform manifests, and direct Vite wrapper hook forwarding only. They
  do not prove installed package export resolution, publish-ready exports, real
  Rolldown/Vite build execution, emitted symbol chunks, manifest files,
  dev-server HTML injection, HMR updates, browser reloads, or witness receipts.
- At this ledger update, the production package implementation under
  `packages/`, this progress ledger, and the compiler split plan are tracked on
  the current `impl` branch. Status entries still describe current worktree
  files and command receipts rather than permanent PR status; rerun the relevant
  checks before treating a commit or PR diff as current evidence. The untracked
  `dist/` directory is generated pack output and should not be treated as
  source state unless a future task explicitly decides to commit generated
  artifacts.
- `pnpm-workspace.yaml` deliberately keeps `../native-tsrx` out of this
  workspace, but `packages/compiler/package.json` still declares `@tsrx/core` as
  `workspace:*` and the current lockfile resolves it through a sibling
  `../native-tsrx` link. Do not inspect or modify that sibling repository for
  async-await work. Parser-backed checks and install/build portability are not
  portable evidence until `@tsrx/core` is resolved as an external dependency
  boundary; artifact tests that construct inputs directly remain the safest
  focused verification path for compiler work that does not need parsing.
- Markdown-only `vp check` can report formatting success and then fail before
  lint analysis because there are no lintable files. For spec-only maintenance,
  use `vp fmt --check` plus `git diff --check`; use broader `vp check` only when
  the target set includes lintable source files.
- The production framework implementation is not feature-complete. Current tests
  and scans prove early compiler, runtime, serializer, public-surface, and
  build-adapter slices, not the full render/resume framework.
- Update this file after meaningful implementation passes so "completed" status
  remains separate from design requirements.
