# Deferred Decisions

Known out-of-scope or later decisions. This file is not an implementation target list.

## Deferred Decisions

Deliberately out of scope for the first implementation plan, to be designed when
their prerequisites exist:

- Keeping imperative third-party state in sync after `onVisible` init (the
  `chart.update` problem), plus possible `onVisible` variants (idle trigger,
  `onHidden`).
- Async caching policy beyond "current dependency key", stale-while-revalidate
  UI, manual refresh/invalidation APIs, and prefetch policy.
- Writable `computed()` (optimistic state).
- Streaming SSR / out-of-order async boundary patching. The expected direction
  is documented below, but it remains out of scope for the first implementation
  plan.
- Server functions / RPC story.
- Devtools (graph visualization).
- OXC/Rust/native compiler backend or parser replacement. The first compiler
  implementation uses JS/TS with `@tsrx/core`; native migration comes only after
  the artifact contracts and behavior fixtures are proven.
- Standalone build/minify/transform stacks outside Rolldown or Vite. Do not add
  esbuild, terser, Rollup, SWC, webpack, Babel build pipelines, or similar tools
  as framework build dependencies unless this spec is deliberately reopened.

## Streaming SSR / Out-Of-Order Patching

Out-of-order streaming should extend the async boundary model instead of adding
a second authoring model. `@try` / `@pending` / `@catch` remains the semantic
async UI boundary. Streaming controls how pending, resolved, and rejected
boundary ranges are delivered; it does not expose streams to application source.

The expected author-facing coordination primitive is a compiler-known
`<Reveal>` host intrinsic:

```tsrx
<Reveal order="forwards" tail="pending">
  <ProfileSection />
  <InvoicesSection />
  <RecommendationsSection />
</Reveal>
```

`<Reveal>` is an initial-render runtime context, not a static cross-file
analysis feature. During initial render, compiled `@try` boundaries register
with the nearest active reveal context as their component bodies execute. The
renderer serializes the resulting group membership, order indexes, policy, async
boundary IDs, request versions, state deltas, view/wiring deltas, and DOM range
locators into the private render/resume protocol.

Reveal policy is scoped by nearest owner:

- `order="independent"` reveals each deferred boundary as soon as its current
  request version resolves.
- `order="forwards"` may start async work in parallel but reveals sibling
  boundaries in source/render registration order.
- `order="together"` reveals the group only when every member needed for the
  current pass is ready.
- `tail="pending" | "hidden" | "collapsed"` controls how unresolved later
  members appear while earlier members reveal.

Nested `<Reveal>` scopes own their inner boundaries and prevent those boundaries
from participating as separate members of an outer reveal group. A boundary
without `@pending` is blocking by default because there is no pending shell to
flush.

Native browser out-of-order HTML patching such as `<template for>` may become a
transport backend for emitted boundary segments when broadly available. It must
not become the framework source of truth. The source of truth remains the TSRX
semantic graph, async computed versions, reveal group records, state arena, and
view/wiring arena. Unsupported browsers and hosts can use a framework patch
transport or fall back to non-streaming initial render.

## Build Order (high level)

1. Reactive runtime core (graph + object state + async node status/versioning) —
   pure TS, testable standalone.
2. Compiler in JS/TS on `@tsrx/core`: pass-boundary artifacts for TSRX semantic
   graph collection, state rewriting, template/view lowering, and diagnostics
   before any end-to-end demo path.
3. Async computed lowering + `@try`/`@pending`/`@catch` boundary lowering.
4. Closure extraction + capture analysis + diagnostics.
5. Unified render/resume runtime + serialization; e2e resumability harness.
