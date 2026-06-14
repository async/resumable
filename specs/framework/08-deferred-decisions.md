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
- Streaming SSR / out-of-order flushing.
- Server functions / RPC story.
- Devtools (graph visualization).

## Build Order (high level)

1. Reactive runtime core (graph + object state + async node status/versioning) —
   pure TS, testable standalone.
2. Compiler: state rewriting + template codegen for client-side rendering (CSR
   mode first, to validate the language surface without serialization).
3. Async computed lowering + `@try`/`@pending`/`@catch` boundary lowering.
4. Closure extraction + capture analysis + diagnostics.
5. Server renderer + serialization + resumer; e2e resumability harness.
