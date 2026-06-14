# Compiler Pipeline

Mini-compiler architecture, artifact contracts, extraction boundaries, and capture diagnostics.

### Compiler implementation pipeline

The compiler implementation must be an explicit artifact pipeline, not one
monolithic AST visitor. Each compiler feature owns one pass or a small set of
passes that can be developed, tested, disabled, and debugged independently.

Think of the compiler as a set of cooperating mini compilers. Each mini compiler
has a narrow domain, its own intermediate representation or artifact shape, and
a clear boundary with the rest of the pipeline. The state compiler should not
need to know how the view payload is encoded; the sync event policy compiler
should not need to know final chunk filenames; the symbol resolver planner should
not need to re-walk source code to rediscover captures. They exchange typed
artifacts through the orchestrator.

Every pass has:

1. a stable pass ID and human-readable description
2. declared input artifact keys (`consumes`)
3. declared output artifact keys (`produces`)
4. a typed pass context containing only source files, compiler options,
   declared input artifacts, and diagnostic sinks
5. a separately runnable test fixture surface

The orchestrator validates the pass graph before running it. Missing inputs,
duplicate producers for the same artifact, dependency cycles, or undeclared
artifact reads are compiler bugs and fail loudly. Pass order may be derived from
`consumes`/`produces`, but observable behavior must not depend on hidden mutation
between unrelated passes.

Passes communicate through typed artifacts, not private shared state. A pass may
append diagnostics and produce declared artifacts; it must not reach into another
pass's internals, mutate another pass's output in place, or couple itself to the
final emitted JavaScript shape. When a later optimization needs more data, the
owning pass adds or versions an artifact instead of creating an ad hoc side
channel.

This is a stability rule for the compiler. Adding or changing a feature should
mean adding/changing the smallest relevant pass and artifact contract, not
rewiring the whole compiler. For example, state read/write lowering, async
dependency-key extraction, sync event policy extraction, capture analysis,
template/view lowering, payload arena planning, symbol resolver planning, and
final code generation are separate responsibilities even if an early prototype
runs some of them in one physical module.

Developer tooling must be able to dump artifacts after each pass in a
human-readable form. Tests should target both individual pass artifacts and
end-to-end emitted output, so a regression in event policy extraction does not
have to be diagnosed from a full generated bundle snapshot.

### TSRX semantic graph artifact

The first framework-owned pass after parsing produces a TSRX semantic graph. It
is not the lowered TSX output and it is not borrowed from another framework's
AST model. The artifact combines:

- TSRX structural nodes and relations: statement containers, nested `@{...}`
  scopes, `@if`, `@for`, `@switch`, `@try`, `@empty`, branch/fallback
  relations, source spans, and hierarchy
- normal JavaScript/TypeScript semantic analysis inside those TSRX scopes:
  lexical bindings, imports, declarations, aliases, destructuring paths,
  reads, writes, calls, literals, object/array expressions, and event
  attributes
- host-specific annotations: graph-state creation sites, computed bodies,
  DOM binding expressions, event/behavior boundaries, capture candidates, and
  DOM locator ownership

The compiler must prefer this semantic artifact over ad hoc source-string
inspection. For example, an authored event prop is an element attribute whose
value is a normal function expression; a text binding is a TSRX expression child;
a `count++` is an `UpdateExpression`; `menu.open = false` is an
`AssignmentExpression` with a member path; an object literal passed to
`state()` is an object expression whose static keys and literal values are known
before lowering.

Semantic analysis decides what an expression *refers to*. Runtime serialization
still validates what a dynamic value *is*. The compiler can know that
`state({ open: false })` starts as a serializable object and can track later
path writes such as `menu.open = true`; it cannot prove that every value flowing
through a server fetch, third-party call, or opaque function remains
serializable. Those dynamic cases are checked by the serializer and reported
with state-path diagnostics.

### Extraction is the compilation model

Qwik requires `$` because it operates on arbitrary TS where extraction must be
opt-in. Here the boundaries are structural and the compiler already knows them.
Every one of the following is extracted into its own lazily-loadable symbol, with
no annotation:

- event handler expressions (`onClick={...}`, `onVisible={...}`), including
  each entry in event handler arrays
- element behavior expressions (`use={...}` on host elements), including each
  entry in behavior arrays
- `computed()` bodies
- async computed run functions and async boundary branch bindings
- DOM binding expressions (text/attribute bindings — the system's only effects)
- component bodies (executed on the server only)

### The Capture Rule (replaces the marker)

An extracted closure may capture only:

1. `state()` / `computed()` references — serialized as graph references, not values
2. `element()` handles — serialized as DOM locators, not DOM nodes
3. props and `shared()` instance references
4. module-level imports — re-imported by the emitted symbol module
5. serializable constants (JSON-compatible values, plus the framework's extended
   set: Date, RegExp, Map, Set, URL, BigInt, typed arrays, ArrayBuffer)

Capturing anything else — a local class instance, a raw function, a DOM node held
in a plain variable — is a **compile-time diagnostic** pointing at the exact
variable, explaining why it can't cross a resume boundary and what to do instead
(usually: make it state, make it an `element()` handle, hoist it to module scope,
derive it inside the closure, or move DOM-backed setup into a host element
behavior with `use`). The diagnostic does the job Qwik's `$` does, but only fires
when something is actually unserializable instead of taxing every line.
Diagnostic quality is a first-class deliverable, not polish.

## Testing Strategy

- **Compiler:** pass-level artifact tests plus final-output snapshots per
  language feature (state rewrite, destructuring aliasing, async dependency-key
  extraction, post-await diagnostics, boundary lowering, extraction, sync event
  policy extraction, capture diagnostics). Each pass has fixtures for
  input artifacts → output artifacts/diagnostics; full compiler snapshots still
  cover input `.tsrx` → emitted JS + symbol resolver/manifest.
- **Runtime:** unit tests on the graph (dependency tracking, path-level
  subscriptions, lazy computed, async computed status/versioning/cancellation).
- **Resumability end-to-end:** render a fixture app on the server, load it in a
  headless browser with **zero framework JS executed**, assert no execution before
  interaction, assert server-resolved async data does not refetch on resume, then
  interact and assert only the expected symbols were fetched and the DOM updated.
  This e2e harness is the core invariant check and gets built early, not last.
