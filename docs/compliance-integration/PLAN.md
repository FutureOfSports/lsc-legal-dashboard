# FSP compliance integration plan

Date: 5 October 2026. Scope: FSP app first. User asks to derive app facts from its
source. Follow [specification.md](specification.md) and the existing Legal OS
verification and document-access invariants. This is separate from the remaining
v2 external integrations and GCP migration.

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
- [ ] CPL-03: Add versioned app facts, source-backed applicability rules and legal
  review decisions, with three-valued evaluation and explicit effective dates.
- [ ] CPL-04: Implement the selected Legal OS view and connect policy/evidence
  workflows without weakening existing access or generation boundaries.
- [ ] CPL-05: Complete isolated release verification, independent review, approved
  business-fact onboarding, private GCP installation and live acceptance.

Work on one unchecked task per run. A code scan is not a deployment test or legal
sign-off. No task is complete without its executed acceptance evidence.
