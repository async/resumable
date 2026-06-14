---
name: async-await-implementation
description: "Use when implementing the @async/resumable TSRX framework: compiler passes, state graph runtime, resumability payloads, unified render/resume behavior, event/symbol behavior, build plugins, package scripts, or tests. Enforces test-driven development, the split framework specs, TSRX-only no-hydration/no-VDOM model, JS/TS compiler on @tsrx/core first, runtime-agnostic ESM, Rolldown/Vite-only build tooling, and junior/AI-friendly diagnostics."
---

# Async Resumable Implementation

## Before Editing

1. Run `git status --short` and inspect relevant diffs. Preserve user changes.
2. Read [AGENTS.md](../../../AGENTS.md) and [specs/framework-design.md](../../../specs/framework-design.md), then the narrow spec files for the current task.
3. Add or update the closest focused failing test before implementation. Run it and confirm it fails for the expected reason.
4. Implement the smallest vertical slice that proves behavior. Avoid future infrastructure unless the active spec requires it.
5. Use `apply_patch` for manual edits.

## Core Model

- TSRX-only. Do not add TSX/JSX support or reactive behavior in plain `.ts` files.
- No hydration. Component bodies execute during initial render, not during browser resume.
- No VDOM. Runtime graph records state/dataflow and DOM binding locators, not virtual element trees or render-output snapshots.
- Do not create a standalone `server` package. Initial render and browser resume are phases of one unified runtime/render model.
- Treat monorepo libraries as internal implementation boundaries until tests prove what should be public. Keep consumers on the main package and curated re-exports; do not document deep package APIs prematurely.
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

- Core packages must be runtime-agnostic ESM. Avoid `node:*`, `fs`, `path`, `process`, `Buffer`, and Node-only assumptions in shared compiler/runtime/serializer/render-resume code.
- Use host adapters for file access, module resolution, environment data, hashing, dev-server hooks, and other runtime-specific capabilities.
- Prefer Web APIs and portable libraries. Use `pathe` for filesystem-like path work and `ufo` for URL/pathname/query work.
- Build the repo as a pnpm workspace and vite-plus monorepo with multiple libraries. `package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` own the workspace/dependency source of truth; vite-plus is the preferred command/tooling surface for build/test/check/format/lint.
- The completed proof implementation lives under `poc/packages/*`; do not extend it when beginning production framework work unless the task is explicitly POC maintenance.
- Initial production package folders are `packages/resumable`, `packages/core`, `packages/protocol`, `packages/runtime`, `packages/serializer`, `packages/compiler`, `packages/rolldown`, `packages/vite`, and `packages/test-utils`. `packages/resumable` is the main package for `@async/resumable`; the rest are internal boundaries until tests prove what should become public. Do not create `packages/server`.
- Use QDS/qwik-bundler as root vite-plus config and multi-lib/plugin structure references. Use Witness for pipeline/HMR proof behavior only, not as a workspace-structure reference.
- Package/library builds should be vite-plus `pack` configs; prefer `vp pack`, `vp test`, `vp check`, `vp fmt`, `vp lint`, and `vp config` directly.
- pnpm scripts should be thin aliases that invoke vite-plus commands; do not replace vite-plus as the default tooling surface with custom script stacks.
- Do not introduce another primary workspace package manager. The repo's monorepo/package-manager model is pnpm.
- Use vite-plus-managed test, format, and lint tooling, including Vitest and oxfmt/oxlint-style behavior exposed through `vp`.
- Build scripts and production optimization go through Rolldown or Vite only. Do not add esbuild, terser, Rollup, SWC, webpack, Babel build pipelines, or similar secondary transformers/minifiers.
- Generated code should use standard ESM and `import()`. The build manifest provides normalized symbol URLs/specifiers.

## Testing Rules

- Use test-driven development for behavior changes: write the failing test, run the narrow command, implement, rerun.
- Start with pass-boundary TDD before end-to-end browser demos. Preferred order: TSRX semantic graph, state lowering, payload arena planning, symbol resolver planning, runtime graph, browser resume.
- Each pass should emit or expose a human-readable artifact that the next layer consumes. Do not hide contract decisions only inside generated code or browser behavior.
- Proof fixtures live under `poc/fixtures/proofs/` and proof implementation packages live under `poc/packages/*`. They are executable specs and design evidence, not production framework packages. Start with `resume-basic`, `state-lvalues`, `sync-event-policy`, `payload-locators`, `symbol-resolver`, `serializer-values`, `scheduler-journal`, and `bundler-pipeline`.
- Start each proof through GoalBuddy prompt/prep first, then run the generated `/goal`. One proof goal owns one `poc/fixtures/proofs/<name>/` directory.
- Unit and integration tests should use vite-plus (`vp test`) once the package exists.
- Component/browser tests should use Vitest browser mode, modeled after `/Users/jacksm5pro/dev/open-source/vitest-browser-qwik` and adapted for this framework.
- Pipeline/HMR/build-behavior tests should use `/Users/jacksm5pro/dev/open-source/witness` so the Vite/Rolldown pipeline produces receipts.
- For bundling behavior, model plugin structure and fixture coverage after `/Users/jacksm5pro/dev/open-source/qwik-bundler`, using its `src` and `fixtures` patterns but not its router plugin.

## Verification

- Run the narrowest tests that exercise the changed pass/runtime behavior.
- For spec-only edits, run `git diff --check`.
- Before finishing, scan the diff for accidental hydration, VDOM, Node-only API, or non-Rolldown/Vite build-tool assumptions.
