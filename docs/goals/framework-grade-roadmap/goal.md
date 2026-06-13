# Framework-Grade Native TSRX Roadmap

## Objective

Turn the existing native-tsrx roadmap into an executable GoalBuddy board that
drives the project from a promising Oxc-backed normalizer toward a
framework-grade native TSRX compiler front-end for high-performance `.tsrx`
frameworks.

## Original Request

Jack asked for a GoalBuddy board for `framework-grade-roadmap`, based on the
research in `/Users/jacksm5pro/dev/open-source/native-tsrx/docs/framework-grade-roadmap.md`
and the conclusion that native TSRX is worth pursuing only if it graduates from
marker capture to a real TSRX AST, framework IR, lowering, source maps,
conformance, and Rolldown/Vite performance.

## Interpreted Outcome

A GoalBuddy board exists at `docs/goals/framework-grade-roadmap/state.yaml`
with a safe first active task, role-tagged follow-up tasks, and an oracle that
keeps execution aligned to the roadmap rather than another marker-only parser
prototype.

## Source Plan

The source roadmap identifies these required pillars:

- token-aware TSRX parser, not byte scanning
- first-class TSRX AST or extension side table
- framework-neutral template IR
- real lowering to executable TSX/JS
- source maps and authored-source diagnostics
- native CSS/style pipeline
- public framework adapter API
- Rolldown/Vite integration path
- conformance against `@tsrx/core`
- benchmarks proving native performance

## Goal Oracle

The goal is complete only when the roadmap has been converted into verified
implementation progress in `native-tsrx`: parser credibility, AST/tooling
contract, lowering MVP, framework adapter API, style/CSS handling, and
Rolldown/Vite performance evidence are either completed with receipts or
explicitly blocked with durable evidence and next decisions.

## Non-Negotiable Constraints

- Do not call marker capture alone "framework-grade".
- Preserve the Oxc-backed strategy: Oxc owns TypeScript/JSX; native TSRX owns
  TSRX extensions, AST/IR, lowering, diagnostics, and framework surfaces.
- Keep source evidence current against TSRX spec, `@tsrx/core`, Oxc, Rolldown,
  Satteri, and CSS tooling before major architecture decisions.
- Use bounded Worker slices with concrete verification.
- Do not mark complete without a final Judge/PM audit mapping receipts to the
  roadmap pillars.

## Likely Misfire

The main failure mode is adding more syntax markers and calling that progress
toward framework support. The board must pressure toward structured AST,
framework IR, real lowering, source maps, conformance, and performance proof.

## Run Command

```text
/goal Follow docs/goals/framework-grade-roadmap/goal.md.
```
