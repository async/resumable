# Native TSRX Rust Parser

## Objective

Create a new `native-tsrx` project under the open-source folder and build a source-backed Rust/Oxc implementation plan into working software: a native TSRX parser/compiler foundation using Oxc crates, project-local Codex rules and skills, TDD fixtures from TSRX website examples, and TypeScript exposure.

## Original Request

Use GoalBuddy for a prompt to create a new open-source project called `native-tsrx`; gather the latest TSRX specification and examples from `tsrx.dev`; create a Rust crate using Oxc crates such as `oxc_parser` and `oxc_semantic`; inspect `https://github.com/Ripple-TS/ripple/tree/main/packages/tsrx`; create `.codex` rules and skills in the project before implementation based on the TSRX repo; inspect Erika's Satteri project at `https://github.com/bruits/satteri`; create rules and skills based on that work as well; expose the implementation back to TypeScript; then begin implementation with TDD, making each TSRX website example a test fixture; make sure `.codex` is `.gitignored`.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Jack and future contributors to `native-tsrx`
- Authority: `requested`
- Proof type: `test`
- Completion proof: A new `native-tsrx` project exists at `/Users/jacksm5pro/dev/open-source/native-tsrx`, `.codex/` is gitignored, project-local Codex rules/skills exist before parser implementation, Rust/Oxc parser code and TypeScript/NAPI exposure are implemented through TDD, and all captured TSRX website examples run as test fixtures.
- Goal oracle: A final Judge/PM audit can map source-backed research receipts, project scaffold files, `.codex` rule/skill files, parser implementation commits/diff, NAPI TypeScript API, and passing test commands back to the original request.
- Likely misfire: Creating a generic Rust parser crate or Oxc experiment that is not grounded in the latest TSRX website examples, the Ripple TSRX package behavior, and Satteri's relevant integration pattern.
- Blind spots considered: Sibling directory writes may require sandbox escalation; "latest" website and GitHub research must be done during `/goal`, not prep; Oxc native parser support may require AST compatibility tradeoffs; project-local `.codex` must be generated before implementation work; examples need durable fixture provenance.
- Existing plan facts: Create `/Users/jacksm5pro/dev/open-source/native-tsrx`; gather latest `tsrx.dev` specification and examples; inspect Ripple TSRX package; inspect Satteri; use Rust Oxc crates; expose back to TypeScript; create `.codex` rules and skills before implementation; use TDD; every TSRX website example becomes a fixture; `.codex` is gitignored.

## Goal Oracle

The oracle for this goal is:

`A source-backed `native-tsrx` Rust/Oxc project exists with `.codex/` gitignored, project-local Codex rules/skills generated before implementation, website examples captured as fixtures, native parser tests passing, and a verified TypeScript/NAPI entrypoint.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Run the user's plan as a continuous execution goal: first collect source-backed evidence from TSRX, Ripple, and Satteri; then validate architecture and sequencing; then create the new project and its `.codex` rules/skills before parser implementation; then implement native TSRX parsing and TypeScript exposure through TDD until the source-backed example fixtures pass.

## Non-Negotiable Constraints

- Do not implement parser behavior before creating project-local `.codex` rules and skills from the TSRX and Satteri research.
- Gather the latest TSRX specification and examples from `tsrx.dev` during `/goal`; do not rely only on memory.
- Inspect `https://github.com/Ripple-TS/ripple/tree/main/packages/tsrx` and preserve behavior-relevant facts before designing implementation slices.
- Inspect `https://github.com/bruits/satteri` and extract only relevant Rust/NAPI/unified-style integration lessons.
- Use Rust crates from the Oxc ecosystem where they fit, including `oxc_parser` and `oxc_semantic`.
- Expose the native implementation back to TypeScript.
- Use TDD for each native-tsrx implementation part.
- Treat every TSRX website example as a test fixture with source/provenance recorded.
- Ensure `.codex/` is listed in the new project's `.gitignore`.
- Creating `/Users/jacksm5pro/dev/open-source/native-tsrx` is outside the current writable root and may require an approved sandbox escalation.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software or automation and a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated fixture, parser rule, or package file. Put repeated same-shape work into one Worker package and review the package as a whole.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

A Worker should finish the whole assigned slice. A Judge should judge the whole assigned slice. A PM should reorient the board when tasks are safe but not moving the outcome.

Tiny tasks are allowed when the failure is isolated, the risk is high, the scope is unknown, or the tiny task unlocks a larger slice. Tiny tasks are bad when they keep happening, do not change behavior, only add wrappers/contracts/proof files, or avoid the real milestone.

## Canonical Board

Machine truth lives at:

`docs/goals/native-tsrx/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/native-tsrx/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
11. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
