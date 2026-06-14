# Proof Of Concept

This directory contains the complete proof implementation for the framework
design. It is intentionally runnable and testable, but it is not the production
package layout.

- `poc/fixtures/proofs/` contains executable-spec fixtures.
- `poc/packages/` contains the compiler/runtime/serializer/build proof packages
  that prove the design is possible.

Future framework implementation should begin in root `packages/*`. Use this POC
as evidence and regression material, not as the production source tree.
