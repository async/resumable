# Runtime Render/Resume

Unified runtime behavior for initial render, browser resume, delegated event dispatch, graph writes, behavior setup, async invalidation, and shared patches.

There is no separate server runtime package. Initial render and browser resume
are two environment-specific phases of the same runtime graph, serializer
protocol, and symbol system. The implementation may expose environment-specific
entry points, but app authors should experience one model rather than a
two-sided deployment split.

### Runtime graph contract

The runtime graph's in-memory data structure is private. Implementations may use
maps, arrays, compact arenas, generated structs, proxies, tries, or hybrid
dev/prod layouts. The spec requires graph behavior, not a particular storage
shape.

Serialized payloads contain stable logical graph references. In-memory node
addresses, object layouts, subscription indexes, dirty queues, and optimizer
choices are implementation details.

Every runtime graph implementation must preserve:

- stable graph references across initial render, serialization, and browser resume
- path-granular reads and writes for object state
- dependency tracking for computed nodes, async nodes, DOM bindings, and sync
  event policies
- invalidation after writes and deterministic flush ordering
- object identity and cycle preservation for serializable state
- async computed status, dependency keys, request versions, and cancellation
- diagnostic metadata that maps runtime graph references back to compiler
  artifacts when possible

This graph is not a virtual DOM. It does not store a virtual element tree,
virtual child arrays, component render-output snapshots, or a reconciliation
target. State writes invalidate graph subscribers directly; DOM binding symbols
patch located real DOM nodes in place. `async/view` records and graph DOM
binding records may describe how to find/update existing DOM, but they are not
an alternate UI tree to diff.

### Scheduler and flush semantics

The scheduler is a graph scheduler with a DOM mutation journal. A journal is
allowed, but it records concrete DOM operations produced by graph binding work;
it is not a VNode journal, render-output journal, or diff queue.

The v1 scheduler contract is:

- Sync event policy runs immediately in the delegated event listener, before any
  lazy handler import.
- Lazy event handler symbols for one event run in authored order. Handler arrays
  await each entry before running the next entry.
- Graph writes made during one framework-owned event turn are batched. They
  invalidate graph paths immediately, but DOM bindings update during the next
  flush point.
- The default flush point is a microtask scheduled by the first graph write in
  an otherwise idle turn. The runtime may also force an internal flush before it
  must observe updated DOM or finish an initial render/resume operation.
- A flush drains graph work until stable: recompute dirty sync computed nodes,
  discover newly dirty bindings, enqueue demanded binding symbols, and repeat
  until no synchronous graph work remains.
- DOM work produced during the flush is appended to a DOM mutation journal and
  applied after graph work settles for that flush.
- Nested writes during a flush are allowed. They extend the same flush when they
  are synchronous and schedule a later flush when they originate from async
  completion or a later event turn.
- Async computed invalidation creates a new request version, aborts the prior
  in-flight version when possible, marks dependent async state as pending, and
  schedules a flush for visible/demanded boundaries. Only the newest matching
  version may commit resolved or rejected state.
- Errors do not roll back graph writes that already committed. The error is
  routed to the nearest framework error boundary or app-level error hook, and
  any additional writes after the throwing/rejected handler entry do not run.

The DOM mutation journal may contain operations such as:

```txt
setText(text locator, value)
setAttr(element locator, name, value)
setProp(element locator, name, value)
insertRange(anchor locator, fragment)
removeRange(anchor locator)
moveRange(anchor locator, before locator)
runCleanup(behavior id)
```

The journal must never contain virtual element nodes, virtual child lists,
component render output, or "old tree/new tree" reconciliation records. It is a
batching and ordering mechanism for real DOM mutations, not an alternate UI
representation.

### Resume behavior

- One global delegated event listener (capture phase) from the resumer.
- Before importing handler symbols, the delegated listener evaluates any
  compiler-emitted sync event policy for the target/event. This is the only v1
  path for synchronous `preventDefault()` / `stopPropagation()` behavior. The
  policy reads the already-materialized graph data plane by ID; it does not load
  app chunks or execute component/handler code.
- First interaction: look up the ordered symbol list for that element/event,
  resolve each symbol through the generated symbol resolver, materialize its
  captured graph references and element handles, and run handlers in authored
  order. The resolver owns the dynamic import; event props are only encoded
  symbol IDs in `async/view`.
- Element handles resolve from serialized DOM locators at handler execution time.
  If the element was removed or the locator no longer matches, the handle reads
  as `undefined`.
- Element behaviors resolve from serialized DOM locators when the host element is
  connected in the browser. The resumer imports the behavior symbol,
  materializes its serialized inputs, runs the behavior with the element, and
  stores cleanup on the node. Behavior input changes clean up and rerun the
  behavior. Removed nodes clean up their behaviors before their locators are
  discarded.
- State writes during that run propagate through the graph and are flushed by
  the scheduler above; subscribed binding symbols are loaded on demand and
  update the DOM in place. Nothing re-renders; there is no component
  re-execution path in the browser runtime at all.
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
