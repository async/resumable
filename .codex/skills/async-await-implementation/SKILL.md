---
name: async-await-implementation
description: "Use when implementing the async-await TSRX framework: compiler passes, state graph runtime, resumability payloads, server renderer, resumer, event/symbol behavior, build plugins, package scripts, or tests. Enforces test-driven development, the split framework specs, TSRX-only no-hydration/no-VDOM model, JS/TS compiler on @tsrx/core first, runtime-agnostic ESM, Rolldown/Vite-only build tooling, and junior/AI-friendly diagnostics."
---

# Async Await Implementation

## Before Editing

1. Run `git status --short` and inspect relevant diffs. Preserve user changes.
2. Read [AGENTS.md](../../../AGENTS.md) and [specs/framework-design.md](../../../specs/framework-design.md), then the narrow spec files for the current task.
3. Add or update the closest focused failing test before implementation. Run it and confirm it fails for the expected reason.
4. Implement the smallest vertical slice that proves behavior. Avoid future infrastructure unless the active spec requires it.
5. Use `apply_patch` for manual edits.

## Core Model

- TSRX-only. Do not add TSX/JSX support or reactive behavior in plain `.ts` files.
- No hydration. Component bodies execute on the server, not on client resume.
- No VDOM. Runtime graph records state/dataflow and DOM binding locators, not virtual element trees or render-output snapshots.
- `state()` and `computed()` are compiled graph bindings. Reads/writes lower through the graph while preserving JavaScript behavior for supported forms.
- Lazy handler and binding code resolves through the generated symbol resolver. Authored event props do not become DOM event closures.
- Sync event policy is the only v1 path for synchronous `preventDefault()` / `stopPropagation()`. It may read already-materialized graph state by ID; it must not import app chunks.
- DOM and runtime resources belong in host element behavior via `use={...}`, not in serialized state.

## Compiler Rules

- Build the first compiler in JS/TS on `@tsrx/core`.
- Do not start with OXC, Rust, or a native compiler backend. Keep artifact contracts backend-neutral so OXC can replace internals later.
- Structure compiler work as cooperating mini-compilers with typed artifacts: TSRX semantic graph, state lowering, async dependency extraction, sync event policy, capture analysis, template/view lowering, payload arena planning, symbol resolver planning, and final emit.
- Prefer pass-level fixture tests over only final bundle snapshots.
- Keep intermediate artifacts human-readable and easy for agents to inspect.
- Treat diagnostics as product behavior. Include source span, short reason, allowed alternatives, and the suggested fix.

## Runtime And Build Rules

- Core packages must be runtime-agnostic ESM. Avoid `node:*`, `fs`, `path`, `process`, `Buffer`, and Node-only assumptions in shared compiler/runtime/serializer/server-renderer code.
- Use host adapters for file access, module resolution, environment data, hashing, dev-server hooks, and other runtime-specific capabilities.
- Prefer Web APIs and portable libraries. Use `pathe` for filesystem-like path work and `ufo` for URL/pathname/query work.
- Build the repo as a vite-plus monorepo with multiple libraries and a root `vite.config.ts` using `defineConfig` from `vite-plus`, modeled after the QDS and qwik-bundler configs.
- Package/library builds should be vite-plus `pack` configs; package scripts should use `vp pack`, `vp test`, `vp check`, `vp fmt`, `vp lint`, and `vp config`.
- Use vite-plus-managed test, format, and lint tooling, including Vitest and oxfmt/oxlint-style behavior exposed through `vp`.
- Build scripts and production optimization go through Rolldown or Vite only. Do not add esbuild, terser, Rollup, SWC, webpack, Babel build pipelines, or similar secondary transformers/minifiers.
- Generated code should use standard ESM and `import()`. The build manifest provides normalized symbol URLs/specifiers.

## Testing Rules

- Use test-driven development for behavior changes: write the failing test, run the narrow command, implement, rerun.
- Unit and integration tests should use vite-plus (`vp test`) once the package exists.
- Component/browser tests should use Vitest browser mode, modeled after `/Users/jacksm5pro/dev/open-source/vitest-browser-qwik` and adapted for this framework.
- Pipeline/HMR/build-behavior tests should use `/Users/jacksm5pro/dev/open-source/witness` so the Vite/Rolldown pipeline produces receipts.
- For bundling behavior, model plugin structure and fixture coverage after `/Users/jacksm5pro/dev/open-source/qwik-bundler`, using its `src` and `fixtures` patterns but not its router plugin.

## Verification

- Run the narrowest tests that exercise the changed pass/runtime behavior.
- For spec-only edits, run `git diff --check`.
- Before finishing, scan the diff for accidental hydration, VDOM, Node-only API, or non-Rolldown/Vite build-tool assumptions.
