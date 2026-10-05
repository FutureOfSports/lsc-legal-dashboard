# FSP app source evidence

Assessed on 5 October 2026. Scope: FSP app first. These are read-only source
findings, not an authenticated production audit, legal opinion or finding of
violation. No app-user records, credentials or production settings were read.

## Pinned repositories

- `FutureOfSports/app-frontend`, `main`, commit
  `7a87e6326d24565dcc81a48aa46af5181cd2a23f`. Expo mobile/web port. Its README
  describes TestFlight setup still needed; repository presence does not prove
  public App Store distribution.
- `FutureOfSports/d_zero`, `main`, commit
  `b6a4d416e0dca151797eb8b8d6c7091a0399f027`. The repository identifies
  `packages/designer-spa` as the FSP web app and `packages/cloud` as its backend.
  [App identification](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/AGENTS.md#L143).

The inventory follows the actual app/backend paths instead of treating the
mobile port as the whole product. Unrelated monorepo products, including the
separate DPI yield vault, are outside this assessment. Source visibility is not
proof that a feature is deployed, enabled or used by customers.

## Product facts and their limits

| Area | Source signal | Evidence and unresolved facts |
| --- | --- | --- |
| Company | Footer text names Future of Sports Labs Inc. Delaware incorporation was supplied by Anuj. | [Footer](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/designer-spa/src/fsp-core/views/0271-s19-25-settings-4.html#L51). Corporate records, contracting identity and legal form remain unverified. |
| Sports platform | Video challenges, scoring, replay, leaderboards, arenas, matchups, rewards and profiles. | [Challenge controller](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/designer-spa/src/fsp-core/controllers/0627-showtakechallenge.js#L182). Live use and volumes were not inspected. |
| Children and teenagers | Canonical profile completion rejects under-13s. Ages 13–17 require server-owned verified guardian status. DOB is locked after capture; minor status cannot be self-downgraded. | [Server gate](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/users.js#L265). This is not evidence of an adults-only product or an end-to-end age-assurance test. |
| Guardian verification | Initial guardian account verification uses email agreement. Later payout/seat/host paths have separate identity and bank requirements. | [Guardian flow](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/settlement/guardianPortal.js#L35). Do not describe all guardians as government-ID verified. |
| Personal data | Name, email, DOB, gender, country, address, optional phone/social fields, media, device/session identifiers, consents and sports results appear in schemas/handlers. | [Profile fields](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/users.js#L190). Actual collection, recipients and retention need deployment and business evidence. |
| Geography | Country/currency support covers more than 50 countries, including the US, UK, EU countries, India, UAE, Canada and Australia. | [Country map](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/schemas/countryCurrencyMap.js#L8). This does not establish actual user residence, targeting or jurisdictional thresholds. |
| Paid entry | Stripe payment intents, identity/address collection, state eligibility and optional Stripe Tax appear in the entry flow. | [Payment handler](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/settlement/payments.js#L90). Stripe mode and transaction volumes remain unknown. |
| Player eligibility | The source restricts paid entry in AZ, AR, CT, DE, LA, MT, SD, TN and WA, with a legal-confirmation comment. | [Configured restriction list](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/settlement/geofence.js#L1). This is an implementation list, not verified legal advice. Delaware incorporation and Delaware player eligibility are separate questions. |
| Rewards and draws | FSP Bucks ledger and peer gifting, Golden Tickets and draw entries exist. Ticket purchase is explicitly test mode/test pricing. | [Wallet](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/wallet.js#L53), [draw entries](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/goldenTicketDrawEntries.js#L1). No finding of a live paid lottery or cash-redeemable FSP Bucks. |
| Cash payouts | Creator/captain payouts use Stripe Connect transfers and Express onboarding, with capability/balance/idempotency checks. | [Payout handler](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/payouts.js#L392). No crypto custody/transfer was found in the inspected app wallet/payout paths. |
| Identity and video | Stripe Identity document checks and sports video/pose processing exist. | [Identity session](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/services/stripe.js#L201). Document verification and pose processing do not alone establish identifying biometric templates. The file named biometricThrottle is an advertising-frequency limiter. |
| Nutrition | Registered authenticated backend handlers include food-camera/logs, water/protein, meal/day rollups and analytics events. | [Nutrition handler](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/nutrition.js#L1). No nutrition method calls were found in inspected designer-spa source. User-facing activation and any covered-entity relationship are unknown. |
| Advertising and analytics | Source enables player ad serving and disables advertiser dashboards. Analytics sends user ID and events to a GTM data layer and to Clarity. Clarity's identity label can fall back from handle/name to email. | [Analytics code](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/designer-spa/src/fsp-core/controllers/0002w-fsp-analytics.js#L1). GTM's deployed configuration and downstream transmissions were not captured; do not infer that every field reaches GA4. |
| Consent | Signup requires Terms/Privacy agreement and stores a server Terms timestamp; optional marketing and EU/UK adult ad choices appear in source. | [Signup choices](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/designer-spa/src/standalone/profile-setup.html#L754). Enforcement across every serving/analytics path remains unverified. |
| Public policies | Code links to futureofsports.io/terms and /privacy. | [Policy links](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/designer-spa/src/fsp-core/controllers/0436-script-s53-69-browse-arenas-57.js#L38). This audit has not reviewed the current published texts or reconciled them to actual processing. |
| Content safety | Authenticated report handlers include validation, deletion fencing, idempotency and rate limiting. | [Reporting handler](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/users.js#L859). A blocked-accounts UI comment says its backend is absent. This is not a comprehensive moderation assessment. |

## Priority control questions

1. **Data export:** the inspected authenticated request handler returns HTTP 423
   `data_export_requests_locked`; UI also labels it locked. Existing administrative
   request handling remains. Confirm alternate/manual request channels and the
   deployed build before deciding whether a legal-rights process is deficient.
   [Handler](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/handlers/accountDataRequests.js#L31).
2. **Account deletion:** a backend exists but has ownership/payout blocks and a
   media-provenance guard allowing only accounts proven never to have uploaded.
   The inspected settings delete button only displays a confirmation-email toast;
   no `deleteSelf` invocation was found in the inspected designer-spa source.
   Confirm generated/live wiring and operational alternatives. Retained financial,
   tax and consent records have separate handling, not blanket deletion.
   [UI](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/designer-spa/src/fsp-core/controllers/0434-script-s53-69-browse-arenas-55.js#L33),
   [lifecycle rules](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/cloud/lib/services/accountLifecycleService.js#L41).
3. **Advertising preferences:** inspected settings toggles change the DOM without
   a persistence call. Signup opt-in storage is separate. Trace deployed consent,
   serving and GTM behavior before concluding whether preferences are enforced.
   [Settings](https://github.com/FutureOfSports/d_zero/blob/b6a4d416e0dca151797eb8b8d6c7091a0399f027/packages/designer-spa/src/fsp-core/controllers/0434-script-s53-69-browse-arenas-55.js#L31).

These are source gaps or investigation targets, not adjudicated violations.
Code comments calling a retention period statutory do not prove the legal basis
or a universal retention period for all records.

## Applicability boundary

The initial review should cover corporate records/filings, privacy notices and
rights, children/teen safeguards, health-data handling if active, video and
identification, entry/reward/payout rules, international markets, security and
contractual assurance. [The specification](specification.md) records official
legal sources and the decision model. This list is not exhaustive.

Actual countries and resident counts, revenue thresholds, vendor contracts,
deployed flags/Stripe mode, company documents and manual rights procedures remain
unknown. Keep these facts unresolved until their evidence is supplied. Do not
label COPPA, HIPAA, BIPA, state privacy laws or money-transmission licensing as
applicable merely from a feature name. Do not label SOC 2 or ISO 27001 as
statutory duties. No compliance score is calculated at this stage.
