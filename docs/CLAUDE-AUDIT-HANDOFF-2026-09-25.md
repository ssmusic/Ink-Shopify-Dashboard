# Claude handoff — The Ritualist and Ink. audit (2026-09-25)

Sam asked for an **audit only** at this stage. Do not treat this document as authorization to submit either app, upload listing media, or approve another charge. The original brief is `HANDOFF-codex-audit-ritualist-and-ink-2026-09-25.md` in the parent directory; it is historical input and some of its pending-work statements are superseded below. This repository is public: do not commit credentials, real buyer data, or private exports.

## What shipped and what was tested

- Embed fixes: [PR #223](https://github.com/ssmusic/Ink-Shopify-Dashboard/pull/223), merged. Backend fixes: [PR #168](https://github.com/ssmusic/ink-backend/pull/168), merged. The backend `api` function reached version 254; [Cloud Run run 36144874260](https://github.com/ssmusic/Ink-Shopify-Dashboard/actions/runs/36144874260) deployed both app flavors. The embed CI and 1,206-test backend suite passed as recorded in [the main audit](./ritualist-and-ink-review-2026-09-25.md). That report's ranked findings and initial coverage table are **pre-fix** findings, not current claims of unresolved behavior.
- The authenticated post-release results are in [live-walkthrough-2026-09-25.md](./live-walkthrough-2026-09-25.md). Both apps rendered in their development stores. Order search, expansion, date filtering, pagination, Settings, and Help were exercised. Ink order #1001's $29 **test** charge was approved by Sam; Shopify returned to Records with the purchase Available. A separate test charge for #1002 was declined and did not unlock a record. The Ritualist's replacement Starter test plan was approved by Sam after uninstall/reinstall; embedded Billing showed `$0.00 every 30 days`, ending Nov 9, 2026.
- Both apps were uninstalled and reinstalled on their development stores. Shopify OAuth returned to each embedded app. Ink's purchased #1001 record remained Available after reinstall. Safari downloaded and validated each app's one-page PDF and JSON record; the Codex in-app browser did not save the downloads, a browser-specific limitation rather than an observed app failure.
- Bad-HMAC privacy requests returned 401. Valid signed synthetic customer-data and customer-redact requests returned 200 on both apps; Settings showed the receipts and empty/deleted exports. Seeded synthetic return evidence was scrubbed in Firestore, linked Storage objects were deleted, and the test fixtures were removed. These tests do not prove completeness for every real merchant history.

## Partner Dashboard state observed after testing

| App | Current review state | Listing state |
| --- | --- | --- |
| The Ritualist | **Critical / Paused:** “Fix requirement issues—check your email for details.” Automated common-error check passed. | English listing has feature media, three desktop screenshots, and a reviewer screencast URL; its form showed no missing-field banner. The former 5.6.1 order-status block was removed in app version `the-ritualist-17`; the current released config is `the-ritualist-19`. The precise paused-review issue must be confirmed from Shopify's notice before claiming it is resolved or pressing **Submit fixes**. |
| Ink. | **Draft.** Automated common-error check passed. | English listing explicitly flags three missing elements: feature media, at least three desktop screenshots, and reviewer screencast URL. No media was uploaded. Its listing text was restored to its prior state after a brief audit edit. |

Sam said the listing assets are **not needed yet**. Do not generate or upload them as part of this audit. The Ink listing's app-details wording still has Shopify's nonblocking review tip about the word “charge.”

## Focus for an independent pass

1. Reconcile the Ritualist paused-review notice with the deployed config and checkout/order-status extension state. Shopify's message, rather than the general dashboard badge, should determine what remains to fix.
2. Independently inspect the current source and the exact deployed versions of the privacy erasure and signed-webhook paths. The synthetic test passed, but the audit did not prove every large-history, cross-store, or concurrent-request case.
3. Check the merchant and buyer journeys against the original brief's factual-language rules: an open or distance is data, never proof that the buyer received a package. The Ritualist and Ink have different tracking destinations and different billing models.
4. Verify that the live install/reinstall and billing flows still work after any further changes. The $29 Ink transaction was a Shopify **test** charge; do not infer real billing was tested.
5. Review Ink's listing requirements when Sam is ready for submission. Its three missing media fields are known, but not part of the present audit scope.

No Shopify submission, Partner Dashboard **Submit fixes**, listing-media upload, or further billing approval was performed by Codex after Sam clarified the audit-only scope.
