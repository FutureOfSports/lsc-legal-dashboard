# FSP compliance integration plan

Date: 5 October 2026. Scope: FSP app first. User asks to derive app facts from its
source. Follow [specification.md](specification.md) and the existing Legal OS
verification and document-access invariants. This release covers FSP compliance and US application hosting. Existing external
v2 integrations retain their own acceptance records.

- [x] CPL-01: Assess open-source tools, inspect FSP source, record evidence and
  unknowns, build and validate three static views, publish privately, obtain
  independent adversarial review, and stop for the user's selection.
  Executed evidence: [verification.md](verification.md). Anuj authorized the
  proposed implementation on 5 October 2026. Use the recommended applicability
  register with feature context and the legal review queue; preserve the B+C shell.
- [x] CPL-02: Pin CISO Assistant Community, verify its actual API locally with
  synthetic data, and implement a restricted adapter and durable sync receipts.
  Executed evidence: [verification-cpl02.md](verification-cpl02.md), including
  36 real Community API checks, actual TypeScript/outbox receipts, 18 database
  scenarios, additive migration acceptance and the full release gate. Production
  enablement and substantive approval linkage remain later tasks.
- [x] CPL-03: Add versioned app facts, source-backed applicability rules and legal
  review decisions, with three-valued evaluation and explicit effective dates.
- [x] CPL-04: Implement the selected Legal OS view and connect policy/evidence
  workflows without weakening existing access or generation boundaries.
- [x] CPL-05: Complete isolated release verification, independent review, initial
  source-backed publication with unresolved facts, private GCP installation and
  live acceptance. Recurring Codex CLI reviews are expressly deferred.
  Executed evidence: [local verification](verification-20261006.md) and
  [production deployment](deployment-20261006.md).

Complete all remaining authorized implementation and deployment work together.
A code scan is not a deployment test or legal sign-off. No task is complete
without its executed acceptance evidence. Recurring Codex CLI automation is
explicitly deferred by Anuj on 6 October 2026; publish the first manual feed now.
