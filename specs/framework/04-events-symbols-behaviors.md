# Events, Symbols, And Behaviors

DOM handles, node-owned behaviors, visibility events, event semantics, sync policy, and lazy symbol resolution.

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
- element behavior setup and cleanup belongs on the host node through `use`,
  not inside `element()` handles or serialized state.

`state()` cannot hold DOM nodes, and `element()` handles are not serialized as
data. Passing element handles through component context, arrays, and helpers is
valid when the values remain inside `.tsrx` compiler-owned code.

### Element behaviors

DOM-backed libraries are not durable state. Chart.js, Monaco, Mapbox, tooltips,
observers, gesture libraries, and drag/resize helpers all need a real browser
element and often need cleanup. They should not be stored in `state()` and they
should not become serializer problems.

Use the framework-owned `use` prop on host elements for node-owned DOM behavior:

```tsx
import { Chart } from "chart.js";

function chart(config: ChartConfig) {
  return (canvas: HTMLCanvasElement) => {
    const instance = new Chart(canvas, config);
    return () => instance.destroy();
  };
}

export function SalesChart({ points }: { points: Point[] }) @{
  const config = computed(() => makeChartConfig(points));

  <canvas use={chart(config)} />
}
```

`use` is the declarative bridge from imperative DOM/library code to the node
that owns it. It is similar in spirit to events and element handles:

```txt
onClick={}  runs event behavior owned by this node
el={}       gives lazy access to this node later
use={}      installs longer-lived DOM behavior owned by this node
```

The behavior result is never serialized. The server records the host element
locator, the behavior code reference, and the serializable behavior inputs. The
client resolves the element, lazy-loads the behavior symbol, runs it in the
browser, and stores the cleanup with that node.

`use` is compiler-special on host elements. In `use={chart(config)}`, the
factory call is not normal eager SSR execution. The compiler treats it as:

```txt
behavior: chart
input: config
owner: current host element
```

The v1 supported forms are:

```tsx
<input use={autofocus} />
<canvas use={chart(config)} />
<div use={[tooltip(options), clickOutside(close)]} />
```

Behavior functions receive the element and may return a cleanup function:

```ts
type ElementBehavior<T extends Element> =
  (element: T) => void | (() => void);
```

When behavior inputs change, v1 cleans up the existing behavior and runs it
again. Future versions may support an explicit update contract for libraries
that can update in place. Multiple behaviors install in array order and clean up
in reverse order.

`use` is host-element-only. Components can expose higher-level wrappers, but
`use` passed directly to a component is a diagnostic unless that component's
compiler output explicitly forwards it to a host element. Behavior inputs use
the same capture and serialization rules as event handlers: no request objects,
secrets, server-only modules, DOM nodes, or runtime handles may cross into a
client behavior input.

### `onVisible` — visibility as an event, not a lifecycle

Visibility is modeled as an element event, parallel to `onClick`:

```tsx
<img
  src={src}
  onVisible={() => analytics.recordImageSeen(src)}
/>
```

Semantics:

- An `on*` event handler where the event is "element entered the viewport."
  The resumer registers one shared IntersectionObserver for wired elements;
  the handler is extracted as a lazy symbol (capture rule applies) and loads
  only when its element first becomes visible.
- Fires once per element instance, receives the element, may return a cleanup
  that runs on element removal.
- **Not a reactive computation.** State reads inside are current-value reads —
  no subscriptions, no re-runs. DOM-backed libraries that need setup, updates,
  and cleanup belong in `use`, not `onVisible`.
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

### Event handler arrays and sync policy

Event and behavior props accept either one expression or an array of expressions:

```tsx
<button onClick={[saveDraft, closeDialog]} />
<div onVisible={[recordImpression, preloadDetails]} />
<canvas use={[chart(config), resizeCanvas]} />
```

For `on*` event props, array entries run in authored order. The runtime stops at
the first thrown or rejected entry and routes the error through the normal error
boundary path. Return values are ignored for ordinary events. For event props
with lifecycle cleanup semantics such as `onVisible`, returned cleanup functions
are stored and later run in reverse order.

Event handlers are lazy-loaded behavior, so the browser cannot wait for handler
chunks before deciding default actions. For v1, only browser-critical
cancellation/propagation is allowed to run synchronously. When the compiler sees
`event.preventDefault()` or `event.stopPropagation()` inside an event handler, it
tries to extract the smallest equivalent sync policy from the surrounding
condition. That policy may read only already-resumed framework graph state,
serializable constants/props, and simple event fields. It may not import code,
call arbitrary user functions, await async work, read DOM resources, or perform
graph writes in v1. State writes remain in the lazy handler chunk.

```tsx
let menuOpen = state(false);

<input
  onKeyDown={(event) => {
    if (menuOpen && event.key === "Escape") {
      event.preventDefault();
      menuOpen = false;
    }
  }}
/>
```

The compiler records a sync policy equivalent to:

```ts
if (graph.read(menuOpenId) && event.key === "Escape") {
  event.preventDefault();
}
```

The `menuOpen = false` write still runs in the lazy handler symbol after the
runtime imports it. If the cancellation/propagation condition cannot be proven
from graph state, constants/props, and event fields, compilation fails with a
diagnostic rather than silently emitting a handler whose default action is too
late to matter.

For `use`, behavior entries install in authored order and clean up in reverse
order. Each behavior has its own serialized input and code reference, so one
behavior can be lazy-loaded or diagnosed independently from the others.

### Symbol loading and event wiring

Extracted symbols are lazy-loaded, but normal framework-owned wiring does not
turn into QRL-like user values or per-node DOM closures. Authored event props
compile to encoded `async/view` records:

```txt
DOM locator + event name + optional sync policy IR + ordered handler symbol IDs
```

The generated HTML does not need an `onClick={async (...) => import(...)}` shape,
and production output should not require per-node event attributes. The
`async/view` arena locates nodes by DOM-order streams, skip runs, branch anchors,
or other private locator data, then the resumer builds internal side tables such
as `WeakMap<Element, EventRecord>`.

Dynamic imports are owned by a generated symbol resolver, not by each event prop.
The resolver is a page/build-scoped module or equivalent compact runtime table
that maps symbol IDs from `async/view` to chunks and exports:

```ts
export function loadSymbol(id: number) {
  switch (id) {
    case 7:
      return import("/assets/menu.handlers.ab12.js")
        .then((mod) => mod.onKeyDown_7);
    case 8:
      return import("/assets/menu.bindings.cd34.js")
        .then((mod) => mod.textBinding_8);
    default:
      return Promise.reject(new Error(`Unknown async symbol ${id}`));
  }
}
```

The exact resolver syntax is private build output. The full symbol manifest is a
build/server artifact. The browser receives only the resolver/table needed for
the current build or page, plus enough build/protocol identity to fail closed if
`async/view` references a symbol the resolver does not know.

The same resolver path is used for event handlers, DOM binding symbols,
`use={...}` behavior symbols, async computed run functions, and other lazy
runtime behavior. Captures are materialized by the runtime from graph references,
serializable constants, props/shared references, and element locators; they are
not serialized as arbitrary function closures.
