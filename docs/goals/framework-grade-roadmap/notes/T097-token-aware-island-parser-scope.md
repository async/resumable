# T097 Token-Aware Island Parser Scope

## Decision

Continue the framework-grade roadmap by replacing the fragile byte-scanning
core with a token-aware TSRX island parser while preserving the current
TSRX -> TSX -> Oxc architecture.

Do not build a standalone TypeScript parser. Oxc should remain the TypeScript
and JSX parser. The native TSRX layer should own TSRX-only syntax discovery,
directive/template boundaries, authored spans, source mappings, diagnostics,
and framework-facing extension AST/IR surfaces.

## Current Architecture Map

Current `parse_tsrx` flow in `native-tsrx/src/lib.rs`:

```text
source
  -> normalize_tsrx_for_oxc(source)
       -> transformed_source
       -> Vec<TsrxSyntax>
  -> TsrxModule::from_syntax(source, syntax)
  -> TemplateIr::from_tsrx_module(source, tsrx_ast)
  -> StyleModule::from_tsrx_module(source, filename, tsrx_ast)
  -> lower_tsrx_to_tsx_with_style_module(source, filename, style_module)
  -> oxc_parser::Parser(SourceType::tsx()).parse(transformed_source)
  -> oxc_semantic::SemanticBuilder
  -> native_early_error_diagnostics(source, tsrx_ast)
```

Useful surfaces already exist and should be preserved:

- `TsrxSyntax` legacy marker list.
- `TsrxModule` extension side table.
- `TemplateIr`.
- `StyleModule`.
- `LoweredModule` and source-map scaffolds.
- NAPI/TypeScript parse/analyze/compile APIs.
- Public framework adapter and plugin demos.

The weak point is the discovery/boundary layer:

- `normalize_tsrx_for_oxc` is a byte loop.
- `LexicalMode` only tracks comments, simple strings, and simple template
  quotes.
- JSX text/opening-tag context is inferred from `last_delimiter`.
- Directive, body, lazy-pattern, style, dynamic-tag, and prop-shorthand spans
  are recovered by multiple helper scans rather than one coherent token model.

## Fragility Cases To Fix

Token awareness is needed for correctness in these classes:

- TSRX markers inside JavaScript comments, strings, template literals, JSX
  text, JSX attributes, and JSX expression containers.
- JSX opening tags with quoted attributes, expression attributes, spreads, and
  nested braces before a prop shorthand candidate.
- Dynamic tags `<{expr}>` and `</{expr}>` only in JSX element-name position,
  not arbitrary `<{` byte pairs.
- Raw `<style>` only as a JSX style element, with quoted attributes handled
  before raw CSS capture.
- Directive headers and bodies with strings/comments/templates/braces inside
  tests, loop headers, catch parameters, and template blocks.
- `@else if`, `@empty`, `@pending`, and `@catch` clause association without
  relying only on raw source order.
- `@switch` cases. The current official fixture uses colon-style
  `@case 'loading': { ... }` and `@default: { ... }`; lowering supports this,
  while the AST-side `parenthesized_text_after` path is still biased toward
  parenthesized tests.
- Lazy `&{}` / `&[]` markers only in binding positions, with whitespace errors
  reported for `& {` and `& [` without false positives in JSX text.
- Recovery diagnostics that can point at authored `.tsrx` spans even when Oxc
  sees only the synthetic TSX source.

## Proposed Scanner Modes

The first implementation should introduce a small scanner module with explicit
state rather than expanding `last_delimiter` heuristics:

```text
Ts
LineComment
BlockComment
SingleString
DoubleString
TemplateQuasi
TemplateExpression
JsxText
JsxOpeningTag
JsxClosingTag
JsxAttribute
JsxAttributeString
JsxExpression
StyleRawText
```

The scanner should emit compact events/tokens with byte spans:

```text
trivia/comment/string/template ranges
tag open/close/self-close delimiters
JSX text ranges
JSX expression container ranges
style open/body/close ranges
TSRX marker candidates: @{, @if, @for, @switch, @case, @default, @try,
  @pending, @catch, &{, &[ , prop shorthand, dynamic tag name
delimiter tokens: (), {}, [], :, ;, comma
```

Implementation detail: the token/event model can remain internal. Public API
compatibility should keep returning `TsrxSyntax`, `TsrxModule`, `TemplateIr`,
and current compile outputs.

## Island Parser Responsibilities

The island parser should consume scanner events and produce:

- backwards-compatible `Vec<TsrxSyntax>`;
- a synthetic TSX source plan: marker replacements and blanked authored ranges;
- body/header/test/style spans for TSRX-specific extensions;
- clause relations for `else`, `empty`, `pending`, `catch`, `case`, `default`;
- native diagnostics for malformed TSRX syntax.

It should not parse full TypeScript expressions. Header/test spans can be
captured as source ranges and later delegated to Oxc by the existing synthetic
TSX parse. This preserves speed and avoids duplicating TypeScript grammar.

## Oxc Bridge Boundary

Keep the current bridge:

```text
TSRX source
  -> token-aware TSRX island parser
  -> transformed TSX-compatible source
  -> Oxc TSX parse + semantic checks
  -> merged diagnostics and framework model
```

The bridge contract for the first Worker:

- transformed source length must equal authored source length;
- all current fixture outputs and source-map offsets must remain stable unless
  a change is explicitly documented as fixing a spec mismatch;
- Oxc parse/semantic diagnostics must still remap to authored spans;
- public JSON surfaces should not break in the first slice.

## First Implementation Worker

Recommended next Worker:

Objective:

> Introduce an internal token-aware scanner module for TSRX syntax discovery and
> migrate `normalize_tsrx_for_oxc` to use it for the highest-risk marker
> contexts while preserving existing public parser/AST/IR/lowering behavior.

Allowed files:

- `/Users/jacksm5pro/dev/open-source/native-tsrx/src/lib.rs`
- `/Users/jacksm5pro/dev/open-source/native-tsrx/src/scanner.rs`
- `/Users/jacksm5pro/dev/open-source/native-tsrx/src/ast.rs`
- `/Users/jacksm5pro/dev/open-source/native-tsrx/tests/website.rs`
- `/Users/jacksm5pro/dev/open-source/native-tsrx/test/native-tsrx.test.mjs`
- `/Users/jacksm5pro/dev/open-source/native-tsrx/docs/spec-status.md`
- `docs/goals/framework-grade-roadmap/state.yaml`

Required behavior:

- Add scanner mode coverage for JSX opening tags, quoted attributes, expression
  containers, JSX text, simple TS comments/strings/templates, raw style bodies,
  and dynamic tag names.
- Keep `normalize_tsrx_for_oxc` offset-preserving.
- Preserve the legacy `TsrxSyntax` output shape.
- Add focused tests for false positives in JSX attributes and text, dynamic tag
  position, raw style capture, lazy markers in binding vs text, and colon-style
  switch case AST spans.
- Do not redesign lowering, CSS, NAPI, target adapters, or source-map schemas in
  this first slice.

Verify:

- `cargo fmt --manifest-path /Users/jacksm5pro/dev/open-source/native-tsrx/Cargo.toml --check`
- `cargo test --manifest-path /Users/jacksm5pro/dev/open-source/native-tsrx/Cargo.toml`
- `npm test --prefix /Users/jacksm5pro/dev/open-source/native-tsrx`

Stop if:

- the scanner requires a public AST/schema break;
- existing offset-preserving transformed-source guarantees cannot be maintained;
- Oxc parse/semantic diagnostics no longer map back to authored source;
- the slice expands into lowering/CSS/Rolldown work;
- verification needs unavailable dependencies or network access.

## Evidence

- Local roadmap: `/Users/jacksm5pro/dev/open-source/native-tsrx/docs/framework-grade-roadmap.md`
- Local spec status: `/Users/jacksm5pro/dev/open-source/native-tsrx/docs/spec-status.md`
- Current scanner core: `/Users/jacksm5pro/dev/open-source/native-tsrx/src/lib.rs`
- Current AST side table: `/Users/jacksm5pro/dev/open-source/native-tsrx/src/ast.rs`
- Official website fixtures under `/Users/jacksm5pro/dev/open-source/native-tsrx/fixtures/website`
- Current TSRX spec page: https://tsrx.dev/specification
- Current TSRX features page: https://tsrx.dev/features
- Current `@tsrx/core` package path: https://github.com/Ripple-TS/ripple/tree/main/packages/tsrx
