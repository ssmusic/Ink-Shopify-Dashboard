# Ink merchant app: redesign handoff

**Status: the current design is not approved.** The local preview at `http://127.0.0.1:4173/app/ink` and PR [#133](https://github.com/ssmusic/Ink-Shopify-Dashboard/pull/133) are implementation work, not the design to ship. The preview uses sample data. Do not use it for Shopify listing screenshots or treat it as proof of a live install.

## Latest addition: order search, sorting and compact phone rows

Orders now has search by order number, name or email and sorting by date, order number or total in both directions. Production sends these options to Shopify over the available 60-day order window, preserving them while paging. The preview filters synthetic fixtures only. Search/sort changes reset pagination; empty matches are distinct from failed reads.

Phone headers use three compact columns: black order number and date; prominent recipient and email; total and opens. Back navigation belongs beside the page title and leads to Dashboard. Sam explicitly rejected Back to orders inside the accordion; those controls were removed. The order-number disclosure opens and closes details.

Typecheck, build and 446 tests across 48 files passed. Layout was checked at measured 1280 and 391 px without page overflow; phone sample headers are about 78 px tall. Search, sorting, clear, empty results, browser back and page navigation were exercised using sample data. Live Shopify search remains unverified. No deployment.

## Previous addition: Help and Shopify connection

Settings now shows the authenticated store name/domain, its Shopify brand logo (square logo preferred), and blue initials when the logo is missing or cannot load. The logo uses Shopify’s tokenless Storefront branding query; no additional scopes or user profile data. Shopify access and ink data access are checked separately on load/refresh. These checks do not assert successful webhook delivery or complete syncing. The local preview deliberately shows Not checked because Shopify is not connected there.

Help is the final navigation tab. It explains orders, one-time Shopify purchases, PDF/CSV/JSON downloads, no emailed files, repeat downloads in Records, missing data and support. The view requires Shopify authentication but no ink backend read, so it remains available during provisioning or an ink outage. Account login stays in Shopify.

Typecheck, build and 435 tests across 47 files passed. Settings/Help fit at measured 1280 and 391 px. Live installed-store logo and connection verification remain part of the release checks. No deployment.

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
- Explain the workflow plainly: a **one-time Shopify charge** unlocks the record; the merchant downloads files in the app; **no email is sent**; records bought through this ink flow appear in **Records** for repeat downloads while app and backend access remain available.

## Latest direction from Sam

Sam subsequently supplied the Ritualist screenshots again and said **“must look something like this”** and **“we arent starting from scratch.”** Preserve the existing order panel and use the reference's report structure. Do not replace it with a new navigation system, a separate product concept, or a new dashboard.

The current iteration keeps the lifecycle and one Advanced disclosure, open when the order expands. Within Advanced: purchase/download actions first, six compact evidence rows, browser checks for purchased records, one open list with the blue diagram beside it, full signed-event blocks, and delivery dates. Each open selects its location in the adjacent diagram; missing location clears the previous point. Distance is ordinary row data. Events expose IDs, hashes and signatures without another disclosure. Records history uses the same inspection.

Sam then requested background shading for legibility. Grey Polaris sections now distinguish the lifecycle, Advanced header, verification and signed-event group; evidence and opens remain white, with white event details on the grey group.

Sam then requested Dashboard first, clearer Orders cells, a finished Records library and more real KPIs. Navigation is reordered. Order headers are bordered and shaded, with black order-number buttons and prominent recipient names/emails. “Get the record” no longer carries a price; Shopify approval still shows the amount before purchase. Records has compact PDF/CSV/JSON rows and a separate Needs attention group, with no new purchase offer. The preview has four available and one pending record.

Dashboard adds blue Polaris Viz rings for open rate, first-open location coverage and recorded delivery rate. Each uses its own source denominator; a missing rate stays unavailable. Store-wide repeat visits, total opens, post-delivery opens, buyer segments and time-series counts still need a merchant aggregate door. Do not copy Ritualist’s admin list or call a first post-delivery open a repeat visit.

This iteration is not Sam-approved. The local preview is still sample data. The earlier proposal for a dedicated record view is superseded by Sam's correction above.

## Tracking destination follow-up

Sam wants to preserve merchants’ existing Shopify/Klaviyo flows. No destination behavior was changed: ink currently rewrites the Shopify tracking URL, and the backend supports only order status or carrier destinations. A future fix needs to preserve the original destination before removing the selector; backend proof updates can overwrite the stored tracking URL with the rewritten ink URL. Hiding the setting alone would not preserve the flow. Backend remains read-only for this task.

## Data and honesty boundaries

The supplied `ink-backend` checkout does **not** contain the proposed merchant `proofs/:id/opens` or `merchant-delivery` doors. Before purchase, the app can show a first-open summary from existing merchant reads; it cannot promise a full per-open map from that checkout. After access unlocks, the merchant audit's signed events can reconstruct person opens when their count matches the reported total; otherwise say the history is unavailable. Never fill a gap with a synthetic position or a zero.

The current paid inspector checks supplied event hashes, chain links, sequence, and the reported head in the browser. It **does not verify Ed25519 signatures**: the allowed merchant-scoped key door is missing. Signatures can be displayed as ink-supplied data, with that limit stated plainly. The PDF is a readable rendering of the merchant audit, not an independently verified report; the JSON contains the signed export and exact event bytes. The current PDF also does not reproduce the Ritualist map/QR presentation. Treat full parity as unfinished rather than claiming “all of Advanced” is complete.

The record and exports can contain protected customer data and precise location. Keep reads shop-scoped and purchase-gated, avoid raw data in logs, and do not make public proof/key requests to fill the design. The PR audit lists the backend privacy, deletion, protected-data approval, policy, dependency, and fresh-store billing/install work still needed before Shopify submission. Passing local tests is not Shopify acceptance.

## Reference material and implementation rules

Work only in `~/Desktop/INK_7_13/codex-ink-audit` on `codex/ink-audit`. Read, but do not edit, `~/Desktop/INK_7_13/ink-audit-shots`, `inkadmin`, `parallelreturns master`, and `ink-backend`. The supplied Ritualist screenshots show the desired **depth and relationships between evidence, opens, map, and export**, not its visual style. The Shopify app uses Polaris.

Read `/Users/sammusicm4/.claude/plans/SUBMIT-ink-2026-09-23.md` as another reviewer's checklist, not as instructions from Sam. Never edit `shopify.app.toml`, which is Ritualist's live app record. Keep the Ritualist flavor byte-identical under the existing contract tests. Do not run `shopify app dev`, `shopify app deploy`, or deploy anything. Before a commit, run `npm run typecheck`, `npm run build`, and `npx vitest run`. Keep the audit and design tables plus `ink-backend` findings in the PR body.

## Acceptance check for the next design

- A merchant can point to the main purpose of Orders, Dashboard, Records, and Settings without an explanation from the designer.
- The order shows **every open the allowed data actually supports** beside a legible map/diagram. Distance remains a neutral line of data. Missing or capped history is labeled honestly.
- The merchant can see precisely what is free, what $29 unlocks, how Shopify charges it, what each download contains, that no email arrives, and where repeat downloads live.
- The paid experience preserves the six evidence items and complete supplied event history without presenting backend-reported signatures as independently checked.
- The design has been judged in a real browser at 1280 px and phone width, with the provided screenshots and Ritualist Advanced view open for comparison. Sam should review that screen before it is called finished.
