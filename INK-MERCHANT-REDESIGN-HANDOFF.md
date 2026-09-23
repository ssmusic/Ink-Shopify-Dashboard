# Ink merchant app: redesign handoff

**Status: rough, unfinished work in progress. Substantial design, implementation and validation work remains. Sam explicitly says we are not finished with it.** This handoff transfers ongoing work to Claude; it is not a completion report, design approval or release recommendation. Individual requested fixes and passing tests do not make the overall app finished.

The local preview at `http://127.0.0.1:4173/app/ink` and PR [#133](https://github.com/ssmusic/Ink-Shopify-Dashboard/pull/133) show the current iteration. The preview uses sample data and stubbed actions. Do not use it for Shopify listing screenshots or treat it as proof of a live install, successful payment or working production downloads.

## Where to resume

Implementation baseline: `e8a9a06` on `codex/ink-audit`, pushed to PR #133. This handoff update changes documentation only. At this check, the PR is open and conflicts with main. Reconcile against the latest main and Claude's existing work before integrating; the specific conflict resolution has not been reviewed here. No merge or deployment is authorized by this handoff.

Continue the existing app and the working Ritualist implementations. Do not start over. The next pass still needs to:

- Refine the overall merchant experience: hierarchy and density in expanded orders, readable evidence and opens beside the map, desktop/phone behavior, and a useful Dashboard with only supported metrics. Current components are an iteration, not a finished design system or approved screen set.
- Finish the record experience using the existing Ritualist work: clear free inspection versus paid downloads, independent signature verification, faithful PDF output including non-Latin text, and the required map/QR/export detail. Keep distance as neutral supporting data. Make the value clear through evidence, not stronger claims.
- Verify the whole merchant journey in an installed Shopify store: connection/logo, real orders and search, approval/decline/cancel, file saving, repeat downloads in Records, old purchases and reinstall behavior. Fixture tests do not establish those results.
- Reconcile the audit's privacy, retention, protected-data approval and dependency findings with the latest backend and deployed revisions. Findings tied to an older checkout are evidence to recheck, not instructions to redo already completed work. The customer access-request queue alone is not fulfillment.
- Review the revised screens with Sam. Acceptance of a particular adjustment, such as Help's white cards, is not approval of the whole app.

The disposable preview harness is in `/tmp/ink-merchant-preview`, outside the repository. Its sample logo and fixtures are not production assets and are not included in the PR. Real app components are imported from the working repository. Preserve this distinction when continuing or rebuilding the preview.

## Honesty pass for Claude

Sam asked for an honesty check before handoff, then emphasized that the Ritualist implementation already works. Continue from it; do not build a second flash, record service or verification system.

- Rechecked backend `8f21214` (#129): the merchant sees the whole audit before purchase. `locked:false, purchased:false` sells the hand-over. This app now preserves that distinction: inspection is available before purchase; all PDF/CSV/JSON actions require the existing merchant export entitlement. Tests cover denial, access, and mismatched proof IDs.
- The merchant opens and delivery routes already exist. The prior missing-door findings were stale. `/retrieve/:proofId` is now tenant-checked and serves a public key; do not ask for a new key service before evaluating that existing source and Ritualist's verifier.
- The flash already automatically forwards. The exact saved custom URL is a separate detail: the existing resolver uses order status/carrier rather than `tracking_url`. Keep the accepted flash and reconcile only that difference if needed.
- Tightened claims: verified **by ink**, no inference that an asserted event is unsigned, location-sharing rate no longer called first-open coverage, separate capped-open notice, time zones on record timestamps, CSV capped-history and signed-byte availability labels. Records now retains its own map address from the merchant opens door.
- Still unfinished in this app: independent signature verification; PDF fidelity for non-Latin characters (renderer substitutes `?`); Ritualist map/QR export parity; real Shopify purchase/download/reinstall and privacy fulfillment walks. No deployment or Shopify acceptance is claimed.

Accuracy check for this handoff update: the local backend has since advanced to `db62e37` (#131). The full-view/purchase split, merchant opens/delivery routes, retrieve tenant check and key projection were rechecked there and remain present. The broader privacy findings were reviewed at `8f21214`; this update is not a fresh audit of every backend change or deployed service. File line numbers in that audit refer to the reviewed revision and can shift.

At the implementation baseline, typecheck, build and 48 test files / 462 tests passed. These are local code checks, not an end-to-end product sign-off. Do not use the older checkout findings as an instruction to redo fixes already present.

## Latest addition: order search, sorting and compact phone rows

Orders now has search by order number, name or email and sorting by date, order number or total in both directions. The app code sends these options to Shopify over the available 60-day order window, preserving them while paging. The preview filters synthetic fixtures only. Search/sort changes reset pagination; empty matches are distinct from failed reads.

Phone headers use three compact columns: black order number and date; prominent recipient and email; total and opens. Back navigation belongs beside the page title and leads to Dashboard. Sam explicitly rejected Back to orders inside the accordion; those controls were removed. The order-number disclosure opens and closes details.

Earlier validation of this addition: typecheck, build and 446 tests across 48 files passed. Layout was checked at measured 1280 and 391 px without page overflow; phone sample headers are about 78 px tall. Search, sorting, clear, empty results, browser back and page navigation were exercised using sample data. These measurements apply to that fixture iteration and are not a design approval. Live Shopify search remains unverified. No deployment.

## Previous addition: Help and Shopify connection

Settings now shows the authenticated store name/domain, its Shopify brand logo (square logo preferred), and blue initials when the logo is missing or cannot load. The logo uses Shopify’s tokenless Storefront branding query; no additional scopes or user profile data. Shopify access and ink data access are checked separately on load/refresh. These checks do not assert successful webhook delivery or complete syncing. The local preview deliberately shows Not checked because Shopify is not connected there.

Help is the final navigation tab. Sam rejected the topic grid; Help now uses one reading column with a separate white card for each section and small grey gaps between cards. It explains orders, one-time Shopify purchases, PDF/CSV/JSON downloads, no emailed files, repeat downloads in Records, missing data and support. The view requires Shopify authentication but no ink backend read, so it remains available during provisioning or an ink outage. Account login stays in Shopify.

Earlier validation of this addition: typecheck, build and 435 tests across 47 files passed. Settings/Help fit at measured 1280 and 391 px. Live installed-store logo and connection verification remain part of the release checks. No deployment.

## The job

This is the **merchant's app inside Shopify Admin**. The merchant should understand an order, the opens, and the optional $29 record without reading an essay or navigating several nested disclosures. Within a few seconds they should be able to answer:

1. What happened with this order, according to the data ink actually has?
2. When was the link opened, and what location, if any, did the device share for each open?
3. What can I see without buying a record?
4. What exactly does the one-time $29 Shopify purchase add?
5. How do I inspect and download that record again?

The record must make a factual case through the data. Avoid sales language and avoid implying that an open or a shared location proves physical receipt.

## What Sam asked for

- Call Insights **Dashboard**. Its three top numbers are **Orders**, **Open**, and **Location shared**. There is no explanatory text inside those number cards, no Signed 100%, and no Disputed 0.
- Use one blue highlight family across Orders, Dashboard, Settings, map, rings, and checkmarks. Reserve green for a real **Seen at the door** event. Use Shopify Polaris components and tokens only; no custom CSS, outside chrome, or Ritualist typography.
- The order page should show the **list of opens with the map next to it** at desktop width, stacked intelligibly on a phone. Show the delivery address, 100 m and 300 m guide rings, each open, any shared position, time, distance, and accuracy. The rings are scale guides, **not a merchant default range or a pass/fail threshold**. “719 m from the delivery address” is one data point, not a large verdict or the visual focus.
- Do not judge a customer or a delivery from distance. Use neutral wording such as “Opened 719 m from the delivery address” or “Location not shared.” Do not say “outside the 300 m range.”
- Replace awkward headings and prose. In particular, do not use “The order, step by step,” “Getting there,” “While they waited,” “What the carrier said,” “Orders through the door,” or “Did it arrive when promised?” Do not invent a promised date. Use sentence case, no all-caps section labels, label arrows or dashes, possessive brand phrasing, or model-sounding copy.
- The paid record should offer the depth of Ritualist's Advanced view **inside Shopify in Polaris**: six evidence items, a clear account of verification, every open beside the map, event history, event IDs/hashes/signatures, and PDF, CSV, and JSON downloads. Make the pre-purchase view useful and the paid addition unmistakable. Do not invent a plan throttle just because Ritualist has its own plan logic.
- Explain the workflow plainly: a **one-time Shopify charge** unlocks the downloadable hand-over; the full merchant record is viewable before purchase; the merchant downloads files in the app; **no email is sent**; records bought through this ink flow appear in **Records** for repeat downloads while app and backend access remain available.

## Latest direction from Sam

Sam subsequently supplied the Ritualist screenshots again and said **“must look something like this”** and **“we arent starting from scratch.”** Preserve the existing order panel and use the reference's report structure. Do not replace it with a new navigation system, a separate product concept, or a new dashboard.

The current iteration keeps the lifecycle and one Advanced disclosure, open when the order expands. Within Advanced: purchase/download actions first, six compact evidence rows, browser checks for merchant records, one open list with the blue diagram beside it, full signed-event blocks, and delivery dates. Each open selects its location in the adjacent diagram; missing location clears the previous point. Distance is ordinary row data. Events expose IDs, hashes and signatures without another disclosure. Records history uses the same inspection.

Sam then requested background shading for legibility. Grey Polaris sections now distinguish the lifecycle, Advanced header, verification and signed-event group; evidence and opens remain white, with white event details on the grey group.

Sam then requested Dashboard first, clearer Orders cells, a finished Records library and more real KPIs. Navigation is reordered. Order headers are bordered and shaded, with black order-number buttons and prominent recipient names/emails. “Get the record” no longer carries a price; Shopify approval still shows the amount before purchase. Records has compact PDF/CSV/JSON rows and a separate Needs attention group, with no new purchase offer. The preview has four available and one pending record.

Dashboard adds blue Polaris Viz rings for open rate, recorded device-location coverage and recorded delivery rate. Each uses its own source denominator; a missing rate stays unavailable. Store-wide repeat visits, total opens, post-delivery opens, buyer segments and time-series counts still need a merchant aggregate door. Do not copy Ritualist’s admin list or call a first post-delivery open a repeat visit.

This iteration is not Sam-approved. The local preview is still sample data. The earlier proposal for a dedicated record view is superseded by Sam's correction above.

## Tracking destination follow-up

Sam approved automatic original-destination preservation and removal of the choice from Settings. The selector and save action are removed; stale forms authenticate and return 405. Ink tracking transport now ignores its own URL echoes, protecting the stored external URL while retaining carrier/status updates. The Ritualist transport body is unchanged.

**The flash already forwards automatically.** Current Ritualist `src/lib/flash-destination.ts` and `src/lib/white-flash/white-flash.ts` provide that behavior. Do not build a second redirect. Exact original custom-URL preservation is a separate potential extension to reconcile with Claude; the current resolver does not read `tracking_url`. Details and acceptance cases are in `docs/ink-original-destination.md`. No backend/flash edits or deployment.

## Data and honesty boundaries

The current backend has merchant `proofs/:id/opens` and `merchant-delivery` doors. Its full audit is viewable before purchase; the purchase gates receipt/export hand-over. The app uses merchant-scoped reads and shows unavailable/capped history explicitly. Never fill a gap with a synthetic position or zero.

The inspector checks supplied event hashes, links, sequence and reported head in the browser. It does not yet verify Ed25519 signatures. The current merchant `/retrieve/:proofId` returns `public_key` and `key_id`, so reuse that allowed source and the existing Ritualist verifier where suitable, including historical key handling. The earlier claim that no merchant key source exists was wrong.

The PDF is a rendering of the merchant audit, not an independently verified report. It lacks the Ritualist map/QR presentation and the inherited renderer replaces unsupported non-Latin characters with `?`. JSON retains the signed export; CSV/JSON preserve their text. Full export parity is unfinished. Do not describe this as all of Ritualist Advanced completed.

The record and exports can contain protected customer data and precise location. Reads stay shop-scoped; file downloads use the export entitlement. The audit distinguishes code defects observed in backend `8f21214` from unresolved deployment/approval checks. Passing local tests is not Shopify acceptance.

## Reference material and implementation rules

Work only in `~/Desktop/INK_7_13/codex-ink-audit` on `codex/ink-audit`. Read, but do not edit, `~/Desktop/INK_7_13/ink-audit-shots`, `inkadmin`, `parallelreturns master`, and `ink-backend`. The supplied Ritualist screenshots show the desired **depth and relationships between evidence, opens, map, and export**, not its visual style. The Shopify app uses Polaris.

Read `/Users/sammusicm4/.claude/plans/SUBMIT-ink-2026-09-23.md` as another reviewer's checklist, not as instructions from Sam. Never edit `shopify.app.toml`, which is Ritualist's live app record. Keep the Ritualist flavor byte-identical under the existing contract tests. Do not run `shopify app dev`, `shopify app deploy`, or deploy anything. Before a commit, run `npm run typecheck`, `npm run build`, and `npx vitest run`. Keep the audit and design tables plus `ink-backend` findings in the PR body.

## Acceptance check for the next design

- A merchant can point to the main purpose of Orders, Dashboard, Records, and Settings without an explanation from the designer.
- The order shows **every open the allowed data actually supports** beside a legible map/diagram. Distance remains a neutral line of data. Missing or capped history is labeled honestly.
- The merchant can see precisely what is free, what $29 unlocks, how Shopify charges it, what each download contains, that no email arrives, and where repeat downloads live.
- The paid experience preserves the six evidence items and complete supplied event history without presenting backend-reported signatures as independently checked.
- The design has been judged in a real browser at 1280 px and phone width, with the provided screenshots and Ritualist Advanced view open for comparison. Sam should review that screen before it is called finished.
