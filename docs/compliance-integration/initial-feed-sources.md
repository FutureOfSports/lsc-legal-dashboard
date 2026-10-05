# FSP initial compliance feed source receipt

Prepared on 6 October 2026 in Asia/Kolkata, which was 5 October 2026 UTC.
Machine-readable `checkedAt` dates use 5 October 2026 UTC; human check references
use 6 October 2026 in the operator timezone. This is the first sourced review queue
for the FSP app, not an approved legal opinion, certification, or complete global
legal inventory. The feed contains 30 review items, 42 facts and 53 source
references. It is intended for the authorized legal team inside Legal OS.

## Scope and evidence

The user confirmed FSP-first scope and Delaware incorporation. A certificate,
registered number, exact contracting identity and entity form have not been
verified. A footer saying Inc. is not substituted for corporate evidence.

GitHub API reads used the existing `ototoanuj` account without changing the
shared active account. No credentials or app-user records were exported.

| Repository | Ref verified on 6 October 2026 | Result |
| --- | --- | --- |
| FutureOfSports/d_zero | `967d14f004fa5d090f409f24546c72ebf7b1b54d` | Seven commits beyond the 5 October inventory pin. The comparison changed node and captain-front-end files, plus their documentation. No inventoried designer-spa, cloud or schemas paths changed. |
| FutureOfSports/app-frontend | `7a87e6326d24565dcc81a48aa46af5181cd2a23f` | Main remains at the prior inventory pin. Mobile/store publication is unverified. |

The feed carries exact pinned path links. The existing
[source inventory](source-evidence.md) supplies the broader app evidence. Fresh
reads also rechecked profile/guardian gates, export requests, privacy settings,
paid-entry state restrictions and draw-entry code. These remain source signals.
The other inventoried files were carried forward after the unchanged-path diff,
not misrepresented as a new line-by-line audit of the entire monorepo.

The public app returned HTTP 200 for unauthenticated HTML. No browser login,
production user query, live payment, guardian verification, rights request or
moderation case was executed. This check does not match the running backend to
the repository commit.

## Publication and legal decision boundaries

- The initial evaluator result at 5 October 2026 UTC is 29 `NEEDS_FACTS` and one
  `LEGAL_REVIEW` item. The latter proposes the voluntary NIST CSF 2.0 baseline.
- No initial item is `APPLICABLE`, `NOT_APPLICABLE` or control `VERIFIED`.
  Each law/processor applicability decision has an explicit unknown business
  scope predicate. Source-feature presence is contextual and is not a condition
  in statutory triggers. Removing source code cannot establish a legal exemption.
  TRUE means the substantive scope condition is met, not just that facts have
  been collected. Code existence is not proof of activation or legal scope.
- The `reviewOn` value, 21 October 2026, is a proposed manual source/fact refresh
  date, 15 calendar days after the check. It is not a statutory deadline, a
  reviewer assignment or proof a scheduled task exists. The user deferred
  recurring automation to a later Codex CLI setup.
- Where an effective date was not verified for the rule as scoped, it remains
  null and the evaluator records unknown timing. A null date does not mean the
  law is not in force. Reviewers must resolve this before final signoff.
- Corporate filing deadlines, incident notice dates, consumer request deadlines,
  policy owners and completion evidence are deliberately not invented.
- Rules include law, contracts, processor terms and voluntary assurance as
  separate bases. Processor SDK success is not written product acceptance.
  A control suggestion is not a conclusion that its implementation is missing.
- New evidence should create a new version and preserve the previous review.
  Approved findings need fresh source-backed human decisions; this import must
  not bypass the approval/evidence boundary before CISO synchronization.

## Priority investigations

1. Determine paid contest, draw and wallet mechanics and obtain processor
   classification. The state blocklist in code and test-mode payments do not
   establish legal or processor approval.
2. Prove age/guardian behavior and advertising consent in the deployed product.
   The source includes teen access and analytics identity fields, including an
   email fallback. No live disclosure is asserted from that source alone.
3. Prove operational access/export/deletion channels. A refreshed code path
   returns a locked export response, while an inspected deletion control shows
   a toast. Manual channels or other live wiring could change the conclusion.
4. Establish corporate identity, actual user/worker jurisdictions and aggregate
   privacy thresholds. This controls which jurisdiction-specific reviews follow.
5. Reconcile the currently published notices and terms with actual processing,
   charges, rights and retention before approving them.

## Current-law checks that affect the feed

The [California threshold notice](https://cppa.ca.gov/announcements/2024/20241217.html)
updates the CCPA revenue criterion from 1 January 2025. The feed does not use the
old USD 25 million figure. The [amended COPPA rule](https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm)
has a general compliance date of 22 April 2026 and a distinct effective date of
23 June 2025. Under-13 scope is kept separate from teen safeguards.

The [Delaware statute](https://delcode.delaware.gov/title6/c012d/index.html)
publishes current and 1 January 2027 versions together. FSP-030 is explicitly a
future preparation item. The [FinCEN guidance](https://www.fincen.gov/news/news-releases/fincen-removes-beneficial-ownership-reporting-requirements-us-companies-and-us)
currently exempts US-created entities from BOI reporting; no automatic domestic
BOI filing task is created. Entity form still needs documentary verification.

The [Stripe policy](https://stripe.com/legal/restricted-businesses) includes
prize-bearing skill/chance activities and certain entry fees. FSP-017 requires
accurate product-specific written classification. It does not claim that calling
a format a skill competition is sufficient permission.

## Retrieval limits

- The public `/privacy` and `/terms` content was not retrieved. Web fetch failed;
  initial direct requests timed out; repeated apex and www requests returned
  HTTP 403. Their source entries record this. This is not proof the policies
  are missing or inaccessible to normal users.
- Illinois BIPA section 15 direct fetch failed; official indexed section text
  was retrieved through search. FSP-015 requires full current-act verification
  before an applicability decision or control approval.
- The direct legislation.gov.uk PECR regulation endpoint could not be parsed by
  the web tool. The cited ICO page was read. Current commencement and exemptions
  must be checked when deciding the actual cookie/advertising flows.
- One Washington AG page was blocked; the Washington legislature's complete
  RCW 19.373 chapter was successfully read instead.
- A DOL page references 2026 proposed rulemaking. The feed does not treat that
  proposal as a final rule. Worker decisions require current federal/state review.
- The IRS instruction endpoint exposed a December 2026 revision, later than the
  assessment date, while a general form page retains older threshold language.
  No fixed 2026 prize/contractor-reporting threshold was seeded. Review the actual
  tax year, operative law and reporting allocation before entering requirements.
- The initial jurisdictions are a triage set. They do not exhaust US states,
  international markets, payment regulation, child-safety reporting, employment,
  competition or tax law. Confirmed markets generate additional sourced rules.

## Coverage index

| ID | Review item | Basis | Initial decision |
| --- | --- | --- | --- |
| FSP-001 | Confirm entity identity and filing calendar | LAW | NEEDS_FACTS |
| FSP-002 | Determine Delaware privacy applicability | LAW | NEEDS_FACTS |
| FSP-003 | Determine CCPA applicability and rights | LAW | NEEDS_FACTS |
| FSP-004 | Build the remaining US state privacy matrix | LAW | NEEDS_FACTS |
| FSP-005 | Review COPPA scope and age assurance | LAW | NEEDS_FACTS |
| FSP-006 | Review teen privacy and guardian safeguards | LAW | NEEDS_FACTS |
| FSP-007 | Assess EU and UK market obligations | LAW | NEEDS_FACTS |
| FSP-008 | Verify advertising consent and preference enforcement | LAW | NEEDS_FACTS |
| FSP-009 | Prove access, export, deletion and appeal handling | LAW | NEEDS_FACTS |
| FSP-010 | Approve a category-specific retention schedule | LAW | NEEDS_FACTS |
| FSP-011 | Review vendors, processors and international transfers | CONTRACT | NEEDS_FACTS |
| FSP-012 | Assess Washington consumer health data | LAW | NEEDS_FACTS |
| FSP-013 | Resolve HIPAA role before making claims | LAW | NEEDS_FACTS |
| FSP-014 | Assess FTC health breach notification coverage | LAW | NEEDS_FACTS |
| FSP-015 | Determine biometric and identity-data obligations | LAW | NEEDS_FACTS |
| FSP-016 | Classify each paid contest, draw and prize | LAW | NEEDS_FACTS |
| FSP-017 | Obtain processor acceptance for competition payments | PROCESSOR | NEEDS_FACTS |
| FSP-018 | Classify wallet custody, transfers and redemption | LAW | NEEDS_FACTS |
| FSP-019 | Map prize, creator and payment tax reporting | LAW | NEEDS_FACTS |
| FSP-020 | Reconcile consumer terms, privacy promises and refunds | LAW | NEEDS_FACTS |
| FSP-021 | Screen any recurring subscriptions or trials | LAW | NEEDS_FACTS |
| FSP-022 | Review user-content rights and takedown handling | LAW | NEEDS_FACTS |
| FSP-023 | Review child access, reporting and moderation duties | LAW | NEEDS_FACTS |
| FSP-024 | Review physical challenge safety and waivers | ASSURANCE | NEEDS_FACTS |
| FSP-025 | Assess accessibility and verify critical journeys | LAW | NEEDS_FACTS |
| FSP-026 | Adopt and test a security baseline | ASSURANCE | LEGAL_REVIEW |
| FSP-027 | Build and test incident response and notification | LAW | NEEDS_FACTS |
| FSP-028 | Review marketing consent and sponsored claims | LAW | NEEDS_FACTS |
| FSP-029 | Review workforce and creator classification | LAW | NEEDS_FACTS |
| FSP-030 | Prepare for Delaware privacy amendments effective 2027 | LAW | NEEDS_FACTS |

## Source register

The JSON retains each source ID, link, check date, kind and any limitation note.
The following primary external references support the review rules. Repository
and public-policy retrieval records are linked individually in the feed.

| Source ID | Primary reference |
| --- | --- |
| `de-corp` | [Delaware corporate annual report and franchise tax](https://corp.delaware.gov/paytaxes/) |
| `de-alt` | [Delaware LLC/LP/GP tax instructions](https://corp.delaware.gov/alt-entitytaxinstructions/) |
| `boi` | [FinCEN: US-created entities exempt from BOI reporting](https://www.fincen.gov/news/news-releases/fincen-removes-beneficial-ownership-reporting-requirements-us-companies-and-us) |
| `dpdpa` | [Delaware Personal Data Privacy Act, Title 6 Chapter 12D](https://delcode.delaware.gov/title6/c012d/index.html) |
| `ccpa` | [California AG: CCPA applicability and consumer rights](https://oag.ca.gov/privacy/ccpa) |
| `ccpa-threshold` | [California CPPA: monetary thresholds from 1 January 2025](https://cppa.ca.gov/announcements/2024/20241217.html) |
| `tx-privacy` | [Texas AG: consumer privacy rights](https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights) |
| `coppa` | [FTC COPPA scope and compliance FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) |
| `coppa-2025` | [COPPA amended rule, 90 FR 16918](https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm) |
| `gdpr` | [EU GDPR, Articles 3, 5, 6, 12-22, 28, 32-35 and 44-49](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng) |
| `ico-cookies` | [ICO: cookies and similar technologies](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/) |
| `wa-health` | [Washington My Health My Data Act, RCW 19.373](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373&full=true) |
| `hipaa` | [HHS: resources for mobile health app developers](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-apps/index.html) |
| `hbnr` | [FTC: Health Breach Notification Rule guidance](https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0) |
| `bipa` | [Illinois BIPA section 15](https://www.ilga.gov/legislation/ilcs/fulltext?DocName=074000140K15) |
| `fl-contests` | [Florida Statutes section 849.094, game promotions](https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0849/Sections/0849.094.html) |
| `stripe-restrictions` | [Stripe prohibited and restricted businesses](https://stripe.com/legal/restricted-businesses) |
| `fincen-msb` | [FinCEN: money services business registration and definitions](https://www.fincen.gov/resources/money-services-business-msb-registration) |
| `irs-misc` | [IRS: Form 1099-MISC, prizes and awards](https://www.irs.gov/forms-pubs/about-form-1099-misc) |
| `irs-k` | [IRS: understanding Form 1099-K](https://www.irs.gov/businesses/understanding-your-form-1099-k) |
| `ftc-act` | [FTC Act section 5, unfair or deceptive practices](https://www.ftc.gov/legal-library/browse/statutes/federal-trade-commission-act) |
| `rosca` | [FTC: Restore Online Shoppers Confidence Act](https://www.ftc.gov/legal-library/browse/statutes/restore-online-shoppers-confidence-act) |
| `copyright` | [US Copyright Office: copyright rights and permission](https://www.copyright.gov/what-is-copyright/) |
| `dmca` | [US Copyright Office: section 512 safe harbors](https://www.copyright.gov/512/) |
| `ofcom` | [Ofcom: protection of children duties](https://www.ofcom.org.uk/online-safety/protecting-children/protection-of-children-duties-under-the-online-safety-act) |
| `ada` | [US DOJ: web accessibility and the ADA](https://www.ada.gov/resources/web-guidance/) |
| `nist-csf` | [NIST Cybersecurity Framework 2.0 release](https://www.nist.gov/news-events/news/2024/02/nist-releases-version-20-landmark-cybersecurity-framework) |
| `ftc-security` | [FTC: protecting personal information](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business) |
| `de-breach` | [Delaware Title 6 Chapter 12B, security and breach notices](https://delcode.delaware.gov/title6/c012b/index.html) |
| `can-spam` | [FTC: CAN-SPAM compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) |
| `endorsements` | [FTC: endorsement guides and material connections](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking) |
| `irs-workers` | [IRS: employee or independent contractor classification](https://www.irs.gov/businesses/small-businesses-self-employed/independent-contractor-self-employed-or-employee) |
| `dol-workers` | [DOL: worker classification guidance and 2026 rulemaking](https://www.dol.gov/agencies/whd/flsa/misclassification/small-entity-compliance-guide) |

## Verification

The repository's actual `parseFeed` and `evaluateFeed` functions accepted the
JSON using explicit assessment dates of 5 October 2026 UTC and 6 October 2026. All source IDs and
rule fact references resolve. The future-dated item remains future. This verifies
feed integrity and initial state handling, not the truth of unresolved business
facts, provider synchronization or deployment. Deployment acceptance belongs in
the release receipt.

JSON SHA-256: `a1e1e5b13df19cabc003465c2e1c37602e556481fe7271ddb29bef38d070571f`.
