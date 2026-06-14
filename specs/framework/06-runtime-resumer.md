# Runtime Resumer

Client resume behavior, delegated event dispatch, graph writes, behavior setup, async invalidation, and shared patches.

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
  connected on the client. The resumer imports the behavior symbol, materializes
  its serialized inputs, runs the behavior with the element, and stores cleanup
  on the node. Behavior input changes clean up and rerun the behavior. Removed
  nodes clean up their behaviors before their locators are discarded.
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
