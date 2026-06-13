# T009 Rolldown/Vite Integration Scout

## Recommendation

Use a staged integration path.

Stage 1 should be a userland JavaScript plugin that works in both Vite and
Rolldown-compatible build contexts:

- Match only `.tsrx` ids with hook filters.
- Use `transform` for dev and build compatibility.
- Call `native-tsrx` `compileModule` for dev transforms.
- Use `compileModules` inside build-oriented batching paths where module ids can
  be collected without breaking plugin semantics.
- Return executable JS/TSX code plus source-map scaffold.
- Emit or virtualize CSS from `CompileResult.assets.css`.
- Keep a backward-compatible id check inside handlers because Vite documents
  that hook filters are also supported by newer Rollup/Vite versions but older
  compatibility still needs handler-side guards.

Stage 2 should add a build-only Rolldown plugin route:

- Expose `nativeTsrxRolldownPlugin()` for direct Rolldown users.
- Allow Vite users to put the build-only plugin under
  `build.rolldownOptions.plugins` if they want it only during production build.
- Use the same compiler payload and benchmark it against the universal Vite
  plugin.

Stage 3 should explore a first-class Rolldown module type or native loader:

- Rolldown has experimental module types and plugin hooks can specify
  `moduleType` in `load` or `transform`.
- The long-term impressive path is `.tsrx` as a real module type or built-in
  loader so the Rust bundler can avoid repeated JS/NAPI crossings.
- This likely requires upstream API work or a contribution to Rolldown once
  native-tsrx has stronger source maps and conformance.

## Why This Path

Rolldown is designed as the future underlying bundler for Vite and aims to
replace Vite's esbuild/Rollup split with one Rust-based tool. It also supports
the Rollup/Vite plugin API, which makes a plugin the lowest-friction adoption
path.

Vite's plugin API invokes `resolveId`, `load`, and `transform` per module
request in dev, so `.tsrx` transforms must be aggressively filtered and cheap.
Vite also supports `handleHotUpdate`, which is the right later hook for precise
`.tsrx` HMR and CSS update handling.

Rolldown hook filters matter because they are evaluated on the Rust side before
calling JavaScript hooks. That is directly aligned with native-tsrx's goal:
avoid unnecessary JS/Rust boundary work.

## Benchmark Plan

Benchmark dimensions:

- Cold production build time.
- Warm production rebuild time.
- Vite dev server startup time.
- First request transform latency for `.tsrx` modules.
- HMR update latency for template-only changes.
- HMR update latency for style-only changes.
- Peak RSS and final RSS.
- NAPI call count.
- Output JS bytes.
- Output CSS bytes.
- Source-map bytes.

Benchmark variants:

- Baseline TSX app with equivalent hand-authored TSX.
- Existing JS `@tsrx/core` parser/transform when installed.
- Native `parseModule` only.
- Native `compileModule` per-file transform.
- Native `compileModules` batch transform.
- Future Rolldown module-type/native-loader route, once available.

Fixture sets:

- Current official website fixture corpus.
- Synthetic 100 component app.
- Synthetic 1,000 component app.
- Style-heavy app with many scoped classes.
- Control-flow-heavy app using `@if`, `@for`, and `@empty`.
- Dynamic-tag-heavy app.
- Invalid fixture set for diagnostic latency.

Measurement harness:

- Generate fixtures deterministically into a temporary benchmark directory.
- Run each benchmark variant with repeated iterations and warmup.
- Capture process timings with Node `performance.now()`.
- Capture memory with `process.resourceUsage()` and `process.memoryUsage()`.
- Count NAPI calls by wrapping public compile/parse functions in benchmark code.
- Persist JSON and Markdown reports under `docs/benchmarks/`.

## Risks And Upstream Blockers

- `@tsrx/core` is not installed locally, so JS-core comparisons must remain
  optional until the dependency is available with provenance.
- Source maps are still scaffolds, so Vite devtools/debugger quality cannot be
  fully proven yet.
- CSS output exists, but Vite dev CSS HMR semantics need real plugin work.
- Per-file Vite dev transforms still cross NAPI once per requested module.
  Batch APIs help build-mode and benchmark scenarios, but not every dev request.
- Rolldown module types are documented as experimental. A real `.tsrx` module
  type should wait until native-tsrx has stronger conformance and source maps.
- A Rust-native Rolldown plugin or built-in loader path may require upstream
  Rolldown API decisions.

## Candidate Worker Task

Use T010 as the next Worker:

Create benchmark fixtures and a native-vs-JS performance reporting harness for
`.tsrx` parsing/lowering, with deterministic fixture generation, per-file versus
batch native measurements, NAPI call counts, memory reporting, JSON/Markdown
benchmark outputs, and no dependency on private framework code.

## Sources

- Rolldown introduction and Vite direction: https://rolldown.rs/llms-full.txt
- Rolldown plugin hook filters: https://rolldown.rs/llms-full.txt
- Rolldown module types: https://rolldown.rs/llms-full.txt
- Vite Plugin API: https://vite.dev/guide/api-plugin.html
- Vite Performance guide: https://vite.dev/guide/performance.html
- Current native-tsrx package layout:
  `/Users/jacksm5pro/dev/open-source/native-tsrx/package.json`
  and `/Users/jacksm5pro/dev/open-source/native-tsrx/README.md`
