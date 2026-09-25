# Release preparation: The Ritualist and Ink. — September 25, 2026

This is a review packet, not a release record. PR #226 is code-only and has not been merged or deployed. Do not use a green CI result as evidence of live behavior. The screenshots and videos should be captured from the final released build, after the checks below, and reviewed by Sam before any listing upload.

## Current code and live state

| Area | The Ritualist | Ink. |
| --- | --- | --- |
| Round-two code | PR #226: first-load setup state, root error page, no cross-flavor record purchase, clearer Settings and legacy record copy, guarded browser storage | PR #226: root error page, guarded browser storage, shared webhook-registration change |
| Verification | Typecheck, 891 tests, build, and PR CI pass | Same shared build and suite |
| App config | Active `the-ritualist-19` still grants the former 20 scopes. The nine-scope config from #225 is unreleased. Active version has no extension listed. | Active `ink-4`; its app-specific order subscriptions are present. |
| Billing | Starter test plan was approved on corvara before PR #226. Plan gate and first-load copy need a post-deploy walk. | $29 test charge was approved on ink-review before PR #226. The live `RECORD_PURCHASE_TEST=true` flag still forces test charges on every store. |
| Listing | Earlier Partner Dashboard view showed the name **The Ritualist** and existing media; recheck before editing. Review remains paused until Shopify accepts fixes. | Draft listing; media and Manual pricing still need review. |

## Fixes and checks before a release decision

1. Review PR #226, then merge only when its behavior and scope are approved. A merge deploys the app services via GitHub Actions; wait for both services to report healthy before a live walk.
2. Resolve the privacy webhook response-time risk. Both flavors save a receipt before deletion, but the Ritualist calls the backend without a timeout, and a deletion can exceed Shopify's response window. A short timeout alone is unsafe: the backend purge may need longer, while the current handler returns 503 and relies on Shopify retry. A durable worker/reconciler or measured, bounded backend completion is needed before claiming this gate passed. Test a large deletion and a forced backend failure.
3. Audit existing **shop-specific** order webhook subscriptions on each development store. PR #226 stops new programmatic `orders/create` and `orders/fulfilled` registrations; it does not erase older registrations. Keep the app-specific subscriptions in the active config, remove any duplicate shop-specific instances deliberately, and confirm one logical order enrollment per event.
4. The Ritualist: release the nine-scope Shopify config separately, review the consent prompt on corvara, and verify the installed app still loads after re-consent. The active version inspected for this packet still showed 20 scopes.
5. Ink.: after confirming the deployment workflow will preserve other Cloud Run variables, change only `RECORD_PURCHASE_TEST` to `false` on `ink-app`. Check that a development-store purchase remains a test charge because `partnerDevelopment` is true; verify a non-development store would not get a test charge without making a real purchase.
6. Set Ink.'s listing pricing to Manual with a Free base and the additional $29 one-time record purchase. Recheck The Ritualist's exact listing name, support address, privacy URL, and testing notes against the released app. Make no claim that a carrier scan, open, or shared location verifies delivery.
7. Keep both Cloud Run services warm for the review window, and perform the authenticated walk on both final live builds: install/reinstall, plan approval/change/cancellation, all navigation, signed webhooks, privacy erasure and export, downloads (PDF/CSV/JSON where offered), and the listing media against what the app actually shows. Record the tested version, store, time, and result.

## Draft reviewer testing notes — The Ritualist

No separate login or credentials are needed. In the `corvara-cicli` development store, open **The Ritualist** from Shopify Admin › Apps. The store has a test Starter plan. Open Dashboard, then Orders, open an order, inspect its activity and Advanced record, and download the offered files. Settings has Delivery, Communications, and Account tabs; Billing shows the Shopify plan and its change-plan link. If testing on an empty development store, create a test order in Shopify Admin, fulfill it with tracking, and then return to Orders. The app's customer-facing page is reached from that order's tracking link. Shopify may prompt to approve the app's reduced permissions after the config release.

## Draft reviewer testing notes — Ink.

No separate login or credentials are needed. In the `ink-review` development store, open **Ink.** from Shopify Admin › Apps. Orders #1001–#1004 provide test data. Open an order, inspect its activity, then choose **Get the record** on an eligible order. Shopify presents a **$29 one-time test charge** on this development store; after approval, return to Records and download the available PDF, CSV, and JSON files. Settings shows access and privacy requests. On a fresh empty development store, create and fulfill a test order with tracking in Shopify Admin, then open it in Ink. A declined charge should leave the purchase action available; it should not create a purchased record.

## Media brief for Sam's review after the live release

Capture only the final app build on the two development stores. Remove or mask every buyer name, email, address, device identifier, and private URL. Show real UI and real states; do not use a design mockup as a product screenshot.

| App | Screenshot set | Screencast path |
| --- | --- | --- |
| The Ritualist | Dashboard after setup; Orders list; opened order and activity; Advanced record with export; Settings and Billing as optional extra frames | Apps → Dashboard → Orders → opened order and Advanced → customer page via tracking link → Settings → Billing → Help. Show the reduced-scope consent step separately only if it appears in a fresh install. |
| Ink. | Orders with an eligible order; the Shopify approval and post-approval return; Records downloads; Dashboard or Settings as optional extra frames | Apps → Dashboard → Orders → Get the record → Shopify test-charge approval → Records and the three downloads → Settings → Help. Keep the charge screen visibly identified as a development-store test. |

Before uploading media, check each frame against the listing's claims and Shopify's current image/video requirements. The Ritualist already had media in an earlier listing view; compare it to the final build rather than replacing it blindly. Ink. still needs its own media. Sam will review the screenshots and videos before any upload.

## Submission boundary

Neither app is marked submission-ready by this packet. No Shopify Submit action, config release, Cloud Run variable change, media upload, or billing approval is part of PR #226. The live checks above are still required after any code deployment, and the privacy webhook timing issue remains open.
