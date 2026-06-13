# Resumable TSRX Framework — Design

**Date:** 2026-06-12
**Status:** Approved direction, pre-implementation

## Summary

A new JavaScript framework that is fully resumable (Qwik-level: zero execution on
load, closures lazy-loaded on first interaction) without any author-facing markers
(no `$`, no `.value`, no `track()`, no `&` lazy destructuring). It achieves this by
supporting exactly one authoring language: **TSRX** (https://tsrx.dev — `.tsrx`
files, `@{}` component blocks, first-class `@if`/`@for`, co-located `<style>`).
Because the framework owns the language via a TSRX codegen plugin, the compiler
sees every component, every state creation site, and every closure structurally —
which is what makes marker-free resumability and a plain-value state API tractable.

JSX/TSX is explicitly **not** supported.

## Goals

1. **Full resumability.** Component bodies never execute on the client — not even
   once. The server serializes state, the reactivity graph, and listener wiring
   into HTML; a ~1KB resumer wakes up only the code a user actually interacts with.
2. **Zero markers.** No `$` suffixes, no `.value`, no `Tracked<T>` boxes, no
   special destructuring syntax, no reactive collection subclasses
   (`RippleArray`-style). The reactive surface is plain values and plain mutation.
3. **No VDOM, no re-renders.** Solid-style fine-grained architecture: templates
   compile to real DOM operations; each dynamic binding is its own subscription.
   "Signal" is an implementation detail of compiled output, never API vocabulary.
4. **TSRX-only.** State and reactivity are language features of `.tsrx` files,
   not a runtime library importable from arbitrary TS.

## Non-Goals

- TSX/JSX support, now or later.
- Reactivity in plain `.ts` files. Plain TS receives values via function calls,
  never live bindings. (This is the boundary that lets the compiler guarantee the
  no-marker property.)
- Qwik-style serialization of arbitrary lexical scopes (see Capture Rule).

## Architecture Overview

Four pieces:

1. **Compiler** — a TSRX codegen plugin (the framework is a TSRX compile target,
   alongside React/Solid/Vue targets). Responsible for: rewriting state reads and
   writes, compiling templates to DOM instructions, extracting closures into
   lazily-loadable symbols, computing capture sets, and emitting diagnostics when
   the capture rule is violated.
2. **Runtime** — a small fine-grained reactive core (signal graph, deep proxies
   for object state, DOM binding helpers). Never exposed as user vocabulary.
3. **Server renderer** — runs component bodies once on the server, renders HTML,
   and serializes the resumability payload (state values, subscription graph,
   listener→symbol map) into the document.
4. **Resumer** — ~1KB client bootstrap. Attaches one global event listener
   (plus a shared IntersectionObserver for `onVisible`-wired elements),
   lazy-loads symbols on first interaction or visibility, re-attaches bindings
   on first relevant state change. No hydration pass, no component execution.

Bundler integration is a Vite plugin wrapping the compiler; extracted symbols
become code-split entry points.

## State System

### Surface API

Two intrinsics, available in any `.tsrx` file (components and shared logic alike):

```tsx
export function Counter() @{
  let count = state(0);
  let double = computed(() => count * 2);

  <button onClick={() => count++}>{count} / {double}</button>
}
```

- `state(initial)` — reactive value. Read it as a plain variable; write with
  plain assignment/mutation.
- `computed(fn)` — lazy derived value. Read as a plain variable. Not writable
  (no optimistic-write semantics in v1; revisit if real apps demand it).

### No effects, no tasks — by design, not omission

There is no `effect()`/`task()` primitive and never will be. A computed and an
effect are the same node (a reactive computation); the only difference is that a
computed is **pull-based** (runs when read) while an effect is **push-based**
(runs because deps changed, with no consumer). That push property is exactly
what breaks resumability (eager self-waking code) and exactly what enables
spaghetti (reacting to state you don't own). Removing it yields the framework's
core invariant:

> **The entire graph is demand-driven from the DOM.** State → computed →
> bindings, where compiler-generated DOM bindings are the only effects in the
> system. Nothing computes unless the screen needs it.

The classic uses of effects each have a better home:

- *Derive state from state* → `computed()`.
- *"When X changes, update Y"* → an antipattern in every fine-grained system;
  with no render loop, every mutation originates at an identifiable site (an
  event handler), so co-locate the side work there as a plain function.
- *Sync external targets* (`document.title`, imperative DOM) → these are
  bindings to targets the template can't express; solved at the template level,
  not with lifecycle APIs.
- *React to state you don't own* → deliberately unsupported.
- *Eager client setup* (third-party widgets, canvas init, observers) →
  `onVisible` (below).

### `onVisible` — visibility as an event, not a lifecycle

The one sanctioned home for mount-shaped imperative code is an element prop,
parallel to `onClick`:

```tsx
<canvas onVisible={el => {
  const chart = initChart(el, points.slice());
  return () => chart.destroy();
}} />
```

Semantics:

- An `on*` event handler where the event is "element entered the viewport."
  The resumer registers one shared IntersectionObserver for wired elements;
  the handler is extracted as a lazy symbol (capture rule applies) and loads
  only when its element first becomes visible.
- Fires once per element instance, receives the element, may return a cleanup
  that runs on element removal.
- **Not a reactive computation.** State reads inside are current-value reads —
  no subscriptions, no re-runs. Keeping imperative third-party state in sync
  after init (e.g. `chart.update` on data change) is explicitly unsolved in v1;
  Qwik's answer (`track()` inside the task) is a marker, so it is not ours.
- The zero-JS guarantee gets a *scoped*, greppable asterisk: pages without
  `onVisible` ship zero eager behavior; pages with it run exactly the symbols
  whose elements are on screen. There is no free-floating equivalent
  (`onMount()`, `client()`) and there never will be — anything without an
  element doesn't belong in a component.

A pure pull graph also deletes a class of resumability hazards: resume is
always re-derivation, with no effect-ordering or "did it already run on the
server" semantics to replay.

This matters double in the AI age: with one way to express any data flow
(derive it), generated code is reviewable by construction — stale-closure
effects, dependency-array bugs, and effect-ordering races are not lintable
mistakes here, they are unrepresentable. (Prior art: Ryan Carniato's
derived-first direction for Solid 2.0 — "you don't need effects; computed is
your effect.")

These are **compiler intrinsics**, not imports of a value type. There is no
`Signal`/`Tracked` type in the public API. Event handler props are camelCase
(`onClick`, `onInput`), matching TSRX/JSX convention — no directive namespace.

`state()`/`computed()` may be created anywhere in a call tree rooted in a
component instance — including helper functions in non-component `.tsrx` files
(custom-hook-style stores). Creation at **module scope** is a compile-time
diagnostic in v1: module-scope state would be shared across requests on the
server and has no home in the per-document serialization payload. App-wide state
is shared via `context()` instead.

### Implementation: hybrid compiler-rewrite + deep proxies

**Primitives (compiler-rewritten).** The compiler knows every `state()`/`computed()`
creation site statically, so every read of that binding compiles to a graph read
(`_get(count)`) and every write to a graph write — including reads inside
closures, template expressions, destructured aliases, and non-component helper
functions in `.tsrx` files. Reactivity crosses `.tsrx` function boundaries with
zero ceremony; "transporting reactivity" is not a concept users need.

**Objects and collections (proxied).** `state(obj)` wraps objects, arrays, `Map`,
`Set`, and `Date` in deep Vue-style proxies at runtime. `user.profile.name = x`
and `items.push(x)` just work via proxy traps; no reactive subclasses. Subscriptions
are path-level, so a deep mutation updates only the bindings that read that path.

**Why hybrid:** the compiler can rewrite reads of variables it can see, but deep
access through runtime aliases (`const u = obj.user` handed to a helper) is not
statically trackable without whole-program analysis. Proxies handle aliasing at
runtime; the compiler handles the hot common case with zero proxy overhead for
primitives. A pure-compiler approach (Svelte-4-style static dependency tracking)
is rejected outright: resumability requires a reified runtime graph, because the
graph is exactly what gets serialized.

### Destructuring

Destructuring from a known-reactive source (props, a `state()` object) compiles
to alias bindings: `const { x } = props` means every later read of `x` emits
`props.x`. No `&` marker, no lost reactivity. This is the Svelte 5 `$props()`
behavior generalized to all compiler-known reactive sources. Rest/spread of a
reactive source produces a derived proxy over the remaining keys.

### Props and shared state

- Component props are getter-backed; reads inside the child re-read the parent's
  graph. Destructuring in the parameter list is auto-aliased as above.
- The shared-state primitive (context vs. provider-free auto-scoped stores) is
  under active design — see Open Design Threads. Whatever lands must follow the
  same rules as state: compiler-known creation, serializable values,
  graph-referenced by extracted closures, no module-scope instances. Requirements
  already settled: no manual boundary ceremony (no `createContextId` +
  provider + consumer triple), and it must work across nested containers and
  separately-built micro-frontend containers (stable cross-bundle identity,
  plain-data wire format).

## Resumability

### Extraction is the compilation model

Qwik requires `$` because it operates on arbitrary TS where extraction must be
opt-in. Here the boundaries are structural and the compiler already knows them.
Every one of the following is extracted into its own lazily-loadable symbol, with
no annotation:

- event handler expressions (`onClick={...}`, `onVisible={...}`)
- `computed()` bodies
- DOM binding expressions (text/attribute bindings — the system's only effects)
- component bodies (executed on the server only)

### The Capture Rule (replaces the marker)

An extracted closure may capture only:

1. `state()` / `computed()` references — serialized as graph references, not values
2. props and context references
3. module-level imports — re-imported by the emitted symbol module
4. serializable constants (JSON-compatible values, plus the framework's extended
   set: Date, Map, Set, URL, BigInt, typed arrays)

Capturing anything else — a local class instance, a raw function, a DOM node held
in a plain variable — is a **compile-time diagnostic** pointing at the exact
variable, explaining why it can't cross a resume boundary and what to do instead
(usually: make it state, hoist it to module scope, or derive it inside the
closure). The diagnostic does the job Qwik's `$` does, but only fires when
something is actually unserializable instead of taxing every line. Diagnostic
quality is a first-class deliverable, not polish.

### Serialization payload

The server renderer emits, alongside the HTML:

1. **State values** — proxies unwrap to plain data; serialized with the extended
   serializer. `computed()` values are *not* serialized; they re-derive lazily
   from their dependencies on first read.
2. **Subscription graph** — which symbol (binding, computed) depends on which
   state path.
3. **Wiring** — DOM element → event → symbol map for listeners, and DOM element →
   binding-symbol map for dynamic text/attributes.

Format: a JSON script block plus element attributes for wiring (exact encoding is
an implementation detail of the renderer/resumer pair and may change freely —
it is not public API).

### Resume behavior

- One global delegated event listener (capture phase) from the resumer.
- First interaction: look up the symbol for that element/event, dynamically
  import it, materialize its captured graph references, run it.
- State writes during that run propagate through the graph; subscribed binding
  symbols are loaded on demand and update the DOM in place. Nothing re-renders;
  there is no component re-execution path in the client runtime at all.

## Error Handling

- **Compile time:** capture-rule violations, `state()`/`computed()` used outside
  a `.tsrx` reactive scope, unserializable initial state. All diagnostics name the
  offending identifier and span.
- **Runtime (dev):** serialization failures at SSR time fail the render loudly
  with the state path included. Resumer logs a structured error if a symbol fails
  to load or a graph reference is missing (payload/version mismatch).
- **Runtime (prod):** symbol load failures retry once, then surface through an
  app-level error hook.

## Testing Strategy

- **Compiler:** snapshot tests per language feature (state rewrite, destructuring
  aliasing, extraction, capture diagnostics) — input `.tsrx` → emitted JS + symbol
  manifest.
- **Runtime:** unit tests on the graph (dependency tracking, path-level proxy
  subscriptions, lazy computed).
- **Resumability end-to-end:** render a fixture app on the server, load it in a
  headless browser with **zero framework JS executed**, assert no execution before
  interaction, then interact and assert only the expected symbols were fetched and
  the DOM updated. This e2e harness is the core invariant check and gets built
  early, not last.

## Open Design Threads

Settled in principle but not yet in shape:

- **Shared state / DI primitive.** Leading candidate: provider-free auto-scoped
  stores (module-scope *definitions*, per-container *instances*, compiler-emitted
  stable IDs for cross-container/micro-frontend sharing via a page-level
  registry). Not yet approved; see requirements under "Props and shared state."

## Deferred Decisions

Deliberately out of scope for the first implementation plan, to be designed when
their prerequisites exist:

- Keeping imperative third-party state in sync after `onVisible` init (the
  `chart.update` problem), plus possible `onVisible` variants (idle trigger,
  `onHidden`).
- Async derivation (`computed(async () => ...)` with pending/error states) —
  likely needed before real apps; the strongest candidate to promote into v1
  scope, since without an async story users will reinvent effects badly.
- Writable `computed()` (optimistic state).
- Streaming SSR / out-of-order flushing.
- Server functions / RPC story.
- Devtools (graph visualization).

## Build Order (high level)

1. Reactive runtime core (graph + proxies) — pure TS, testable standalone.
2. Compiler: state rewriting + template codegen for client-side rendering (CSR
   mode first, to validate the language surface without serialization).
3. Closure extraction + capture analysis + diagnostics.
4. Server renderer + serialization + resumer; e2e resumability harness.
