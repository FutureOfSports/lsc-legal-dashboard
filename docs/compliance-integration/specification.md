# FSP app compliance integration

Updated: 6 October 2026. Manual source-feed implementation and deployment.
Executed deployment status belongs in the release receipt. Scope: the FSP app first, as confirmed by Anuj.

## Intended result

Inside Legal OS, answer: which obligations and policies should the FSP app
address, why, what evidence supports that conclusion, what remains unknown, and
who must act? Start from the app's actual source and the user-supplied fact of
Delaware incorporation. Do not ask the user to re-describe features found in code.

A finding must include its rule/source, triggering facts, missing facts,
applicability decision, required or proposed policy/control, implementation
evidence, owner and review date. A blank owner or unknown deadline stays blank.
Entity name and legal form require company evidence; the FSP arena code is not a
verified legal identity.

## Recommended open-source component

Use **CISO Assistant Community** as the framework/control/evidence engine,
connected to Legal OS through its REST API. Its Community edition is AGPLv3;
the repository's `enterprise/` directory has a separate commercial license.
Review the selected release, dependencies and framework-content licenses before
deployment. A service boundary is not a blanket exemption from license duties.

Community includes API access, custom frameworks, assessments, evidence, tasks
and basic permissions. Finer permissions, advanced webhooks and per-object audit
trails are paid features. Keep Legal OS authorization and its own activity
receipts authoritative; do not promise paid features as part of this integration.

Sources: [canonical project](https://github.com/intuitem/ciso-assistant-community),
[license](https://github.com/intuitem/ciso-assistant-community/blob/main/LICENSE.md),
[edition comparison](https://intuitem.com/compare).

Eramba's current [FAQ](https://www.eramba.org/faqs) describes restricted
source-available editions, and its [comparison](https://www.eramba.org/eramba-software)
places REST APIs in Enterprise. SimpleRisk Core is an open-source alternative,
but its current [integration instructions](https://support.simplerisk.com/kb/07-04-using-the-api-for-integrations)
require the API Extra. CISO Assistant is the clearer fit for this API integration.

None of these tools substitutes for a maintained legal applicability rule set.
Delaware corporate duties and product-specific obligations require custom,
source-backed rules. CISO framework selection follows those decisions.

## Evidence and decision flow

1. Read allowlisted files from `FutureOfSports/app-frontend` and the relevant
   `FutureOfSports/d_zero` app/backend paths. Pin the commit and file/line evidence.
   Exclude credentials, environment files, production records and unrelated code.
2. Record what the code demonstrates, with separate states for source signal,
   documented feature, executed test and verified deployment. An import, button,
   country selector or planned task does not prove production use.
3. Combine those signals with confirmed business facts. Actual user locations,
   consumer volumes, revenue, contracts and legal entity type are not inferred
   from feature code. Missing facts remain unknown and get narrowly scoped
   follow-up questions only when they affect a decision.
4. Evaluate versioned rules with explicit true/false/unknown predicates and
   effective dates. Store the exact profile revision, rule revision and source
   checked date. Future-effective laws must not be treated as already effective.
5. Present a proposed applicability decision with its reasoning. An authorized
   legal reviewer approves decisions; repository scans cannot certify compliance.
6. Synchronize approved requirements and control mappings with CISO Assistant.
   Show policy/evidence gaps, assign work and record test/review receipts in Legal
   OS. Requirement applicability and control completion are separate dimensions.
7. A relevant code, business-fact or legal-source change reopens the affected
   review. A stale decision must remain visible rather than silently disappearing.

Applicability states: `NEEDS_FACTS`, `LEGAL_REVIEW`, `APPLICABLE`,
`NOT_APPLICABLE`. An exclusion requires an evidenced reason and review date.
Control states: `NOT_ASSESSED`, `GAP`, `IN_PROGRESS`, `EVIDENCE_REVIEW`,
`VERIFIED`. Do not translate an existing registration `ACTIVE` status into legal
compliance, or treat missing requirements as a perfect score.

Every obligation also has a basis: law/regulation, contractual commitment,
payment-network obligation, or voluntary assurance. SOC 2 and ISO 27001 do not
become legal duties merely because the company is incorporated in Delaware.

## Initial rule-review coverage

This is an initial review set, not an exhaustive legal inventory or a conclusion
that any conditional law applies. Add jurisdictions as real operating facts are
confirmed. Keep corporate duties and application/product duties distinct.

| Review area | Facts needed and proposed policy work | Primary source |
| --- | --- | --- |
| Delaware entity obligations | Exact legal identity and entity form before choosing filing/tax rules or deadlines. | [Division of Corporations](https://corp.delaware.gov/paytaxes/), [alternative entities](https://corp.delaware.gov/alt-entitytaxinstructions/) |
| Privacy notice and state privacy rights | User location, data flows, processing volumes, revenue and sale/sharing facts. Incorporation alone does not establish DPDPA or CCPA coverage. | [Delaware statute](https://delcode.delaware.gov/title6/c012d/index.html), [Delaware DOJ](https://attorneygeneral.delaware.gov/fraud/personal-data-privacy-portal/frequently-asked-questions/), [California AG](https://oag.ca.gov/privacy/ccpa) |
| Children and teenagers | Distinguish under-13 COPPA triggers from 13–17 safeguards; inspect age gates, guardian verification, consent and ad treatment. | [FTC COPPA](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) |
| Nutrition and health data | Assess actual data categories, data sources, recipients, states and provider relationships. Fitness features do not by themselves establish HIPAA coverage. | [HHS app guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-apps/index.html), [FTC health breach rule](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0), [Washington AG](https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy) |
| Video and identification | Determine whether processing identifies people, which data is retained and the relevant jurisdictions. Ordinary video is not automatically a regulated biometric identifier. | [Illinois BIPA section 15](https://www.ilga.gov/legislation/ilcs/fulltext?DocName=074000140K15), [Delaware definitions](https://delcode.delaware.gov/title6/c012d/index.html) |
| Wallets, payments and prizes | Establish custody, real cash-out, processors, eligibility, paid entry, prize rules and locations. Send uncertain regulated activity for specialist review before assigning a license or declaring an exemption. | Source inventory first; attach activity-specific primary legal sources in the approved ruleset. |
| International markets | A country option or locale is not proof of targeting, establishment or user presence. Assess actual market and processing facts before adding EU/UK or other regimes. | [GDPR Article 3](https://eur-lex.europa.eu/eli/reg/2016/679/oj) |
| Security and assurance | Select a documented security baseline and separately record customer/processor commitments. | [NIST CSF](https://www.nist.gov/cyberframework), selected contractual sources |

## Fit with current Legal OS

The existing `compliance-agent.ts` monitors records and office renewals already
entered. `compliance-audit-agent.ts` aggregates existing record statuses. Neither
currently derives new statutory obligations from an app profile. Existing
`ComplianceRecord` is unique by legacy entity/jurisdiction/check type and cannot
alone express a versioned product applicability decision.

Add separate app-profile, sourced-fact, ruleset, assessment, decision and external
mapping records. Reference `EntityProfile`, policies, reviews and evidence rather
than duplicating their records. Granular scopes such as US state privacy need
explicit jurisdiction identifiers beyond the existing broad enum.

Legal OS remains the user interface and authorization boundary. Its server calls
CISO with a dedicated restricted account; no browser token or public iframe.
Persist external IDs and idempotency keys, show last successful synchronization,
and distinguish queued, delivered and failed updates. Begin with explicit pulls
and durable scheduled sync; advanced CISO webhooks are not assumed available.
Do not put raw app-user data or unreviewed private documents in the GRC engine.

Existing policy drafting remains subject to the paused generator and review
gates. This integration does not silently activate drafting or mark a policy
approved because a template exists.

## Acceptance before activation

- Select the UI after reviewing the isolated static options, as required by the
  user's mock-first rule. Keep the current B+C entity/Slack direction and one shell.
- Pin and test a Community release locally with synthetic data. Demonstrate API
  authentication, custom framework import, control/evidence reads and scoped
  writes; record actual responses, not only documentation.
- Verify unknown facts, contradictory inputs, future laws, exclusions and changed
  evidence cannot produce false applicable/verified states.
- Verify fresh Legal OS authorization, four-principal document boundaries,
  idempotent retries and evidence provenance through the real adapter.
- Run the existing release gate against the isolated verification database and
  an independent adversarial review before any deployment.
- Prepare a private GCP deployment, recovery plan and live acceptance checks.
  Runtime installation, credentials, synchronization and production findings are
  unverified at this design stage.

## Current release scope, 6 October 2026

Anuj authorized the complete implementation and initial source-backed publication.
Recurring AI reviews are deferred to a later Codex CLI setup. Implement human
source/fact updates and legal decisions now, retaining source limitations and
unknown facts. A manual delivery request can start the isolated CISO job without
creating a recurring schedule. Source catalogue requirements are review candidates,
not approved applicability decisions or verified controls.
