# Resumable TSRX Framework — Design

**Date:** 2026-06-12
**Status:** Approved direction, pre-implementation
**Tagline:** A resumable UI framework for async-first apps.
**Package:** `@async/await`

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
5. **First-class async.** Async dataflow is a compiler-tracked graph feature, not
   an effect/task/resource wrapper. Pending/error UI is expressed with TSRX
   boundaries, and async dependencies are serializable/resumable.

## Non-Goals

- TSX/JSX support, now or later.
- Reactivity in plain `.ts` files. Plain TS receives values via function calls,
  never live bindings. (This is the boundary that lets the compiler guarantee the
  no-marker property.)
- Qwik-style serialization of arbitrary lexical scopes (see Capture Rule).

## TSRX Baseline

This framework should let TSRX answer syntax and template-shape questions
whenever core TSRX already has an answer.

TSRX owns the baseline semantics for:

- components as ordinary TypeScript functions returning TSRX
- statement containers (`@{...}`)
- comments inside template children
- lexical scope inside statement containers and control-flow blocks
- `@if`, `@for`, `@switch`, and `@try`
- `@for` `index`, `key`, and `@empty`
- dynamic tags/components (`<{expr}>`)
- scoped `<style>` blocks and style composition

This framework is a TSRX host profile. It consumes the TSRX AST and defines only
the host-specific semantics needed for marker-free graph state, async dataflow,
closure extraction, resumability, serialization, and runtime DOM wiring. When a
question is already answered by TSRX, this design should reference that answer
rather than invent a parallel rule.

The main exception is reactive state semantics. TSRX's core lazy destructuring
syntax remains valid TSRX, but this framework's host profile preserves live
reads for known-reactive sources without requiring authors to use lazy
destructuring markers.

## Architecture Overview

Five pieces:

1. **Compiler** — a TSRX codegen plugin (the framework is a TSRX compile target,
   alongside React/Solid/Vue targets). Responsible for: rewriting state reads and
   writes, compiling templates to DOM instructions, extracting closures into
   lazily-loadable symbols, splitting async derivations into key functions and
   run functions, compiling async boundaries, computing capture sets, and emitting
   diagnostics when the capture or async tracking rules are violated.
2. **Runtime** — a small fine-grained reactive core (signal graph, deep proxies
   for object state, async node state, cancellation/versioning, DOM binding
   helpers). Never exposed as user vocabulary.
3. **Server renderer** — runs component bodies once on the server, renders HTML,
   awaits demanded async nodes in v1 non-streaming mode, and serializes the
   resumability payload (state values, async snapshots, subscription graph,
   listener→symbol map) into the document.
4. **Resumer** — ~1KB client bootstrap. Attaches one global event listener
   (plus a shared IntersectionObserver for `onVisible`-wired elements),
   lazy-loads symbols on first interaction or visibility, re-attaches bindings
   on first relevant state change. No hydration pass, no component execution.
5. **Build integration** — a Rolldown plugin base exported by `@async/await`,
   with framework adapters such as Vite consuming that base plugin. Extracted
   symbols become code-split entry points, and production builds emit the
   manifest metadata needed by the server renderer, resumer, preload/runtime
   graph, and cached SSR fragments.

The build architecture is Rolldown-first, not Vite-first. The base Rolldown
plugin owns compiler transforms, virtual modules, emitted symbol chunks,
manifest generation, diagnostics, and client/server/library build modes. The
Vite plugin is an adapter that wraps the Rolldown plugin with Vite-specific
environment detection, dev-server transforms, HMR, HTML/dev-tag injection, build
orchestration, and public extension APIs. This mirrors the `qwik-bundler`
structure: a reusable `rolldown` entry point is the core, and `vite` is one
consumer of it.

## State System

### Surface API

The author-facing graph data model is three intent-named words:

- `state()` creates graph state.
- `computed()` creates sync or async derived graph state.
- `shared()` creates a named request/container/page graph root.

Signals, stores, subscriptions, and proxy nodes are implementation details of
graph management. `onVisible` is an element event prop, not a state primitive.
The two local-state intrinsics, available in any `.tsrx` file (components and
shared logic alike):

```tsx
export function Counter() @{
  let count = state(0);
  let double = computed(() => count * 2);

  <button onClick={() => count++}>{count} / {double}</button>
}
```

- `state(initial)` — reactive value. Read it as a plain variable; write with
  plain assignment/mutation. Scalars compile to one reactive cell; objects and
  collections compile to field/path-granular reactive data. There is no separate
  `store()` primitive.
- `computed(fn)` — lazy derived value. Read as a plain variable. Sync computeds
  re-derive from their dependencies when read. Async computeds are compiler-known
  async graph nodes with pending/error/value state, cancellation, and dependency
  keys. Computeds are not writable (no optimistic-write semantics in v1; revisit
  if real apps demand it).

```tsx
let count = state(0);
let session = state({ user: null, status: "anonymous" });

count++;                  // invalidates the scalar cell
session.user = user;      // invalidates only the `user` path
session.status = "ready"; // invalidates only the `status` path
```

### DOM element handles

DOM elements are not graph state. They are host objects that may exist in the
browser, may be absent on the server, and may disappear when a conditional or
keyed item is removed.

Use `element<T>()` when lazy event code needs a typed, resumable handle to a host
element. Bind it with the framework-owned `el` prop:

```tsx
export function SearchBox() @{
  let input = element<HTMLInputElement>();

  <>
    <input el={input} />
    <button onClick={() => input?.focus()}>Focus</button>
  </>
}
```

`element()` creates an element handle, not reactive data. `el={handle}` binds that
handle to exactly one host element in the current graph scope. On the server, and
after the element is removed, reading the handle produces `undefined`. When a
lazy event or visibility handler runs in the browser, the resumer resolves the
handle's serialized DOM locator to the current element.

This covers the common design-system cases: focus registries, item navigation,
measurement, pointer capture, popover/dialog/file-picker APIs, and cross-event
DOM access. It also keeps two jobs separate:

- `element()` names an element for later imperative use.
- attach/detach setup and cleanup, if needed, should use a separate lifecycle
  surface rather than overloading element handles.

`state()` cannot hold DOM nodes, and `element()` handles are not serialized as
data. Passing element handles through component context, arrays, and helpers is
valid when the values remain inside `.tsrx` compiler-owned code.

### Scoping model

A tree is a constrained graph: one root, parent/child ancestry, no arbitrary
cross-edges. UI structure is usefully tree-shaped, but state dependencies are
not. One state path may feed unrelated DOM bindings; one derived value may depend
on local state, shared request state, and another derived value; one event may
write several paths. That is a general directed graph, not a component tree.

State is therefore graph-scoped, not render-boundary-scoped. A component may
create a local graph scope during server render, but updates do not belong to
the component and never re-enter the component body on the client. Components
are just ways to create local graph scopes, attach reads/writes, and project
graph values into DOM.

`shared()` lifts that same graph model out of any component instance and gives
it request/container/page scope. This is different from hooks and context, which
scope state through render order, provider ancestry, component subscriptions,
and rerender boundaries. In this framework, the boundary is the dataflow:

```txt
where the graph instance lives
which bindings read it
which handlers write it
where it must serialize
where it must sync across runtimes
```

That distinction is core to marker-free resumability. Because the compiler owns
the dataflow graph directly, authors do not mark lazy boundaries or manually
construct state boundaries with providers; the graph itself is the resumable
unit. Resuming means loading the symbol touched by an event, materializing its
graph references, applying writes to graph nodes, and updating the DOM bindings
that actually depend on those paths.

### Loop identity

TSRX already gives `@for` optional `index` and `key` clauses:

```tsx
@for (const product of products; index i; key product.id) {
  <ProductCard product={product} />
}
```

This framework uses the `key` clause as the stable identity root for repeated
local graph scopes. A keyed loop item keeps its component instances, local
`state()`, `computed()` nodes, async nodes, DOM bindings, and event wiring
attached to the same logical item across reorder, insert, and delete operations.

Unkeyed `@for` is positional. That is acceptable for static/stateless output,
but any loop body that creates resumable graph identity must either provide a
stable domain key or explicitly key by position (`index i; key i`) when state
should follow the slot rather than the item. The compiler should diagnose
interactive or stateful unkeyed loops and point at the `@for` header:

```tsx
@for (const product of products; key product.id) {
  <ProductCard product={product} />
}
```

The loop key applies to generated child identity for that iteration. If a child
component or element supplies its own key, that authored key becomes the child
identity within the keyed loop item.

### Conditional identity

`@if` branches create branch-local graph scopes. When a branch is removed from
the DOM, graph state created exclusively inside that branch is disposed with it:
local `state()`, `computed()` nodes, async nodes, DOM bindings, event wiring,
and pending async work.

When the branch becomes active again, it creates fresh branch-local graph state
from the current parent values. This matches the no-VDOM model: conditional
rendering inserts and removes real DOM and graph subtrees directly rather than
retaining hidden virtual subtrees.

```tsx
export function Panel() @{
  const open = state(false);

  <section>
    <button onClick={() => open = !open}>Toggle</button>

    @if (open) {
      const draft = state("");

      <input value={draft} onInput={event => draft = event.currentTarget.value} />
    }
  </section>
}
```

In this example, `draft` resets every time `open` changes from `false` to `true`.
If state should survive while the branch is hidden, declare it in the nearest
stable parent scope:

```tsx
export function Panel() @{
  const open = state(false);
  const draft = state("");

  <section>
    <button onClick={() => open = !open}>Toggle</button>

    @if (open) {
      <input value={draft} onInput={event => draft = event.currentTarget.value} />
    }
  </section>
}
```

The compiler should be able to explain this rule when local state appears inside
a conditional branch:

```txt
State declared inside @if is disposed when the branch is removed.
Move it above the @if if it should persist.
```

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
- *Fetch data from state* → `computed(async ...)` plus a TSRX async boundary.
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

### Async derivation and TSRX boundaries

Async is v1 core, not a deferred resource layer. Without a first-class async
path, users will rebuild effects by hand with `loading`, `error`, and `data`
state. The framework instead treats async as derived graph state:

```tsx
function UserRoute() @{
  const user = computed(async ({ signal }) => {
    const id = route.params.userId;

    const res = await fetch(`/api/users/${id}`, { signal });
    if (!res.ok) throw new Error("Failed to load user");

    return await res.json();
  });

  @try {
    <Profile user={user} />
  } @pending {
    <Spinner />
  } @catch (err) {
    <ErrorView error={err} />
  }
}
```

Semantics:

- `computed(async ({ signal }) => ...)` creates a lazy async graph node. It does
  not run at creation; it runs only when demanded by a DOM binding or TSRX async
  boundary.
- Reactive reads before the first `await` form the dependency key for the async
  node. When that key changes, the runtime creates a new request version.
- Reactive reads after the first `await` are a compile-time diagnostic. Snapshot
  the value before awaiting, or split the logic into an async computed plus a
  sync computed:

```tsx
const rawUser = computed(async ({ signal }) =>
  fetchUser(route.params.userId, signal)
);
const formattedUser = computed(() => formatUser(rawUser, locale));
```

- Sync computeds may depend on async computeds. They become
  async-pending-capable transitively and must still be read under an async
  boundary if their upstream async value can be pending or rejected.
- The runtime passes an `AbortSignal` to async computeds. On dependency-key
  change or disposal, stale work is aborted when possible; stale promise
  resolutions are ignored even if the underlying operation cannot abort.
- `@try` / `@pending` / `@catch` is the only v1 UI mechanism for observing async
  pending/error state. There is no public `resource()`, `.loading`, `.error`, or
  `track()` API.
- A template read of an async computed must be dominated by an async boundary.
  Missing boundaries are compile-time diagnostics in v1. A future router may
  provide route-level implicit boundaries, but the v1 compiler should keep the
  rule explicit.
- In v1 non-streaming SSR, the server awaits all demanded async nodes inside
  rendered boundaries before emitting final HTML. Streaming, out-of-order
  flushing, stale-while-revalidate, and explicit cache policy are separate
  features.
- On client revalidation, a dependency-key change returns the boundary to
  `@pending` for the new key. Stale-content and cached-key policies are deferred.

Internally, the compiler can lower the single author-facing function into a
resource-shaped pair:

```ts
_asyncComputed({
  key: () => ({ id: route.params.userId }),
  run: async ({ key, signal }) => fetchUser(key.id, signal),
});
```

That split is an implementation model, not public API. It keeps the authoring
surface aligned with JavaScript `async`/`await`, while giving the runtime the
explicit dependency key, cancellation hook, version counter, and serialization
record required for resumability.

Rationale: runtime-only tracking systems lose dependencies after `await` unless
users manually read them before suspension; Qwik solves that with `track()`, and
Vue/Angular document the same synchronous-tracking constraint. Svelte's compiler
can recover some async dependencies in compiler-visible expressions. This
framework takes the TSRX-only route: no marker, but strict compiler diagnostics
at the async boundary.

The state, async, element, and event primitives are **compiler intrinsics**, not
imports of a value type. There is no `Signal`/`Tracked` type in the public API.
Event handler props are camelCase (`onClick`, `onInput`), matching TSRX/JSX
convention — no directive namespace. Element handles use the host prop `el`,
which only accepts `element()` handles.

`state()`/`computed()` may be created anywhere in a call tree rooted in a
component or shared instance — including helper functions in non-component
`.tsrx` files. Creation at **module scope** is a compile-time
diagnostic in v1: module-scope state would be shared across requests on the
server and has no home in the per-document serialization payload. Request,
container, and page state is declared with `shared()` definitions instead.

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
reactive source produces live forwarding fields rather than a value snapshot.
That rule is what makes returning a state object plus methods from `shared()`
ergonomic: `return { ...s, login() { ... } }` preserves `s.user` as a graph
reference.

### Props

Component props are getter-backed; reads inside the child re-read the parent's
graph. Destructuring in the parameter list is auto-aliased as above.

### Shared state — `shared()`

There is no `context()` and no `store()`. React-style context makes authors
create tree boundaries (`Provider`, context IDs, wrapper hooks) for data that is
usually request, container, or page scoped: auth, i18n, cart, feature flags,
current org, route cache, websocket state. `shared()` names that dataflow
directly.

```tsx
// session.tsrx - definition only; module scope holds no instance
export const session = shared(() => {
  const s = state({
    user: null,
    status: "anonymous",
  });

  const signedIn = computed(() => s.user !== null);

  return {
    ...s,
    signedIn,

    async login(creds) {
      s.status = "loading";
      s.user = await loginUser(creds);
      s.status = "ready";
    },

    logout() {
      s.user = null;
      s.status = "anonymous";
    },
  };
});

function Header() @{
  const s = session();

  @if (s.signedIn) {
    <Avatar user={s.user} />
  }
}
```

`session()` does not mean "run a hook." It means: resolve this named dataflow
instance for the current request/container/page. The instance is created on the
server per request, serialized into the graph payload, resumed lazily on the
client, and synchronized by serialized patch events only when it crosses
container/runtime boundaries.

```txt
shared definition
  -> request-scoped server instance
  -> serialized graph snapshot
  -> lazy client graph instance
  -> CustomEvent patches across container/runtime boundaries
```

Semantics:

- **Identity:** compiler-emitted stable ID per definition (package + export
  name). No `createContextId`, and IDs survive serialization and
  separately-built bundles.
- **Resolution:** bare call resolves the current request/container/page instance
  of that shared definition. There is no `provide()` or `create()` in v1;
  repeated local widget state stays ordinary component-owned `state()`.
- **Boundaries are dataflow, not components.** The framework tracks who reads,
  who writes, which runtime owns the instance, and where the state must
  serialize or sync. Authors do not place provider components to define those
  boundaries.
- **Local writes are graph writes.** Inside one container, `s.user = user`
  mutates the local reactive graph directly. Custom events are not the state
  engine.
- **Cross-runtime writes are event patches.** When a shared instance spans
  nested containers, sibling micro-frontends, or a page shell boundary, the write
  additionally emits a versioned `CustomEvent` carrying plain serialized data.
  Other runtimes fold the patch into their own local graph.
- **State crosses bundles; code does not.** Separately-built containers may each
  bundle their own `session.login()` implementation. They synchronize through
  shared definition IDs and data patches, not shared JS object identity.

Rationale receipts (GitHub code search, June 2026): ~75% of React `useContext`
call sites are hidden behind hand-rolled bare-call wrappers (`useAuth()`-style,
~24k files) - when most users wrap an API before using it, the wrapper is the
correct primitive. ~12k files hand-write orphan-provider errors, which this
model deletes for root/request state instead of pushing into userland. Zustand's
define-then-bare-call shape appears in ~60k files, with its ~21k selector call
sites being pure re-render tax that a fine-grained graph deletes.

#### Shared examples

**Request session**

```tsx
export const session = shared(() => {
  const s = state({ user: null, status: "anonymous" });

  return {
    ...s,
    async login(creds) {
      s.status = "loading";
      s.user = await loginUser(creds);
      s.status = "ready";
    },
  };
});

function AccountButton() @{
  const s = session();

  <button onClick={() => s.login(creds)}>
    {s.user ? s.user.name : "Sign in"}
  </button>
}
```

**Composition between shared definitions**

Factories may call other shared definitions. The call resolves from the creation
context of the instance, so composed state keeps request/container isolation.

```tsx
export const cart = shared(() => {
  const s = session();
  const c = state({ id: "current", items: [] });

  const total = computed(() => {
    const subtotal = c.items.reduce((sum, item) => sum + item.price, 0);
    return applyCustomerPricing(subtotal, s.user);
  });

  return {
    ...c,
    total,
    add(item) {
      c.items.push(item);
    },
  };
});
```

The compiler can see shared-definition dependencies and should reject circular
definition graphs with a diagnostic that prints the cycle.

**Page-shell and micro-frontend state**

```tsx
export const shell = shared(() => {
  const s = state({
    sidebarOpen: false,
    activeCartId: null,
  });

  return {
    ...s,
    toggleSidebar() {
      s.sidebarOpen = !s.sidebarOpen;
    },
  };
});

// Header bundle
function HeaderCartButton() @{
  const s = shell();
  const c = cart();

  <button onClick={() => {
    s.activeCartId = c.id;
    s.sidebarOpen = true;
  }}>
    Cart
  </button>
}

// Sidebar bundle, built separately
function CartSidebar() @{
  const s = shell();

  @if (s.sidebarOpen) {
    <aside>{s.activeCartId}</aside>
  }
}
```

The two bundles share live state without sharing code. The header write updates
its local graph and emits a serialized patch for the `shell` shared ID; the
sidebar runtime folds that patch into its own graph.

**Local repeated widget state**

Repeated component instances do not use `shared()`. Their boundary is local
ownership, so ordinary `state()` is enough.

```tsx
export function Select({ options }) @{
  const s = state({ open: false, value: null });

  <button onClick={() => s.open = !s.open}>{s.value ?? "Select"}</button>

  @if (s.open) {
    <ul>
      @for (const option of options; key option.value) {
        <li onClick={() => {
          s.value = option.value;
          s.open = false;
        }}>
          {option.label}
        </li>
      }
    </ul>
  }
}
```

This prevents `shared()` from becoming context under a different name. Shared
state is named request/container/page dataflow; local state is component-owned
dataflow.

## Resumability

### Extraction is the compilation model

Qwik requires `$` because it operates on arbitrary TS where extraction must be
opt-in. Here the boundaries are structural and the compiler already knows them.
Every one of the following is extracted into its own lazily-loadable symbol, with
no annotation:

- event handler expressions (`onClick={...}`, `onVisible={...}`)
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
   set: Date, Map, Set, URL, BigInt, typed arrays)

Capturing anything else — a local class instance, a raw function, a DOM node held
in a plain variable — is a **compile-time diagnostic** pointing at the exact
variable, explaining why it can't cross a resume boundary and what to do instead
(usually: make it state, make it an `element()` handle, hoist it to module scope,
or derive it inside the closure). The diagnostic does the job Qwik's `$` does,
but only fires when something is actually unserializable instead of taxing every
line. Diagnostic quality is a first-class deliverable, not polish.

### Serialization payload

The server renderer emits, alongside the HTML:

1. **State values** — proxies unwrap to plain data; serialized with the extended
   serializer. Sync `computed()` values are *not* serialized; they re-derive
   lazily from their dependencies on first read.
2. **Async snapshots** — demanded async computed IDs, dependency keys, request
   versions, status (`pending`, `resolved`, `rejected`), and settled value/error
   data when available. This prevents resume from refetching data the server
   already resolved.
3. **Shared instances** — shared definition IDs, request/container/page scope,
   version counters, and the plain state snapshot for each touched shared
   instance. Methods/actions are never serialized.
4. **Subscription graph** — which symbol (binding, computed, async dependency
   key) depends on which state path.
5. **Wiring** — DOM element → event → symbol map for listeners, and DOM element →
   binding-symbol map for dynamic text/attributes/async boundaries.
6. **Element handles** — `element()` handle IDs mapped to DOM locators emitted by
   `el={handle}` bindings. The payload identifies where the element is; it never
   serializes the element object itself.

Format: a JSON script block plus element attributes for wiring (exact encoding is
an implementation detail of the renderer/resumer pair and may change freely —
it is not public API).

### Resume behavior

- One global delegated event listener (capture phase) from the resumer.
- First interaction: look up the symbol for that element/event, dynamically
  import it, materialize its captured graph references and element handles, run
  it.
- Element handles resolve from serialized DOM locators at handler execution time.
  If the element was removed or the locator no longer matches, the handle reads
  as `undefined`.
- State writes during that run propagate through the graph; subscribed binding
  symbols are loaded on demand and update the DOM in place. Nothing re-renders;
  there is no component re-execution path in the client runtime at all.
- Async computed invalidation aborts the prior request version, imports the async
  run function only when a visible/demanded boundary needs it, and applies only the
  newest matching result to the graph.
- If a write touches a shared instance that spans a container/runtime boundary,
  the local graph write additionally emits a versioned `CustomEvent` patch. The
  exact event name and encoding are private runtime protocol, but the shape is
  plain data:

```ts
{
  id: "pkg/session#session",
  scope: "page",
  version: 42,
  patch: [
    ["set", ["user"], user],
    ["set", ["status"], "ready"],
  ],
}
```

## Error Handling

- **Compile time:** capture-rule violations, `state()`/`computed()` used outside
  a `.tsrx` reactive scope, reactive reads after `await` in async computed
  bodies, async reads outside an async boundary, `el` used with a non-`element()`
  handle, one `element()` handle bound to multiple live host elements, an element
  handle stored in `state()` or serialized data, unserializable initial state.
  All diagnostics name the offending identifier and span.
- **Runtime (dev):** serialization failures at SSR time fail the render loudly
  with the state path included. Async result serialization failures include the
  async computed ID and dependency key. Resumer logs a structured error if a
  symbol fails to load or a graph reference is missing (payload/version mismatch).
- **Runtime (prod):** symbol load failures retry once, then surface through an
  app-level error hook.

## Testing Strategy

- **Compiler:** snapshot tests per language feature (state rewrite, destructuring
  aliasing, async dependency-key extraction, post-await diagnostics, boundary
  lowering, extraction, capture diagnostics) — input `.tsrx` → emitted JS +
  symbol manifest.
- **Runtime:** unit tests on the graph (dependency tracking, path-level proxy
  subscriptions, lazy computed, async computed status/versioning/cancellation).
- **Resumability end-to-end:** render a fixture app on the server, load it in a
  headless browser with **zero framework JS executed**, assert no execution before
  interaction, assert server-resolved async data does not refetch on resume, then
  interact and assert only the expected symbols were fetched and the DOM updated.
  This e2e harness is the core invariant check and gets built early, not last.

## Deferred Decisions

Deliberately out of scope for the first implementation plan, to be designed when
their prerequisites exist:

- Keeping imperative third-party state in sync after `onVisible` init (the
  `chart.update` problem), plus possible `onVisible` variants (idle trigger,
  `onHidden`).
- Async caching policy beyond "current dependency key", stale-while-revalidate
  UI, manual refresh/invalidation APIs, and prefetch policy.
- Writable `computed()` (optimistic state).
- Streaming SSR / out-of-order flushing.
- Server functions / RPC story.
- Devtools (graph visualization).

## Build Order (high level)

1. Reactive runtime core (graph + proxies + async node status/versioning) — pure
   TS, testable standalone.
2. Compiler: state rewriting + template codegen for client-side rendering (CSR
   mode first, to validate the language surface without serialization).
3. Async computed lowering + `@try`/`@pending`/`@catch` boundary lowering.
4. Closure extraction + capture analysis + diagnostics.
5. Server renderer + serialization + resumer; e2e resumability harness.
