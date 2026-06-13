# T999 Roadmap Audit

Decision: not complete.

Full outcome complete: false.

## Proof Map

- Real native front-end / token-aware parser: incomplete. Current docs still
  describe the scanner as the first adapter slice and say future work should
  make it token-aware.
- First-class TSRX AST: partial. `tsrxAst.extensions` exists and is useful, but
  it is not yet a hierarchical AST with child relationships, template outputs,
  complete semantics, or generated schemas.
- Framework-neutral Template IR: partial. `templateIr` exists as a typed debug
  surface, but it is not yet a complete rendering IR with elements, fragments,
  nested children, attributes, target hooks, or lazy dependency metadata.
- Real lowering: partial. `loweredModule` handles statement containers, simple
  `@if`, simple `@for`, prop shorthand, and dynamic tags, but `@switch`,
  `@try`, lazy bindings, and production target lowering remain incomplete.
- Source maps and diagnostics: partial. Mapping scaffolds exist; production
  source maps, authored diagnostic labels, editor mappings, and stable node IDs
  remain missing.
- Native CSS pipeline: partial. `styleModule` extracts style blocks, scoped
  class names, class maps, emitted CSS, and simple diagnostics, but there is no
  CSS AST, minification, modern CSS lowering, `:global(...)`, or CSS maps.
- Public framework API: partial but meaningfully advanced. Public TS APIs and
  batch NAPI compile/parse surfaces exist, but the stable adapter ABI and real
  target packages do not.
- Rolldown/Vite path: partial. There is a staged integration plan and native
  parse/lowering benchmark harness, but no `.tsrx` plugin or module type yet.
- Conformance: partial. Official fixture reporting exists; `@tsrx/core` parity
  is optional and currently unavailable locally, and many invalid/source-map
  conformance layers remain missing.

## Missing Evidence

- Token-aware scanner or parser tests showing TSRX markers inside strings,
  comments, template literals, JSX text, and nested expression contexts are not
  misclassified.
- Complete hierarchical AST/IR snapshots.
- Complete lowering and target execution snapshots.
- Production source-map tests.
- CSS AST/scoping/minification tests.
- Rolldown/Vite plugin integration and cold/warm/HMR benchmark numbers.
- Installed or vendored `@tsrx/core` parity evidence.

## Next Task

T011 should target parser credibility without attempting a full parser rewrite:
add a lexical guard/token-aware scanner slice and regression fixtures so the
current native marker scanner skips strings, comments, template literals, and
ordinary JSX text before treating `@`, `&`, `<style>`, or dynamic tags as TSRX
syntax. This directly addresses the highest-priority remaining roadmap pillar
and creates a safer base for a later full parser split.
