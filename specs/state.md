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
- template binding target metadata through payload/protocol and a runtime helper
  that maps those targets to structural DOM journal records
- runtime graph scheduling, invalidation, collection-method calls, and partial
  resume wiring
- pure-value serializer support for identity/cycles and the accepted built-in
  value set
- early public package re-exports and Rolldown/Vite adapter shells, including
  virtual module exposure for current simple event-handler update symbols,
  DOM binding symbol modules, and transform
  manifests, a unit-tested build manifest asset hook, a fixture-backed Vite
  library build, and a direct Rolldown build that load the generated payload,
  resolver, manifest, and current generated symbol virtual modules while
  recording bundle-derived chunk filenames, finalized generated-symbol rows in
  the emitted build manifest, and final emitted chunk filenames in the generated
  resolver's exported symbol manifest for those current generated symbols;
  repeated transforms for the same `.tsrx` module now drop stale generated
  virtual modules before registering fresh artifacts, and the Vite adapter's
  structural `configureServer` / `handleHotUpdate` hooks invalidate generated
  virtual module graph nodes for changed `.tsrx` files and emit a custom
  dev-server update payload listing the changed module plus generated virtual
  module IDs, including server-originated hot updates routed through the
  configured Vite client environment name; `transformIndexHtml` injects an inert
  dev-only marker tag and a
  requestable virtual dev-client module in Vite dev HTML contexts, and a real
  Vite dev-server fixture proves that HTML transform, the virtual client request,
  and a `.tsrx` source transform run through Vite; that client listens for the
  custom update payload before redispatching it as a cancelable browser
  `CustomEvent`, and if no consumer prevents default it asks Vite HMR to
  invalidate the client module; the Vite adapter also defaults app builds to
  `build.modulePreload = false` so the framework manifest/bundle-graph path owns
  preload decisions; package-local Witness boxes under `packages/bundler/boxes`
  now run the Vite dev-server pipeline for the `vite-csr` fixture, edit a
  `.tsrx` file, record the `async-resumable:update` custom hot payload for the
  client environment without a Vite update payload, prove a real browser page
  receives the cancelable custom event without navigating, and prove the CSR
  production build emits `async-resumable-manifest.json`, `build/bundle-graph.json`,
  and generated event-handler/DOM-binding async chunks without leaking dev-HMR
  client strings; the CSR production build is also served through Vite preview
  and proves client-created DOM can load the generated payload/resolver/symbol
  pipeline for a counter click with no console errors or failed requests; a
  package-local SSR build Witness box proves the Vite/Rolldown build emits both
  client and `ssr` environments and that the built server entry contains the
  counter DOM plus canonical `async/state` and `async/view` payload scripts; a
  package-local SSR preview Witness box runs the fixture's Vite app-build path,
  starts Vite preview, verifies the preview response contains server-produced
  counter DOM plus canonical payload scripts, and proves the browser entry
  resumes that DOM for a `0` to `1` counter update without box-side HTML
  rewriting; the vite-plus fixture now has a real app entry and package-local
  Witness preview receipt proving a vite-plus config can build the
  async-resumable manifest, bundle graph, and browser page through Vite preview;
  `buildStart` clears accumulated transform manifests and generated virtual
  modules before a new build/dev cycle

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
- full `onVisible` visibility-event support beyond the current host-agnostic
  observer hook and structural global `IntersectionObserver` adapter coverage,
  including current value read semantics, generated-build integration, real
  browser observer timing, and cleanup on real host removal
- lazy `element()` handle materialization for browser symbols, including
  handle-id/name lookup, current DOM resolution, initial-render absence, and
  removed-locator `undefined` semantics
- generated symbol resolver integration with real build chunks and manifests
  beyond the current generated DOM-binding and simple event-handler update
  filename/symbol map, including behavior/async-runner source-to-module
  extraction, broader event write forms, generated exports, and resolver tables
  fully derived from build output rather than fixture-supplied symbol tables
- `shared()` definition and instance support, including stable definition IDs,
  request/container/page scopes, graph-context resolution, dependency/cycle
  diagnostics, payload records, and cross-runtime patch behavior
- broader build-pipeline proof beyond the current direct Rolldown, Vite library
  build, repeated-transform artifact cleanup, build-start cleanup, structural
  hot-update invalidation/custom-payload/dev-client fixtures, one Vite
  dev-server transform fixture, package-local Witness dev/browser HMR receipts,
  one CSR production-build manifest/bundle-graph/no-dev-HMR-leakage receipt,
  one CSR preview client-click receipt, one SSR built-server-entry build
  receipt, one SSR built-server-entry preview browser resume-click receipt, and
  one vite-plus build/preview receipt,
  including real DOM hot replacement beyond the fixture's custom-event consumer,
  production SSR serving beyond the current fixture host,
  behavior/async-runner chunks,
  broader non-binding symbol support beyond simple event-handler update chunks,
  and resolver source/manifest tables derived from final emitted chunk
  specifiers beyond the current generated build fixture paths
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
  `packages/runtime/src/dom-journal.ts`, `packages/runtime/src/graph.ts`,
  `packages/runtime/src/payload.ts`, `packages/runtime/src/resume.ts`, and
  `packages/runtime/test/*`.
- Serializer boundaries: `packages/serializer/src/index.ts`,
  `packages/serializer/src/value.ts`,
  `packages/serializer/src/protocol-state.ts`,
  `packages/serializer/src/payload-scripts.ts`, and
  `packages/serializer/test/*`.
- Core/protocol/test utility surfaces: `packages/core/src/index.ts`,
  `packages/protocol/src/index.ts`, `packages/test-utils/src/index.ts`, and
  their package tests.
- Curated public surface and build adapters: `packages/resumable/src/index.ts`,
  `packages/resumable/src/vite.ts`, `packages/resumable/src/rolldown.ts`,
  `packages/bundler/src/rolldown.ts`, `packages/bundler/src/vite/index.ts`,
  and their package tests.

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
- The diagnostics split spec includes the diagnostic phases currently appearing
  in package source/tests: structured compiler artifacts use `semantic-graph`,
  `sync-policy`, `state-lowering`, and `capture-analysis`; serializer value
  results use `serialization`; and the generated symbol resolver's unknown
  symbol error metadata uses `resume`; runtime payload decode/version failures
  use `payload`; runtime locator materialization failures use `resume`; and
  direct framework API execution plus compiler pass-graph validation
  failures use `runtime`.
- The thin internal support packages have focused package tests for current
  narrow surfaces: `core` framework API stubs fail loudly with structured
  `AA_FRAMEWORK_API_RUNTIME_CALL` metadata when run without the TSRX compiler,
  including `shared()`; `protocol` exports the current protocol version and
  payload TypeScript shapes; and `test-utils` provides canonical payload script
  wrapper assertions, JSON decoding, selected protocol record-count summaries,
  and a decoded human-readable payload debug dump.
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
- The default pass registry currently declares ten pass IDs and artifact
  boundaries: `tsrx-semantic-graph`, `state-lowering`, `payload-arena`,
  `symbol-resolver`, `capture-analysis`, `protocol-state`, `protocol-view`,
  `payload-scripts`, `symbol-modules`, and `symbol-resolver-module`.
- Pass-owned modules exist for semantic graph collection, state lowering,
  payload arena planning, symbol resolver planning, capture analysis, protocol
  state planning, protocol view planning, payload script rendering, lazy symbol
  module emission for current DOM binding symbols, and symbol resolver module
  emission.
- Semantic graph collection is split into collector modules for module-scope
  diagnostics, components, elements, state/computed/element bindings, aliases,
  async boundaries, sync policy, and expression read/write collection.
- Focused module-boundary tests cover the compiler split and semantic collector
  ownership.
- `compileTsrxModule` validates the default pass graph and orchestrates the
  current source-to-artifacts path by manually calling the pass-owned modules in
  registry order.
- `compileTsrxModule` currently returns pass artifacts, protocol payloads,
  canonical payload scripts, a concatenated payload-only `renderShell`, a
  first `symbolModules` artifact for planned simple event-handler update symbols
  and DOM binding symbols, a generated symbol resolver module string, and a
  resolver manifest object. It does not return a final emitted JavaScript module
  for component execution, state access rewriting, behavior modules,
  async-runner modules, broad event write forms, or complete build-ready
  extracted symbol chunks.

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
  `AA_CAPTURE_UNSUPPORTED_VALUE`, `AA_SERIALIZE_UNSUPPORTED_VALUE`,
  `AA_SYMBOL_UNKNOWN`, `AA_PAYLOAD_INVALID`,
  `AA_PROTOCOL_VERSION_MISMATCH`, `AA_RESUME_LOCATOR_MISSING`,
  `AA_RESUME_LOCATOR_MISMATCH`, `AA_FRAMEWORK_API_RUNTIME_CALL`, and
  `AA_COMPILER_PASS_GRAPH_INVALID`.
- That inventory combines different current mechanisms: compiler passes return
  structured diagnostic objects, the pure serializer returns
  `AA_SERIALIZE_UNSUPPORTED_VALUE` diagnostics in its result object, the
  protocol-state payload wrapper throws `ProtocolStateSerializationError`
  objects that preserve those diagnostics with cell binding/name context, and the
  generated symbol resolver attaches `AA_SYMBOL_UNKNOWN` metadata to a thrown
  `Error` for unknown symbol IDs. Runtime payload helpers throw
  `RuntimePayloadError` objects with stable code, phase, docs URL, payload type,
  payload script selector, suggestions, and expected/actual version metadata for
  protocol-version mismatches. Runtime resume locator materialization throws
  `RuntimeResumeError` objects with stable code, phase, docs URL, DOM-order
  locator metadata, host node or boundary ID, suggestions, and expected/actual
  tag names for tag mismatches. Core framework APIs throw
  `FrameworkApiRuntimeError` objects with stable code, runtime phase, docs URL, and
  api name metadata when called without the TSRX compiler. Pass-graph
  validation throws `CompilerPassGraphError` objects with stable code, runtime
  phase, invalid-graph reason, pass ID, artifact keys, docs URL, and suggestions.
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
  serializable constant truthiness for literals, static object/array reads, and
  selected pure computed constant expressions, `and`/`or`/`not` composition, and
  literal event comparison values. Handler arrays with multiple extractable
  policies preserve each `{ when, actions }` branch instead of dropping later
  browser-critical actions.
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
- Payload arena and protocol view planning currently normalize template reads
  into source-bearing graph binding records with `hostNodeId`, `source`,
  `bindingId`, `path`, text, plain-attribute, common DOM property, class, or
  style target metadata, and an optional binding `symbolId`. Focused
  payload/protocol tests prove repeated reads of the same graph path on one host
  are kept distinct when their DOM targets differ and receive distinct binding
  symbol IDs. The runtime now has a focused helper that maps those binding
  targets to `setText`, `setAttr`, or `setProp` journal records, and lazy
  binding symbols receive the current subscription value plus the protocol
  binding record in their resume symbol context. They do not yet carry range
  target metadata or final compiler-emitted binding code.
- Payload arena and protocol view planning carry element handle locator records,
  host behavior records, and behavior symbol IDs into the current `async/view`
  payload shape.
- Resume runtime tests can recover a DOM element by host node ID through the
  current `getElement(hostNodeId)` API, and lazy symbol context now exposes
  authored `element()` handle lookup by handle ID or local handle name. Missing
  or unmatched handle locators resolve to `undefined`, and explicit host
  disposal removes matching handle ID/name lookups and invalidates the disposed
  host's `getElement(...)` lookup in the current fake-DOM runtime path.
- Symbol resolver planning assigns source-bearing lazy symbol records from
  current event, binding, behavior, and async-computed-runner artifacts. Resolver
  module emission owns dynamic import dispatch for the supplied chunk/export
  table. The `symbol-modules` pass now emits source strings for planned DOM
  binding symbols that consume resume binding context and
  `createBindingDomJournalRecord`, and it emits event-handler modules for the
  current lowered `++`/`--` graph-update path through `context.graph.update`.
  Behavior, async-runner, assignment, collection-call, and delete
  source-to-module extraction are not implemented yet. The Rolldown/Vite adapter
  path can now derive resolver rows for current generated event-handler and DOM
  binding virtual modules, and the current Vite fixture build proves the
  transformed `.tsrx` entry imports generated payload/resolver/manifest virtual
  modules so those generated symbol modules reach build output. The emitted
  `async-resumable-manifest.json` now records bundle-derived file names for
  generated resolver, payload, manifest, and current generated symbol virtual
  modules, plus finalized `{ symbolId, exportName, virtualModuleId, fileName }`
  rows for generated symbols when their virtual modules appear in bundle output.
  The emitted public module manifests omit the internal pre-build symbol rows
  used to derive those finalized rows. The bundle hook now uses those finalized
  generated-symbol rows to rewrite matching `chunk` fields in the emitted
  resolver's exported symbol manifest from generated virtual module IDs to final
  emitted file names for the current generated symbol path. Behavior and
  async-runner resolver rows still come from caller-supplied symbol tables rather
  than real build output, and pre-bundle generated resolver source still starts
  from virtual module IDs before the bundler rewrites dynamic imports and the
  bundle hook patches exported manifest rows.
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
- Payload script planning emits canonical JSON `async/state` and `async/view`
  data scripts and concatenates them into the current render-shell artifact.
  This is not the compact private arena encoding from the payload spec.

### Runtime, Serializer, And Build Adapters

- The runtime graph supports path-granular invalidation, microtask flush
  scheduling, direct sync computed lazy recomputation after path-granular
  invalidation, async computed request versioning, abort-signal wiring, stale
  fulfilled/rejected async completion suppression, same-key async invalidation
  skips, committed rejected async snapshots, standalone initial async-demand
  pending flush, and collection of subscriber-produced DOM mutation journal
  records.
- The runtime package exposes a structural DOM journal applier for caller-resolved
  DOM-like targets. Focused coverage proves ordered `setText`, `setAttr`, and
  `setProp` application, removal for nullish/false attributes, and
  `runCleanup` callbacks in journal order. It also routes `insertRange`,
  `removeRange`, and `moveRange` records through host callbacks in journal order;
  it does not yet apply those ranges to real browser DOM nodes. The runtime also
  exposes a helper that maps protocol binding targets for text, attribute,
  property, class, and style updates to concrete journal records. Resume binding
  subscriptions pass the current graph value and protocol binding record to lazy
  binding symbols, so generated symbols have the runtime data needed to consume
  that helper. The compiler does not yet emit those generated binding symbols.
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
- The resume runtime materializes current view records by recursively walking
  fake-DOM `childNodes` for element nodes, matching DOM-order indexes and
  case-insensitive tag names, then registers delegated DOM events, evaluates sync
  event policy before lazy symbol loading, dispatches delegated events from
  nested targets to owner element records, registers async view bindings as
  graph subscriptions, and invalidates explicit disposed-host locators plus
  their delegated event records. Missing DOM-order element locators and
  tag-mismatched locators now fail loudly with structured `RuntimeResumeError`
  metadata.
- Compiler/protocol tests preserve ordered event handler `symbolIds` for handler
  arrays, and the resume source iterates matched event symbol IDs in protocol
  order. Focused runtime tests execute multiple handler symbols for one event,
  stop at the first rejected handler, leave earlier committed graph writes in
  place, ignore ordinary handler return values, and flush committed graph work
  through a `try`/`finally` path before rethrowing the handler failure.
- The resume runtime treats `visible` event records as visibility observer
  records instead of delegated DOM events. Focused Node fake-DOM coverage proves
  one injected observer per resumed root, fallback to a structural
  `globalThis.IntersectionObserver` when no observer factory is injected,
  one-shot lazy symbol loading in authored order on first intersection, ignored
  non-visible observer entries, unobserve after first fire, unobserve on explicit
  host disposal before first intersection, ignored post-disposal observer
  entries, returned cleanup storage, and reverse cleanup on explicit host
  disposal.
- For element behaviors, compiler/protocol tests preserve behavior source records
  and symbol IDs in authored/view order. The resume source loads behavior symbols
  in view-record order with `{ graph, element }` only and stores returned
  cleanups by host. Focused runtime tests prove multiple behavior symbols load
  and install in view-record order, clean up in reverse order on explicit host
  disposal, and are not cleaned up again by a second explicit disposal.
- The resume runtime materializes `async/view` async boundary records by
  recursively walking fake-DOM comment nodes, matching raw DOM-order comment
  indexes, and exposing the boundary-side table for later async
  demand/revalidation work.
- The resume runtime now subscribes materialized async boundary reads to their
  graph paths, demands those reads during start, and runs the resolver-owned
  boundary runner symbol on pending/fulfilled status changes in the current
  Node fake-DOM test path, where runner output is observed as DOM journal
  records.
- Runtime payload helpers parse caller-supplied JSON `async/state` and
  `async/view` script strings by exact wrapper match plus `JSON.parse`, check
  the required top-level state/view payload fields and shared protocol version,
  deserialize serialized state cell values into runtime graph cells, and return
  decoded view records.
- Runtime payload helpers can also read canonical `async/state` and `async/view`
  script text from a document-like `querySelector` host, then reuse the same
  script decoder and payload-driven resume path.
- Payload wrapper, JSON, structural shape, document lookup, and protocol-version
  failures now throw `RuntimePayloadError` instances. Focused runtime tests
  assert `AA_PAYLOAD_INVALID` metadata for payload-script wrapper failures and
  `AA_PROTOCOL_VERSION_MISMATCH` metadata with expected/actual versions for
  protocol mismatches. These errors do not yet include build/resolver hash
  mismatch metadata beyond the protocol version.
- The runtime exposes a payload-driven resume helper that decodes caller-supplied
  payload script strings, creates the runtime graph from serialized
  `async/state` cell values, materializes the `async/view` resume runtime, and
  starts delegated event/boundary wiring against a caller-supplied DOM-like root.
  A companion helper now reads the payload scripts from a document-like
  `querySelector` host before taking the same resume path; this does not yet
  prove startup in a real browser document.
- The current compiler protocol-state pass serializes semantic graph `state()`
  cell `initialValue` entries through the pure serializer. Those values come
  from syntax-evaluated literals, object expressions, array expressions, and
  simple unary expressions, not from executing component bodies or capturing a
  runtime graph snapshot. When the semantic evaluator cannot reduce an
  initializer or nested initializer expression, the current source passes
  `undefined` into the serializer, which encodes it as an explicit undefined
  slot.
- The pure-value `serializeGraphValue` / `deserializeGraphValue` path preserves
  identity/cycles and supports primitives, plain objects/arrays, `Date`,
  `RegExp`, `URL`, `BigInt`, `Map`, `Set`, `ArrayBuffer`, and the current
  typed-array source table; direct unsupported values report the state path.
- The main package exposes the current curated source-entry surface, including
  framework APIs, the payload-driven resume helper, the Rolldown adapter, and
  the `./vite` Vite adapter subpath. Current adapter tests cover unit-level
  `.tsrx` transform metadata, in-memory resolver/payload/generated-symbol
  /manifest virtual module resolution and loading, transform manifest objects,
  build manifest asset emission from accumulated transform manifests, direct
  Vite transform/resolveId/load/generateBundle hook forwarding, a direct
  Rolldown build, and a temporary Vite library build that write
  `async-resumable-manifest.json` while loading the generated payload, resolver,
  manifest, and current generated event-handler/DOM-binding symbol virtual
  modules and recording their emitted chunk filenames plus finalized
  generated-symbol manifest rows, including the final emitted file names in the
  resolver's exported symbol manifest for the current generated symbol chunks.
  Focused adapter
  tests also simulate an HMR-style module update by retransforming the same
  `.tsrx` file and proving stale generated DOM-binding virtual modules no longer
  resolve or load after the binding is removed, and a structural
  `handleHotUpdate` test proves generated virtual module graph nodes are
  invalidated and returned with the changed `.tsrx` module. A focused
  `configureServer` / `handleHotUpdate` test proves the adapter emits a custom
  `async-resumable:update` dev-server payload containing the changed module ID
  and generated virtual module IDs, and a custom-environment test proves
  server-originated hot updates send through the configured Vite client
  environment rather than assuming the literal `client` environment name. A
  focused Vite config test proves normal app builds default
  `build.modulePreload` to `false` while library and SSR builds keep their
  caller-supplied defaults. A focused `transformIndexHtml` / virtual
  module test proves Vite dev HTML contexts receive an inert
  `async-resumable:dev` marker tag plus a virtual dev-client module that listens
  for that Vite custom event and redispatches it as a browser `CustomEvent`;
  build/no-server contexts receive neither tag. Package-local Witness boxes now
  live under `packages/bundler/boxes`: one runs the `vite-csr` dev-server
  pipeline, edits `src/root.tsrx`, and writes a receipt whose client environment
  outcome records `hmr: 'none'` plus the `async-resumable:update` framework hot
  message; one opens a real browser page, tracks the cancelable
  `async-resumable:update` browser event, and proves no navigation/reload while
  the fixture consumes the event; and one runs a production Vite build, proving
  the emitted CSR manifest, bundle graph, async chunks, and absence of dev-HMR
  strings in production artifacts. A fourth package-local box serves that CSR
  production build through Vite preview and proves client-created DOM can load
  the generated payload/resolver/symbol pipeline for a counter click without
  console errors or failed requests. A fifth package-local box builds the
  `vite-ssr` fixture, proves the build emits both `client` and `ssr`
  environments, and asserts the built server entry contains the counter DOM plus
  `async/state` and `async/view` payload scripts. A sixth package-local box
  imports that built server entry, writes its generated HTML into the preview
  index for the box run, serves the built client chunks through Vite preview,
  and proves the browser entry resumes existing server-produced DOM for the same
  `0` to `1` click update.
  Focused base-plugin and Vite-wrapper tests prove `buildStart` clears generated
  virtual modules plus accumulated transform manifests before a new build/dev
  cycle, so stale virtual modules do not resolve/load and no stale manifest asset
  is emitted after cleanup.

## Remaining Major Work

- Continue state-lvalue coverage beyond the current focused cases, including
  additional array write forms, nested aliases, collection-method edge cases,
  delete edge cases, and remaining invalid write diagnostics.
- Implement `shared()` beyond the current framework API runtime stub/re-export surface,
  including semantic graph records for definitions and instance calls, stable
  definition IDs, request/container/page scope handling, shared-definition
  dependency and cycle diagnostics, payload serialization, runtime graph-instance
  resolution, and cross-runtime patch synchronization.
- Preserve the compiler pass-boundary split as new behavior lands; future
  compiler additions should name the touched pass ID, consumed/produced
  artifacts, owning module, and focused artifact test.
- Add generic pass execution and human-readable artifact dump tooling beyond the
  current manual `compileTsrxModule` pass calls.
- Finish template/view lowering and final emit beyond the early payload and
  resolver artifacts, including range binding target metadata, build-ready
  emitted binding chunks from the current symbol module artifact, broader
  event write module emission, behavior and async-runner module emission, and
  generated DOM operation wiring for those bindings.
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
  planned symbol IDs and fixture-supplied symbol tables, including broader event
  handler writes, behavior, and async-runner source-to-module extraction plus
  resolver manifests derived from real build output.
- Broaden payload/protocol coverage beyond the current simple DOM-order locator
  and data-script wrappers, including branch/list/fragment locator streams,
  compact production encoding, and resolver tables derived from real build
  chunks.
- Broaden sync event policy coverage beyond the current graph-state/event-field
  and selected constant guard cases, including IR/runtime support for prop
  guards, imported constants, serializable constant forms outside the current
  literal/unary/logical/binary/conditional subset, more unsupported-policy
  diagnostics, and real browser default-action timing.
- Broaden event-handler array runtime behavior beyond current Node fake-DOM
  ordered/rejected-handler coverage, including normal error-boundary routing,
  app-level error hooks, thrown `loadSymbol` failures, handler-array sync policy
  behavior, and real browser default-action/flush timing.
- Broaden `onVisible` visibility-event behavior beyond current Node fake-DOM
  observer and structural global `IntersectionObserver` coverage, including
  current-value read semantics, generated-build integration, real browser
  observer timing, and cleanup on real host removal.
- Broaden diagnostics beyond current package object shapes, including docs pages
  for every stable code, human code frames, editor/dev-server overlays, runtime
  error-hook routing, version/hash mismatch metadata, and coverage for required
  diagnostics that are not yet implemented.
- Broaden element handle and behavior coverage beyond current compiler/payload
  artifacts and Node fake-DOM handle lookup, including initial-render
  `undefined` semantics, browser locator mismatch/removal behavior, behavior
  input serialization and change reruns, and real DOM removal cleanup.
- Continue async boundary work beyond the current resume-runtime demand slice,
  including initial-render awaiting, pending/fulfilled/rejected branch DOM
  replacement between anchors, branch cleanup, rejected/error rendering policy,
  emitted async runner modules, and build-manifest integration that connects
  generated runner symbols to real chunks.
- Build the initial-render runtime entry, connect it to the existing compiler
  payload-script/render-shell artifacts, and broaden the browser resume entry
  into component/browser and end-to-end coverage around the unified
  runtime/protocol model.
- Broaden fixture-backed build behavior beyond the current direct Rolldown,
  Vite library build, Vite CSR build, and package-local Witness dev/browser
  HMR/build/preview receipts, SSR built-server-entry build and browser
  resume-click receipts, and in-memory hook tests, including production SSR
  server-environment serving beyond the preview-index harness, behavior
  and async-runner symbol chunk generation/finalized manifest rows, broader
  non-binding symbol support beyond simple event-handler update chunks, resolver
  source/manifest derivation from emitted chunk filenames beyond the current
  generated build fixture paths, and real DOM hot replacement beyond the
  fixture-level custom-event consumer.
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
ledger update, that is 40 package test files. Treat those results as
package/unit-integration evidence. They do not prove browser-mode component
tests, real browser resume, broad witness HMR/build-pipeline behavior beyond
the package-local CSR dev/browser HMR, production-build, preview client-click,
SSR built-server-entry build, and SSR built-server-entry browser resume-click
receipts, or end-to-end
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

- `pnpm exec vp test packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts`
- `pnpm exec vp test packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts packages/bundler/test/witness.test.ts`
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
- `pnpm exec vp test packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/symbol-resolver-emit.test.ts packages/compiler/test/compile-module.test.ts packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts`
- `pnpm exec vp test packages/compiler/test/protocol-view.test.ts packages/compiler/test/symbol-resolver.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/runtime/test/behaviors.test.ts packages/runtime/test/payload-scripts.test.ts`
- `pnpm exec vp test packages/serializer/test/payload-scripts.test.ts packages/runtime/test/payload-scripts.test.ts packages/test-utils/test/payload-helpers.test.ts packages/compiler/test/compile-module.test.ts`
- `pnpm exec vp test packages/compiler/test/semantic-diagnostics.test.ts packages/compiler/test/semantic-diagnostic-constructors.test.ts packages/compiler/test/state-lowering.test.ts packages/compiler/test/state-lowering-delete.test.ts packages/compiler/test/capture-analysis.test.ts packages/compiler/test/symbol-resolver-emit.test.ts packages/serializer/test/serializer.test.ts`
- `pnpm exec vp test packages/runtime/test/resume.test.ts packages/runtime/test/payload-scripts.test.ts packages/runtime/test/behaviors.test.ts packages/runtime/test/bindings.test.ts`
- `pnpm exec vp test packages/runtime/test/runtime-graph.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/compile-module.test.ts packages/compiler/test/pass-pipeline.test.ts packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts`
- `pnpm exec vp test packages/compiler/test/symbol-resolver-emit.test.ts packages/compiler/test/semantic-diagnostic-constructors.test.ts`
- `pnpm exec vp test packages/compiler/test/payload-arena.test.ts packages/compiler/test/protocol-view.test.ts packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/compile-module.test.ts packages/runtime/test/bindings.test.ts packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/compiler/test/compile-module.test.ts packages/serializer/test/payload-scripts.test.ts packages/serializer/test/serializer.test.ts`
- `pnpm exec vp test packages/runtime/test/runtime-graph.test.ts`
- `pnpm exec vp test packages/compiler/test/sync-policy.test.ts`
- `pnpm exec vp test packages/protocol/test/*.test.ts`
- `pnpm exec vp test packages/runtime/test/resume.test.ts`
- `pnpm exec vp test packages/runtime/test/*.test.ts`
- `pnpm exec vp test`
- `pnpm exec vp test packages/runtime/test/resume.test.ts packages/runtime/test/payload-scripts.test.ts packages/runtime/test/behaviors.test.ts packages/runtime/test/bindings.test.ts`
- `pnpm exec vp test packages/serializer/test/serializer.test.ts`
- `pnpm exec vp test packages/resumable/test/public-surface.test.ts packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts`
- `pnpm exec vp test packages/core/test/framework-api.test.ts packages/protocol/test/protocol.test.ts packages/test-utils/test/payload-helpers.test.ts`
- `pnpm exec vp test packages/bundler/test/vite.test.ts`
- `pnpm exec vp test packages/bundler/test/rolldown.test.ts packages/bundler/test/vite.test.ts packages/resumable/test/public-surface.test.ts`
- `pnpm exec vp test packages/compiler/test/symbol-resolver.test.ts packages/compiler/test/symbol-modules.test.ts packages/compiler/test/compile-module.test.ts packages/bundler/test/*.test.ts packages/resumable/test/public-surface.test.ts`
- `(from packages/bundler) pnpm exec witness "csr build: manifest and bundle graph describe tsrx symbols" --json`
- `(from packages/bundler) pnpm exec witness "csr preview: built app loads through vite preview" --json`
- `(from packages/bundler) pnpm exec witness "ssr build: Rolldown server entry renders payload shell" --json`
- `(from packages/bundler) pnpm exec witness "ssr preview: built server entry shell resumes counter click" --json`
- `(from packages/bundler) pnpm exec witness "vite-plus preview: built app loads async-resumable output" --json`
- `(from packages/bundler) pnpm exec witness --json` (latest receipt:
  `packages/bundler/.witness/receipts/2026-06-16T00-37-49.165Z/receipt.json`)
- `pnpm exec vp test packages/bundler/test/*.test.ts packages/resumable/test/public-surface.test.ts`

Current spec/ledger-maintenance receipts:

These checks were rerun or directly refreshed while updating the design index and
progress ledger. They cover documentation whitespace/formatting, package
formatting/lint coverage through `vp check`, inventory facts, and guardrail
scans. They do not refresh implementation test or pack receipts unless those
commands are listed in the implementation/build section above.

- `git diff --check`
- `pnpm exec vp fmt --check .gitignore packages/compiler/src/artifacts.ts packages/compiler/src/passes/symbol-resolver.ts packages/compiler/src/compile-module.ts packages/compiler/src/passes/symbol-modules.ts packages/compiler/test/symbol-modules.test.ts packages/compiler/test/symbol-resolver.test.ts packages/bundler/test/rolldown.test.ts packages/bundler/boxes/csr-build.box.ts specs/state.md`
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
- diagnostic inventory audit confirmed 23 implemented `AA_*` codes across
  semantic graph, state lowering, capture analysis, serializer unsupported-value,
  generated unknown-symbol resolver paths, and runtime payload decode/version
  paths, resume locator paths, direct framework API runtime-call paths, and compiler
  pass-graph validation paths, and aligned the diagnostics spec phase list with
  the implemented `semantic-graph` phase.
- diagnostic-scope audit confirmed current diagnostics coverage includes
  package/artifact-level object shapes for compiler passes, serializer
  unsupported-value failures, generated unknown-symbol resume errors, runtime
  payload/resume errors, framework API runtime errors, and compiler
  pass-graph validation errors.
- diagnostic-docs audit confirmed current package source and tests use hard-coded
  `https://async.await.dev/errors/...` URL shapes, while the repo currently has
  no docs, site, route, or error-page artifact for those URLs. Current evidence
  proves URL shape only, not published documentation.
- semantic-collector audit confirmed current semantic graph coverage is
  concentrated in eight focused `semantic-*.test.ts` files plus pass-boundary
  tests for module split and pass graph validation.
- async-boundary audit confirmed current coverage is focused on compiler
  diagnostics for post-`await` reads and missing async boundaries, payload/view
  runner symbol wiring, runtime async request versioning/stale suppression, and
  Node fake-DOM boundary runner dispatch for pending/fulfilled status changes.
- runtime-async-status audit confirmed the graph source has pending, fulfilled,
  and rejected async snapshot paths and applies version/abort guards before
  fulfilled and rejected commits. Focused runtime tests now assert
  pending/fulfilled snapshots, stale fulfilled/rejected completion suppression,
  and a committed rejected snapshot after a pending demand has flushed.
- runtime-async-demand audit confirmed initial async-computed demand sets the
  node to pending, marks the async binding dirty, and schedules the same
  microtask flush path used by graph writes. Focused runtime tests now cover
  standalone demanded async computed auto-flush and same-key invalidation skips.
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
  composition, serializable literal constant truthiness, static property reads on
  serializable const object literals, static array-index reads on serializable
  const array literals, selected computed serializable const expressions,
  module-scope serializable const declarations, one unextractable-policy
  diagnostic shape, handler-array policy branches, and Node fake-DOM runtime
  evaluation before lazy symbol dispatch.
- sync-policy prop/constant audit confirmed current compiler, protocol, and
  runtime condition IR supports graph truthiness, event-field equality, and
  serializable constant truthiness for component-local and module-scope literal
  const declarations, static property/index reads on const object/array literals,
  and selected pure computed const expressions. Focused compiler/runtime coverage proves
  `const allowEscape = true`, `const shortcut = { allowEscape: true }`,
  `const shortcut = [2 > 1]`, and `const allowEscape = (2 > 1) && !false`
  guards flowing through semantic graph, payload/protocol view records, and
  resume sync-policy execution, plus a module-scope `const allowEscape = true`
  guard flowing through the compiler artifact/payload path. It does not cover
  prop reads, imported constants, or computed constant forms outside the current
  literal/unary/logical/binary/conditional subset in synchronous policy guards.
- onVisible audit confirmed event collection uses the generic `on*` attribute
  path from `@tsrx/core`, producing a `visible` event name for runtime records.
  The resume runtime now keeps `visible` records out of delegated DOM event
  listeners and wires them through one injected observer hook per resumed root in
  the Node fake-DOM test path, with fallback to a structural
  `globalThis.IntersectionObserver` when no observer factory is injected. Focused
  runtime coverage proves one-shot visibility triggering, lazy symbol loading in
  authored order, ignored non-intersecting entries, unobserve after first
  intersection, returned cleanup storage, reverse cleanup on explicit host
  disposal, unobserve on explicit host disposal before first intersection, and
  ignored post-disposal observer entries. It does not prove current-value read
  isolation, generated-build integration, cleanup after real DOM removal, or real
  browser observer timing.
- event-handler-array audit confirmed protocol/compiler tests preserve ordered
  handler sources and event `symbolIds` for handler arrays, and the resume source
  iterates those IDs sequentially. Runtime fake-DOM coverage now proves multiple
  handlers on one event, stop at the first rejected handler, skipped later
  handlers, committed-write preservation for earlier handlers, ignored ordinary
  return values, and dispatch `try`/`finally` flush before rethrowing. It still
  does not cover normal error-boundary routing, app-level error hooks,
  `loadSymbol` rejection before handler execution, or browser default-action
  timing.
- element-handle runtime audit confirmed compiler/payload/protocol tests carry
  `elementHandles` records with `hostNodeId`, `handleId`, and local `name`, and
  runtime payload-resume tests expose `getElement(hostNodeId)` for host-node
  lookup. Runtime symbol context now exposes `getElementHandle(...)` for lazy
  symbols; focused Node fake-DOM coverage proves lookup by stable handle ID,
  lookup by local authored name, `undefined` for unmatched handle locators, and
  `undefined` for handle ID/name lookups after explicit host disposal. Focused
  resume-runtime coverage also proves explicit host disposal invalidates
  `getElement(hostNodeId)` and prevents that disposed host's delegated event
  record from dispatching. It does not prove initial-render absence, handles
  after real DOM removal, or browser document locator behavior.
- behavior-lifecycle audit confirmed compiler/protocol tests preserve two
  behavior source records and symbol IDs in authored/view order, and the resume
  source installs behavior records in view order with `{ graph, element }` only
  and reverses recorded cleanup callbacks on `disposeHost`. Current focused
  runtime coverage proves two behavior symbols load/install in order, cleanup in
  reverse order, and do not cleanup twice after repeated explicit host disposal.
  No package source emits serialized behavior input records, materializes
  behavior inputs, or wires input-change reruns.
- element/behavior audit confirmed current coverage is focused on compiler
  diagnostics and payload records for `el` / `use`, behavior symbol planning, and
  Node fake-DOM runtime behavior install/cleanup paths.
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
- payload-script audit confirmed `renderPayloadScripts` serializes the current
  protocol state/view objects with `JSON.stringify`, escapes `<` inside the JSON,
  and wraps the results in canonical `async/state` / `async/view` script tags.
  It does not implement compact typed tables, compression, streaming, or private
  production arena encoding.
- payload-script wrapper audit confirmed serializer tests assert both opening
  and closing `async/state` / `async/view` tags, and the runtime parser requires
  the exact prefix and suffix before `JSON.parse`. The separate test-utils
  helper now also requires the exact prefix/suffix, parses canonical payload
  script JSON, can summarize decoded payload scripts for fixture assertions, and
  can project those scripts into a human-readable debug dump of state/view IDs,
  names, counts, symbols, and locator indexes.
- runtime-payload audit confirmed `decodePayloadScripts` validates the canonical
  script wrapper and shared protocol version after `JSON.parse`, while
  `createRuntimeGraphFromStatePayload` deserializes protocol state cell values
  into runtime graph cells only. Current runtime tests prove top-level
  structural validation for required state/view fields such as `cells` and
  `events`, plus nested validation for state cells and the current view record
  arrays: locators, events, bindings, behaviors, element handles, and async
  boundary records. Nested sync-policy validation now covers branch arrays,
  supported sync actions, and current condition variants. Payload decode,
  document lookup, structural validation, and protocol-version failures now use
  structured `RuntimePayloadError` metadata, including stable code, docs URL,
  payload type, script selector, suggestions, and expected/actual versions for
  protocol mismatches.
- diagnostic-surface audit confirmed current structured diagnostic coverage is
  concentrated in compiler pass artifacts, serializer result diagnostics, and
  generated resolver unknown-symbol metadata; protocol-state serialization
  failures, runtime payload decode/version failures, and resume locator
  materialization failures now have structured error surfaces, and core
  framework API runtime failures plus compiler pass-graph validation
  failures now expose structured metadata.
- runtime payload-resume audit confirmed `resumeFromPayloadScripts` composes
  payload decoding, runtime graph creation, `async/view` materialization, and
  delegated event/boundary startup for caller-supplied payload strings and a
  DOM-like root. `decodePayloadScriptsFromDocument` and
  `resumeFromPayloadDocument` add structural document-like `querySelector`
  coverage for locating canonical `async/state` / `async/view` script contents.
  They do not prove real DOM/browser startup behavior.
- locator-materialization audit confirmed current runtime source uses recursive
  `childNodes` walks over fake element/comment nodes, filters element locators by
  case-insensitive tag name, and reports structured `AA_RESUME_LOCATOR_MISSING`
  / `AA_RESUME_LOCATOR_MISMATCH` errors for missing DOM-order element locators,
  tag-mismatched element locators, and missing async boundary comment anchors.
  It does not use a browser-native `TreeWalker`, skip static runs,
  ignored/nested-region metadata, or branch/list anchor streams.
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
  duplicate pass IDs, missing artifacts, duplicate artifact producers, and
  dependency cycles with structured `CompilerPassGraphError` metadata, while
  successful validation still returns runnable ordering and artifact keys.
- non-compiler evidence-anchor audit aligned runtime, serializer, public-surface,
  and adapter pointers with current concrete entry files instead of broad source
  globs.
- test inventory scan confirmed 40 package test files currently match the root
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
- final-emission audit confirmed current compiler/adapter output stops at
  artifact orchestration, payload script rendering, generated resolver strings,
  and Rolldown virtual module metadata. `transformTsrxModule` emits an
  `__async_resumable_module` export plus resolver, payload, current
  event-handler-symbol, DOM-binding-symbol, and manifest virtual module IDs; it
  now statically imports the generated resolver/payload/manifest virtual modules
  so a Vite library build loads them, and the generated resolver can pull the
  current generated symbol virtual modules into build output. The build manifest
  hook now maps generated virtual module IDs to output file names when bundler
  metadata exposes them. It derives resolver entries for those generated virtual
  modules and patches the emitted resolver symbol manifest's current generated
  `chunk` rows to final emitted file names, but it does not emit executable
  component code, lowered state access code beyond simple event-handler update
  modules, behavior/async modules, broad non-binding resolver source/manifest
  rows derived from final chunk filenames, or initial-render/browser resume
  entry code.
- template-binding audit confirmed current semantic/payload/protocol records for
  template reads now carry graph-path subscriptions, text or plain-attribute
  target metadata, common DOM property target metadata for `value`, `checked`,
  and `selected`, class/style target metadata, and optional binding symbol IDs.
  No package source yet classifies template reads as range binding metadata, and
  no current compiler artifact emits the generated DOM mutation code needed by
  final emit.
- bundler-adapter source/test audit confirmed current Rolldown coverage is a
  unit-level plugin shell whose `transform` compiles `.tsrx` modules with
  caller-supplied symbol tables, stores resolver, payload, generated-symbol,
  and manifest virtual module strings in an in-memory map, resolves and loads
  those produced virtual module IDs, derives resolver rows for those generated
  virtual modules, skips re-transforming generated virtual module IDs, imports
  generated payload/resolver/manifest modules from the transformed entry, returns
  a transform manifest object, and emits accumulated transform manifests plus any
  bundle-exposed generated virtual-module output filenames as
  `async-resumable-manifest.json` through `generateBundle`; for current
  generated event-handler and DOM-binding symbols, it also records finalized
  symbol rows when the symbol's virtual module has an emitted file name, while
  the emitted public module manifests omit the internal pre-build symbol rows.
  Repeated transforms for the same `.tsrx` module drop the previous transform's
  virtual module IDs from the in-memory resolver before registering the new
  artifacts, preventing stale generated symbol virtual modules from surviving an
  HMR-style source update that removes a binding. The current Vite adapter wraps that shell and
  forwards `transform`, `resolveId`, `load`, and `generateBundle`; its
  structural `configureServer` / `handleHotUpdate` hooks capture a Vite dev
  server, invalidate any known generated virtual module graph nodes for the
  changed `.tsrx` file, return those nodes with the changed source module, and
  emit a custom `async-resumable:update` payload listing the changed module ID
  and generated virtual module IDs. Its `transformIndexHtml` hook injects an
  inert `async-resumable:dev` marker tag plus a requestable virtual dev-client
  module only for Vite dev HTML contexts; that virtual client listens for the
  custom Vite event and redispatches it as a cancelable browser `CustomEvent`.
  A focused executable virtual-client test proves the dispatcher invalidates the
  Vite HMR module only when no consumer calls `preventDefault()`. A temporary
  Vite dev-server fixture proves `transformIndexHtml` injects that marker and
  client URL, `transformRequest('/@async-resumable/dev-client')` serves the
  virtual client, and `transformRequest('/App.tsrx')` loads and transforms a
  `.tsrx` source file through Vite. One direct Rolldown build fixture and one
  temporary Vite library build fixture now prove real builds write the manifest
  asset, include generated
  payload/resolver/current event-handler and DOM-binding symbol code, record emitted file names
  plus finalized symbol rows for those generated virtual modules, patch the
  emitted resolver symbol manifest to use those generated symbols' final file
  names, and keep internal pre-build symbol rows out of emitted module
  manifests. `buildStart` clears generated virtual modules plus accumulated
  transform manifests before a new build/dev cycle, preventing stale virtual
  module resolution/loading and stale manifest asset emission in focused tests.
  Package-local Witness boxes now prove Vite dev HMR payload delivery, real
  browser receipt of the cancelable `async-resumable:update` event without
  navigation, and a CSR production build with manifest/bundle-graph artifacts
  plus no dev-HMR string leakage. The same CSR production build is now served
  through Vite preview and proves client-created DOM can load the generated
  payload/resolver/symbol pipeline for a counter click with no console errors or
  failed requests. A Vite SSR fixture now builds a server entry that contains
  counter DOM plus payload scripts, and a package-local SSR browser box imports
  that built entry, serves its generated HTML through Vite preview with the
  built client chunks, and proves the browser entry resumes that existing DOM
  through the generated resolver for a `0` to `1` click update. No fixture
  proves real DOM hot replacement beyond the fixture-level custom-event
  consumer, production SSR server-environment serving beyond the preview-index
  harness, behavior/async-runner chunks,
  broader event-handler write chunks beyond simple updates, or runtime resolver
  source/manifest rewriting from final chunk filenames beyond the current
  generated build fixture paths.
- public-surface source/test audit confirmed `packages/resumable` currently
  re-exports framework APIs, `resumeFromPayloadScripts`, the Rolldown adapter,
  and its `./vite` adapter subpath through private source-entry package
  manifests; current tests import those source entries directly rather than
  proving installed package export resolution.
- core/protocol/test-utils audit confirmed support-package coverage is limited to
  structured runtime failure metadata for compiler-rewritten framework APIs, protocol
  version/type fixtures, canonical payload script wrapper assertions, JSON
  script decoding, selected protocol record-count summaries for cells, computed
  entries, locators, events, bindings, behaviors, element handles, and async
  boundaries, plus a decoded human-readable payload debug dump for fixture
  assertions.
  It still does not prove public API stability for internal packages, protocol
  migration/version negotiation, browser helpers, or witness integration
  helpers.
- shared-state audit confirmed current `shared()` support is limited to the
  `@async/resumable-core` framework API stub, the main package re-export,
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
  `id`/`chunk`/`exportName` tables for resolver emission. The `symbol-modules`
  pass emits source strings for planned DOM binding modules and simple
  event-handler `++`/`--` graph-update modules, and the Rolldown and Vite
  adapters expose those modules as in-memory virtual modules. The Rolldown
  transform derives resolver rows for those generated virtual modules. No
  package source extracts planned behavior or async-runner symbols into emitted
  modules, event-handler module extraction is still limited to simple update
  writes, and no build adapter derives resolver tables from real chunk output
  beyond the current generated symbol virtual-module path.
- runtime-graph journal audit confirmed current graph source accepts the full
  `DomJournalRecord` union, records subscription-produced DOM journal entries,
  and exposes them through `takeJournal`. The resume runtime can also deliver
  journal records from runtime-owned graph flushes and later scheduled graph
  flushes to an optional host DOM journal adapter without draining journals when
  no adapter is configured. Executable coverage currently exercises `setText`
  records, one multi-record subscription that appends ordered `setText`,
  `setAttr`, and `setProp` records from a single binding run, one `setAttr`
  resume path, adapter delivery for a dispatch-owned `setAttr` flush, and
  adapter delivery for a scheduled binding `setText` flush. A structural DOM
  journal applier now covers ordered application of `setText`, `setAttr`, and
  `setProp` to caller-resolved DOM-like targets, including nullish/false
  attribute removal, plus `runCleanup` callbacks in journal order. The runtime
  helper for protocol binding targets now maps text, attribute, property, class,
  and style targets to `setText`, `setAttr`, or `setProp` records. Focused
  binding-resume coverage proves lazy binding symbols receive the current graph
  value and protocol binding target metadata and can return concrete journal
  records through the runtime journal adapter. Current coverage also routes
  `insertRange`, `removeRange`, and `moveRange` records through host callbacks
  in journal order. It still has no browser DOM, compiler-emitted binding module
  integration, or browser-ordering coverage.
- runtime-scheduler audit confirmed current graph source schedules microtask
  flushes through `queueMicrotask` with a `Promise.resolve().then(...)`
  fallback for ordinary writes, updates, mutated collection calls, object
  deletes, initial async-computed demand, and settled async computed completions.
  Focused automatic-flush coverage currently proves an idle-turn write batch and
  standalone async-computed demand; most collection, delete, computed, async
  invalidation, and resume tests still force `graph.flush()` directly.
- runtime sync-computed audit confirmed current runtime graph source lazily
  recomputes dirty sync computed nodes on read and marks dependent computed and
  async-computed nodes dirty when a computed node changes; focused tests
  directly exercise one state-path dependency, one computed-on-computed chain,
  and subscriber journal updates, but not generated binding integration.
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
  current typed-array family, while focused tests directly exercise `Uint8Array`,
  `Int16Array`, and `Uint16Array`.
- protocol-state input audit confirmed the compiler protocol-state pass reads
  each payload arena state cell's matching semantic graph binding and passes the
  binding's syntax-evaluated `initialValue` into
  `createProtocolStatePayload`. The serializer wrapper now converts
  `AA_SERIALIZE_UNSUPPORTED_VALUE` results into `ProtocolStateSerializationError`
  objects that preserve the serializer diagnostic fields plus `bindingId` and
  `cellName`, so protocol-state construction failures keep structured diagnostic
  metadata.
- dynamic-initializer payload audit confirmed `initialValueKind` classifies only
  object expressions, array expressions, and literals, while
  `evaluateInitialStateValue` reduces literals, object/array expressions, and
  simple unary expressions. Other initializer forms currently become
  `undefined` before protocol-state serialization; no focused test exercises a
  dynamic initializer flowing into `async/state`.
- typed-array table audit confirmed the serializer source recognizes
  `Int8Array`, `Uint8Array`, `Uint8ClampedArray`, `Int16Array`, `Uint16Array`,
  `Int32Array`, `Uint32Array`, `Float32Array`, `Float64Array`, and guarded
  `BigInt64Array` / `BigUint64Array` branches. The current source does not have
  a `DataView` branch, and focused tests cover representative typed-array
  round-trips rather than every listed class.
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
- The current payload-driven resume helper can take explicit payload script
  strings or locate `async/state` / `async/view` scripts through a structural
  document-like `querySelector` host. It is not yet a browser bootstrap that
  proves startup in a real browser document.
- Current payload/symbol tests prove simple DOM-order element locators against
  recursive fake-DOM walks, raw comment-index async anchors, protocol state
  cell/computed metadata planning, protocol view wiring, source-bearing planned
  symbol records, symbol ID wiring, resolver module string emission from supplied
  chunk/export tables, fail-closed unknown-symbol metadata, canonical JSON
  data-script wrappers, and Node fake-DOM payload decoding/resume helpers. They
  do not prove async snapshot records, shared snapshot records, protocol schema
  validation beyond exact script-wrapper, version checks, and optional text /
  plain-attribute / common-property / class / style binding target shape checks,
  protocol computed entries becoming runtime computed/async nodes, range binding
  target metadata, compact production payload encoding, browser `TreeWalker`
  materialization, skip runs for static nodes, ignored/nested
  regions, branch/list/fragment locator materialization, symbol source
  extraction into emitted chunks, resolver tables generated by a real build
  manifest, generated symbol exports, browser-loaded dynamic imports, or a real
  initial-render payload. Current chunk/export tables are fixture inputs, not
  build-derived evidence.
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
  runtime execution before lazy symbol dispatch against fake DOM events. They
  also prove handler arrays preserve multiple sync-policy branches and the resume
  runtime evaluates those branches independently before lazy symbol loading. They
  do not prove prop policy reads, imported constants, computed constant forms
  outside the current literal/unary/logical/binary/conditional subset, all
  unsupported guard diagnostics, real browser default-action timing,
  navigation/form cancellation timing, or generated-build integration.
- Current event-runtime coverage proves delegated DOM events and host-agnostic
  `onVisible` observer dispatch against Node DOM-like test doubles. It proves
  `visible` records are not registered as delegated DOM listeners, one injected
  observer hook observes visible hosts, a structural global
  `IntersectionObserver` fallback observes visible hosts when no factory is
  injected, visibility-triggered lazy symbols run once in authored order,
  pending visible hosts are unobserved on explicit host disposal, post-disposal
  observer entries are ignored, returned cleanups are stored, and explicit host
  disposal runs those cleanups in reverse order. It does not prove current-value
  read isolation, cleanup on real DOM removal, real browser observer timing, or
  generated-build integration.
- Current event-handler array coverage proves ordered handler source extraction,
  ordered `symbolIds` in compiler/protocol artifacts, and Node fake-DOM runtime
  behavior for multiple handlers on one event: sequential loading/execution,
  stop at the first rejected handler, skipped later handlers, preservation of
  earlier committed writes, ignored ordinary-event return values, and
  success-or-error dispatch flush timing. Sync-policy branch coverage also proves
  handler-array cancellation/propagation policies are not collapsed to the first
  handler. It does not prove normal error-boundary routing, app-level error
  hooks, thrown/rejected `loadSymbol` behavior before a handler runs, real
  browser default-action timing, or browser DOM application after the flush.
- Current element/behavior tests prove invalid and duplicate `el` diagnostics,
  `use`-on-component diagnostics, element handle payload/protocol records,
  multiple behavior source records and symbol IDs in authored/view order,
  host-node lookup through `getElement(hostNodeId)`, lazy-symbol `element()`
  handle lookup by handle ID/name, `undefined` for unmatched handle locators, and
  `undefined` for handle ID/name lookups after explicit host disposal. They also
  prove explicit host disposal invalidates host-node lookup and delegated event
  records, plus fake-DOM behavior install/cleanup ordering for multiple
  behaviors: load/install in view-record order, cleanup in reverse order, and no
  duplicate cleanup on repeated explicit host disposal. They do not prove
  initial-render absence, handles after real DOM removal, behavior input
  serialization, materialized behavior inputs in symbol context, behavior reruns
  on input changes, real DOM removal cleanup, or browser-loaded behavior chunks.
- Current async computed/boundary tests prove selected compiler diagnostics,
  async-capable propagation, payload runner IDs, runtime request versioning,
  abort signals, stale fulfilled and rejected completion suppression, same-key
  async invalidation skips, committed rejected async snapshots, standalone
  initial async-demand auto-flush, and fake-DOM boundary runner dispatch for
  pending/fulfilled status through journal records. They do not prove
  initial-render awaiting, serialized async snapshots that prevent browser
  refetch, rejected-status runner dispatch, rejected branch rendering,
  pending/fulfilled/error DOM range replacement between anchors, branch cleanup,
  real browser timing, or build-generated async runner chunks.
- Current resume-runtime tests prove delegated event, sync policy, behavior,
  binding, async-boundary, and payload-resume behavior against DOM-like test
  doubles in the Node test project. They do not prove real browser DOM behavior,
  component/browser execution, layout/locator behavior in an actual document, or
  no-component-execution-on-resume in a browser.
- Current runtime graph tests prove in-memory graph invalidation, scheduling,
  one direct sync-computed lazy recompute path, async request versioning,
  abort-signal wiring, stale fulfilled/rejected completion suppression, same-key
  async invalidation skip behavior, selected collection calls and no-op
  invalidation behavior, static deletes, and
  subscriber-produced `setText` journal collection. Automatic microtask flush
  coverage proves an idle-turn write batch and standalone initial async-computed
  demand; collection-call, delete, computed, and resume paths mostly rely on
  explicit `graph.flush()` calls in focused tests. Focused runtime tests prove
  computed-on-computed dependency chains re-run subscribers after source state
  changes. The runtime and
  expression-collector source allow-lists also include `copyWithin`, `fill`,
  `reverse`, `sort`, and `splice`, but focused tests do not directly exercise
  those methods. Current resume-runtime tests add one `setAttr` journal path,
  host-adapter delivery for a dispatch-owned `setAttr` flush, and host-adapter
  delivery for a scheduled binding `setText` flush. Runtime graph coverage now
  proves one subscription can return an ordered multi-record batch containing
  `setText`, `setAttr`, and `setProp`, and the runtime DOM journal applier
  proves those record types mutate caller-resolved DOM-like targets in order.
  Runtime DOM journal coverage also proves protocol binding targets map to the
  expected concrete journal records, and runtime binding-resume coverage proves
  lazy binding symbols receive the current value plus binding target metadata
  before returning a concrete journal record. It also proves `runCleanup`
  callbacks run in journal order. It does not prove
  `insertRange`, `removeRange`, or `moveRange` records against real browser DOM;
  that compiler-emitted binding modules apply the DOM journal to real browser
  nodes; generated binding-symbol integration for computed dependencies; or that
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
- Current `shared()` coverage proves only that the framework API stub throws
  when executed directly and that the main package re-exports the function. It
  does not prove the final authored `shared()` call shape, shared definition
  parsing, stable shared definition IDs, graph-context resolution,
  request/container/page scoped instances, shared dependency/cycle diagnostics,
  payload records, browser resume of shared instances, cross-runtime patch
  events, or design-system widget graph instance identity.
- Current serializer tests prove selected pure built-in value round-trips,
  identity/cycles, typed-array backing-buffer identity and offsets for
  `Uint8Array`, `Int16Array`, and `Uint16Array`, pathful unsupported-function
  diagnostics from `serializeGraphValue`, structured diagnostic propagation
  through protocol-state wrapping, successful protocol-state wrapping, and
  canonical payload script tags. Compiler coverage proves literal and object
  `state()` initial values reaching `async/state` through `compileTsrxModule`.
  They do not prove dynamic or opaque `state()` initializer values, exhaustive
  typed-array class coverage, `DataView` handling, app-owned or third-party value
  class restoration, framework graph reference serialization, shared or async
  snapshot integration, initial-render payload construction, runtime graph snapshots after
  component-body execution, secret-leak/resource diagnostics, compact production
  wire encoding, or integration with a real initial-render payload.
- Current core/protocol/test-utils tests prove the framework API runtime failure
  path and `AA_FRAMEWORK_API_RUNTIME_CALL` metadata, protocol version sharing
  across empty state/view payloads, canonical payload script wrapper checks
  including the closing tag, payload script JSON decoding, and selected
  protocol record counting for cells, computed entries, locators, events,
  bindings, behaviors, element handles, and async boundaries. They also prove a
  decoded human-readable payload debug dump with state/view IDs, names, symbol
  IDs, sync-policy presence, binding targets, and locator indexes.
  They do not prove public API stability for internal packages, protocol
  migration/version negotiation, browser helpers, or witness integration
  helpers.
- Current diagnostics coverage proves selected compiler/serializer/resolver
  diagnostic object shapes, stable codes, hard-coded docs URL shape, and the
  implemented `semantic-graph` / `sync-policy` / `state-lowering` /
  `capture-analysis` / `serialization` / `resume` phase names in package tests.
  It does not prove one unified diagnostic object for all thrown errors,
  end-user CLI output, editor integration, dev-server overlays,
  source-map/source range rendering, repo-owned or published error
  documentation, browser/runtime error routing, build-pipeline diagnostic
  propagation, runtime protocol/hash mismatch diagnostics, async result
  serialization diagnostics, or every required compile-time diagnostic in
  `specs/framework/07-diagnostics.md`.
- Current capture-analysis tests prove selected unsupported local binding
  categories against planned symbol source strings. They do not prove a complete
  lexical closure graph, exhaustive serializable built-in allow-list coverage,
  module import re-emission, type/value flow analysis, final emitted chunk
  capture validation, or runtime serializer integration.
- Current compiler pass-boundary tests prove the pass ID list, selected
  `consumes` / `produces` boundaries, runnable order derivation, missing-artifact
  failures, duplicate-producer failures, dependency-cycle failures, source layout
  ownership, duplicate pass-ID validation, structured pass-graph failure
  metadata, the returned `compileTsrxModule` pass graph, and the first
  `symbolModules` event-handler and DOM binding source artifacts. They do not prove a generic pass
  executor, artifact dump tooling, disabled/reordered pass execution, full
  artifact-focused coverage for every pass output, or build-ready emitted
  JavaScript snapshots for component code, broad state rewriting,
  behavior/async symbol modules, and render/resume entry wiring.
- Current Rolldown/Vite adapter and public-surface tests exercise curated source
  re-exports, unit-level `.tsrx` transforms with fixture-supplied symbol tables,
  in-memory resolver/payload/generated-symbol/manifest virtual module
  resolution and loads, transform manifest objects, resolver rows derived from
  current event-handler and DOM-binding symbol virtual modules, direct Vite wrapper hook
  forwarding for transform, resolveId, load, and generateBundle, and one
  direct Rolldown build fixture and one fixture-backed Vite library build that
  write the build manifest asset while loading generated
  payload/resolver/current event-handler and DOM-binding symbol virtual modules and recording
  their emitted chunk filenames plus finalized generated-symbol rows without
  leaking internal pre-build symbol rows in the public module manifests. Those
  fixtures also prove the emitted resolver's exported symbol manifest uses the
  final emitted file names for the current generated symbol chunks
  instead of the generated virtual module ID. Focused repeated-transform tests
  prove stale generated symbol virtual modules stop resolving/loading after
  a `.tsrx` update removes the binding that produced them, and structural
  `handleHotUpdate` tests prove generated virtual module graph nodes are
  invalidated and returned with the changed source module. A focused
  `configureServer` / `handleHotUpdate` test proves the adapter emits a custom
  `async-resumable:update` payload with the changed module ID and generated
  virtual module IDs, and a custom-environment test proves server-originated
  hot updates use the configured client environment name. A focused Vite config
  test proves normal app builds default `build.modulePreload` to `false` while
  library and SSR builds are left alone. A focused `transformIndexHtml` /
  virtual module test proves dev-only inert marker tag injection plus a virtual
  client module that listens for the custom Vite event and redispatches it as a
  browser `CustomEvent`;
  executable virtual-client coverage proves the event is cancelable and the
  client falls back to `hot.invalidate()` only when no consumer prevents default.
  A temporary Vite dev-server fixture proves real `transformIndexHtml`,
  virtual-client `transformRequest`, and `.tsrx` source `transformRequest`
  behavior through Vite. Package-local Witness boxes now run that fixture's
  dev-server pipeline, edit the `.tsrx` source, record the
  `async-resumable:update` custom payload in the client environment's edit
  outcome, prove a real browser page receives the cancelable event without
  navigating, and prove the CSR production build emits the async-resumable
  manifest/bundle graph/async chunks while forbidding dev-HMR client strings in
  emitted text artifacts. The CSR production build is also served by Vite
  preview and proves client-created DOM can load the generated
  payload/resolver/symbol pipeline for a counter click with no console errors or
  failed requests. A Vite SSR fixture now builds a server entry that contains
  counter DOM plus payload scripts, exposes a fixture-only SSR host for dev and
  preview, and a package-local SSR preview box now uses the fixture's app-build
  path plus Vite preview response instead of rewriting the preview index before
  proving the browser entry resumes that existing DOM for the same click update.
  A vite-plus fixture now has a real app entry and a package-local preview box
  that proves a vite-plus config emits the async-resumable manifest, bundle
  graph, and browser output through Vite preview.
  Focused base-plugin and Vite-wrapper tests prove `buildStart` cleanup clears
  stale generated virtual modules and accumulated transform manifests.
  They do not prove installed package export resolution, publish-ready exports,
  resolver source/manifest rows rewritten from final chunk filenames beyond the
  current generated build fixture paths, production SSR serving beyond the
  current fixture host, behavior/async-runner chunks,
  broader event-handler write chunks beyond simple updates, real DOM hot
  replacement beyond the fixture-level custom-event consumer, or full
  installed-package build receipts.
- At this ledger update, the production package implementation under
  `packages/`, this progress ledger, and the compiler split plan are tracked on
  the current `impl` branch. Status entries still describe current worktree
  files and command receipts rather than permanent PR status; rerun the relevant
  checks before treating a commit or PR diff as current evidence. The untracked
  `dist/` directory is generated pack output and should not be treated as
  source state unless a future task explicitly decides to commit generated
  artifacts.
- `pnpm-workspace.yaml` deliberately keeps `../native-tsrx` out of this
  workspace, and `packages/compiler/package.json` resolves `@tsrx/core` through
  the catalog as an external dependency boundary. Do not inspect or modify that
  sibling repository for async-await work. Parser-backed checks should continue
  to prove async-await compiler artifact behavior against published `@tsrx/core`
  shapes instead of relying on sibling workspace parser artifacts.
- Markdown-only `vp check` can report formatting success and then fail before
  lint analysis because there are no lintable files. For spec-only maintenance,
  use `vp fmt --check` plus `git diff --check`; use broader `vp check` only when
  the target set includes lintable source files.
- The production framework implementation is not feature-complete. Current tests
  and scans prove early compiler, runtime, serializer, public-surface, and
  build-adapter slices, not the full render/resume framework.
- Update this file after meaningful implementation passes so "completed" status
  remains separate from design requirements.
