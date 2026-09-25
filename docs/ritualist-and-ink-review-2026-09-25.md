# The Ritualist and ink — pre-submission audit, 2026-09-25

**Current status after live testing:** [Embed PR #223](https://github.com/ssmusic/Ink-Shopify-Dashboard/pull/223) and [backend PR #168](https://github.com/ssmusic/ink-backend/pull/168) are merged and deployed. Backend Firebase `api` version 254 was active, `/health` returned `ok`, and [Cloud Run deployment run 36144874260](https://github.com/ssmusic/Ink-Shopify-Dashboard/actions/runs/36144874260) passed both app jobs and HTTP smoke checks. Ritualist revision `shopify-app-00434-g24` and ink revision `ink-app-00099-bmr` received 100% traffic. The ranked findings and coverage table below describe the **pre-fix audit**. Use [the live walkthrough](./live-walkthrough-2026-09-25.md) and [Claude's current handoff](./CLAUDE-AUDIT-HANDOFF-2026-09-25.md) for the post-release results and remaining gates.

The post-release authenticated checks and exact remaining gates are tracked in [the live walkthrough](./live-walkthrough-2026-09-25.md).

On PR #223, GitHub's `check`, `container-node`, and `merge-gate` checks passed. PR #168 has no configured GitHub checks; its local backend suite passed 1,206 tests with one skip.

**Recommendation: treat this as an audit, not submission clearance.** The post-release walkthrough verified billing, installation and reinstall, privacy erasure on synthetic fixtures, signed webhooks, and downloaded records. The Ritualist is still Critical/Paused in Partner Dashboard with “Fix requirement issues—check your email for details”; Ink is Draft with missing listing media and reviewer screencast. No app submission or listing-media upload was made in this audit.

Embed source: origin/main `2c4cf2c8fa5451af8d3c822daa1f011f7810fbea`, isolated branch `codex/audit-both-apps-2026-09-25`. Backend source: `92b6cfa81cd23fca5d6bba04173c0c879606d925`. Paths prefixed E below are relative to the embed; B means `ink-backend/ink-firebase/functions`. Live observations are explicitly distinguished from source findings; deployed source equivalence was not independently attested.

## Ranked findings from the pre-fix audit

| Item | What the checklist said | What I say | Evidence |
|---|---|---|---|
| **P1 · Privacy · both apps** | Erasure takes every buyer trail; privacy parity completed | Return erasure leaves actual stored buyer photos, GPS, device information and label URLs. An existing return-token holder can still receive photo/label links after `redacted=true`. Align erasure with stored fields and the public response; inspect object-storage cleanup too. | B `utils/buyerData.js:42`, `routes/admin.js:3431`, `routes/api/returns.js:476`, `utils/returnStatusBody.js:54`. In-memory fixture using actual helpers retained photo/GPS/device and returned photo/label after redaction. No live deletion performed. |
| **P1 · Reviewer · Ritualist billing** | Billing has no dead end; merchants can choose plans | Active subscribers have no in-app control to change plans. Live Billing showed Starter, $0 every 30 days, and period end, but no Choose/change control. Requirement 1.2.3 is likely failing. Keep the Shopify plan-page link available for active plans. | E `app/routes/app.billing.tsx:85`: picker is only in `plans.length === 0`; active branch at 111 renders details only. Confirmed on Corvara. |
| **P1 · Functionality · ink Orders** | Search and clear work; rows hydrate correctly | Search retains old rows and appends matches. From four orders, search 1003 renders five rows: 1004,1003,1002,1001,1003. Clear then renders eight; another search adds another row. Reproduced after full reload at desktop width as well as phone width. A fresh reload with the search URL shows only the correct match. | Live ink-review. React reports duplicate child key `:newest:60d:null:null:null:null`. E `app/routes/app.ink.$section.tsx:636` and `:687` give sibling `InkRecentOrders` and `OlderOrders` the identical `listKey`. Give the two siblings distinct stable key namespaces and retest transitions. No fix made. |
| **P2 · Honest reader · Ritualist analytics** | Every claim represents measured facts | “Payload integrity 100% / signed records intact” is unsupported by the underlying calculation. It counts presence of `payload_hash`; it does not verify the hash or signature. | Live Dashboard Advanced; E `app/components/AdvancedAnalytics.tsx:101`; B `routes/api/merchantInsights.js:71,95`. Rename to the actual measurement or calculate the claimed integrity. |
| **P2 · Honest reader · Ritualist Help** | Help describes current app | “If we introduce paid plans later” contradicts today's paid App Pricing product. | Live expanded FAQ “Will I be charged later?”; E `app/routes/app.help.tsx:83`. Sam should supply current copy. |
| **P2 · Privacy · shared stores** | Uninstall scopes cleanup to one app | Charge cleanup is scoped, but `shop/redact` still deletes all shared privacy receipts even if the other flavor remains installed. This can remove the other app's outstanding request/export entry. | E `app/services/ink-privacy.server.ts:223–238`, shared collection at :10. Source confirmed; shared-store uninstall not executed. |
| **P2 · Layout · shared date control** | Test both widths | Custom-date Apply is clipped around a 515px iframe width. Its right edge measured 513.7px while the card ended at 490px. At 375px the control correctly stacks; desktop also fits. | Live Ritualist screenshot and DOM geometry; E `app/components/InkOrderSearch.tsx:126`, fixed `200px 200px max-content` grid at sm. Same component used by ink; the exact ink breakpoint was not independently reproduced. |
| **P2 · Legacy API · Ritualist** | Runtime-built GraphQL operations validate | Ordinary inputs validate, but a quote in search produces invalid GraphQL because text is interpolated into the query. Lower exposure: no current main Orders consumer found. | E `app/routes/app.api.orders.tsx:50,55`; synthetic `orders-quoted-search.graphql` failed parsing. Use GraphQL variables. Not an unauthenticated exploit claim. |
| **P2 · Copy readiness · Ritualist** | Copy the email line works | While notification settings load, the enabled copy action initially exposes a `www.in.ink/o/` fallback. The correct merchant-hosted line arrives afterward. A failed load can leave the fallback. Do not treat the settled Corvara line as broken. | Live initial versus settled text; E `app/components/settings/CommunicationSettings.tsx:78,100`; notification endpoint fallback. Clipboard output itself was not verifiable in this browser. |
| **P3 · Export wording** | Export accurately describes deletion | Export says signed custody events remain, but Shopify erasure requests pass `include_custody:true` and delete them. | B `utils/customerRecords.js` about text; E `app/services/ink-api.server.ts:725`; B `routes/admin.js:3456`. |

Literal-word rule needs Sam's interpretation: reachable copy still includes “Not verified by ink”, “signatures verified”, and ink Help's “payment is confirmed”. These are not claims of verified delivery. They are flagged against the literal wording of handoff §4, not described as invented delivery evidence. The Ritualist Studio button also wraps awkwardly at phone width; lower priority than the functional findings.

## Known issues still present — not new discoveries

| Item | What the checklist said | What I say | Evidence |
|---|---|---|---|
| Large privacy exports/erasures | Prior audit identified incomplete large requests | Still capped: identity queries stop at 300 without pagination; order IDs truncate to 100. Do not claim complete erasure/export for larger histories. | B `utils/customerRecords.js:75–100`, `routes/admin.js:3326,3554`; also covered by 2026-09-23 audit. |
| Debug carrier query | Known invalid 2025-10 field | Still fails schema validation: `serviceDiscoverySupport` does not exist. | E `app/routes/api.debug-carrier.tsx:17`; validator output. |
| Notifications scheduler | Gets 401 | Unauthenticated Ritualist cron probe returned 401. Ink route returned 404. No secret or scheduler change made; repairing it may activate sends because dispatch does not check FEATURE_NOTIFICATIONS. | HTTP probes and E `app/services/notifications.server.ts:65–96`. |
| Logo fallback, deploy worktrees, held PRs | Already known | Not reclassified as new defects. No release attempted; old held PRs untouched. | Handoff §6. |

## Initial live walkthrough coverage before the fixes

| Item | What the checklist said | What I say | Evidence / remaining work |
|---|---|---|---|
| Ritualist Dashboard | Refresh, Advanced, Studio | Refresh and Advanced show/hide worked; 13 orders, 7 opened, 2 with location. Studio card opened the correct signed-in Corvara Studio. | Header Studio link not separately pressed. Integrity claim is a finding above. |
| Ritualist Orders | Search, dates, sort, pagination, every row | Search 1013 narrowed correctly; Clear restored; 7/30-day presets and Aug 1–31 custom range exercised; custom range gave six records, oldest sort ordered them; Load more reached all 13 and “No more orders.” All 13 rows opened and closed. | No persistent grey-row failure observed in this walk. |
| Ritualist record | Advanced, map rows, downloads | Advanced opened; six “Location of open” rows on order 1001 expanded. Missing location was stated honestly. Rail distinguished Shopify fulfillment from ink/carrier observations. PDF and JSON buttons completed without visible error. | **Actual saved files were not captured/verified.** Download-event wait timed out; old files in Downloads are not evidence of this run. PDF contents/PDF-A validation remain open. |
| Ritualist Settings | Every tab/switch, copy, privacy download | Account, Delivery and Notifications read; existing privacy-request JSON download clicked; settled email line uses merchant host. | Switch changes were not exercised; clipboard and saved privacy file not verified. No merchant email templates changed. |
| Ritualist Billing/Help | Approve plan; every Help button | Active test Starter displayed, all eight FAQs expanded, support mailto inspected. | Missing plan-change control blocks normal picker path. No plan approval or email sent. |
| ink Orders | Every row; search, filters, load more | All four rows opened/closed; Load more ended. Search reproduced the retained-row defect above at phone and desktop widths. | Ink preset/custom-date and sort transitions need retesting after the list defect is fixed. |
| ink Buy the record | Approve, decline, walk away, Records | Order 1001 showed $29 one-time; Shopify approval explicitly stated this test charge will not bill. Leaving approval pending produced a Records entry with “Approval pending”; Check payment status returned pending without unlocking downloads. | **Sam's Approve click remains pending.** Approval return, paid record access, re-download and declined-charge recovery not completed. Approval tab left open. No real charge approved. |
| ink Dashboard/Settings/Help | Read and press controls | Dashboard showed 4 orders, 2 opened, 0 locations and factual caveat. Check connection refreshed timestamp and both accesses stayed Connected. Help loaded; View records worked. No empty email-line card appeared. | Other Help navigation links and Dashboard Refresh were not individually exercised. |
| Responsive layout | Both widths | Desktop and 375px phone checks performed; ink Records had client/scroll width 375, no horizontal overflow. Ritualist Settings/Billing/Help also fit 375. | This was not every control at every width; 515px custom-date defect documented above. |
| Buyer tracking behavior | ink forwards, Ritualist own page | Source reviewed; no live buyer open generated in this audit. | Full browser redirect/location-consent and tracking-arrival behavior remains unverified. |
| Install/reinstall/listings | End-to-end reviewer walk | Existing installed apps load. Public auth entries do not show a shop-domain form. | No uninstall/reinstall, signed destructive webhook, Partner Dashboard listing/media/pricing review or protected-data status verification this run. |

## Tests, deployment observations and routes

- Actual CI uses Node 22 for main checks and Node 20 for a separate container install/prune gate. Node 22.23.3: `npm ci`, typecheck, test and build all passed. **95 test files; 885 passed, 1 todo.** Node 20.20.2 isolated manifest install and production prune also passed.
- `npm audit`: **10 moderate, 0 high, 0 critical**. No dependency changes made.
- Live traffic: Ritualist `shopify-app-00433-skn`, ink `ink-app-00098-trv`, each 100%. Ritualist purchase flag false; ink purchase flag true and test flag true. Backend `api` active v253, Node22, updated 2026-09-25T04:47:21.091Z. These observations do not establish that every source finding is deployed identically.
- Both HTTPS hosts passed certificate-verified requests. Both `/app` GETs returned 200 using a browser user agent; browser app entries worked. A bot-user-agent response was discarded rather than reported as a broken browser entry.
- Both flavors: `POST /app.data` returned 405; all three deliberately invalid-HMAC compliance POSTs returned 401; four retired NFC endpoints returned 404. Valid signed-webhook 200/failure/retry paths were not exercised against live data.
- Dev utilities already call `assertDevRoutesEnabled` in source; merely being mounted does not mean they are accessible by default. The authenticated debug-carrier route still lacks that gate and uses the invalid field.
- No REST Admin calls found in active source. Public proof response allowlists and merchant tenant filters were inspected; no cross-tenant bypass established. This is not an exhaustive authorization proof.

## Schema and custom data

78 runtime operation sites identified: **77 Admin operations (76 pass, 1 known debug-carrier failure), and 1 Storefront operation (pass)** against 2025-10. Runtime-built ordinary branches called out by the handoff were validated. The quoted-search variant fails separately. This inventory differs from the handoff's older count; they must not be added together.

`InkStoreLogo` is valid against Storefront 2025-10, not Admin. The shared `ink.*` namespace is supported merchant-owned custom data; it is not inherently a review violation. A blind `$app` migration would split the two app identities. `write_orders` is appropriate for these writes. Repository definition provisioning is absent, but live definitions were not inspected and typed writes are not inherently invalid. Customer-phone/token metafield retention deserves an end-to-end privacy check. The “Recorded by ink.” order tag is a factual mark.

## Shopify self-review summary

The source matrix covers 31 general requirements per app. With live TLS evidence and factual-copy findings applied:

| Flavor | Likely passing | Likely failing | Needs review | Groups skipped |
|---|---:|---:|---:|---:|
| Ritualist | 27 | 2 | 2 | 10 |
| ink | 28 | 0 | 3 | 10 |

Ritualist likely failures: **1.2.3 plan changes**, and **1.1.4 factual information** (analytics claim and stale pricing copy). Needs review for both: **1.2.2 billing implementation** (approval/decline/reinstall not completed), **2.3.3 installation return**. Ink additionally needs **1.1.4 factual-information/listing review**; its live listing was not inspected. Other “likely passing” labels are source-based, not complete live certifications. The live list defect and privacy defects remain submission concerns regardless of this selected requirement count.

Skipped category groups for both: 5.1 online store (no theme app extension), 5.2 payment gateways, 5.3 payment facilitators, 5.4 product purchase options/subscriptions, 5.5 sourcing, 5.6 checkout/customer-account extensions, 5.7 sales channels, 5.8 post-purchase extensions, 5.9 mobile app builders, 5.10 donations. Their applicable functionality was not detected; all IDs/reasons are in the requirements appendix.

Shopify's skill checks a selected subset of locally checkable requirements. Shopify evaluates additional requirements at submission; these totals are not approval or submission clearance.

## Fixes and Sam's remaining decisions

Merged embed PR #223 fixes the active-plan link, ink list keys, shared privacy receipts, misleading copy, custom-date layout, email-line fallback, GraphQL search, disabled notification/debug paths and phone-width Studio action. Merged backend PR #168 fixes return-field redaction and Storage evidence deletion, prevents new return uploads on redacted records, removes privacy match limits, and scopes linked rows to the shop. Previously merged changes were checked where possible: #211/#193 pagination, #221 row hydration in Ritualist, #208 privacy UI/authentication parity, #219 ink email-card hiding, #220 retired NFC routes, #217 source-labelled rail.

The post-release live redaction, plan navigation, ink search, approved and declined Ink test-charge paths, download checks, reinstall, and signed-webhook checks are recorded in the linked walkthrough. Sam approved the test charges in Shopify; Codex did not grant billing consent on Sam's behalf. The Ink service had a non-placeholder Shopify API secret configured, and its OAuth reinstall succeeded. Ten moderate npm advisories remain; the available blanket remediations involve major firebase-admin and Vitest upgrades, so this submission fix did not bundle that migration. The remaining audit questions are the Ritualist's exact paused-review notice and any edge cases not covered by the synthetic privacy tests. Listing assets and submission are outside the present audit scope.

## Evidence and official resources

Local evidence directory: `../../audit-evidence-2026-09-25/`. It contains separate requirements, security and schema reports, schema inputs/results, test/build/install/audit logs, and sanitized public HTTP probe results. No raw customer exports or buyer screenshots are included in this report. Appendix reports record their own narrower source-only limits; the live observations above supersede those limits only where explicitly stated.

- [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Best practices](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)
- [Billing](https://shopify.dev/docs/apps/launch/billing)
- [Submitting for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)
