# Live release walkthrough — 2026-09-25

Development stores only: `corvara-cicli.myshopify.com` (The Ritualist) and `ink-review.myshopify.com` (Ink.). No customer names, addresses, session tokens, or secrets are recorded here.

## Verified on deployed revisions

| Check | The Ritualist | Ink. |
| --- | --- | --- |
| Signed-in embedded app | Dashboard, Orders, Settings, Billing rendered | Dashboard, Orders, Records, Settings rendered; Shopify and ink connections showed Connected |
| Orders | Expanded test order; Load more reached “No more orders” | Search for test order returned one row; expanded test order; custom date range applied and restored; Load more reached “No more orders” |
| Billing | Starter shown as $0 in development store; Change plan opened Shopify's plan picker | The merchant approved Shopify's $29 test charge for order #1001. Ink returned to Records and shows the purchase as Available. A separate test charge for order #1002 was declined in Shopify; Shopify showed “Charge declined,” and #1002 did not enter the record library. |
| Record downloads | JSON parsed (`files`, `manifest`); PDF opened as a one-page, 243,661-byte document | After approval, Safari downloaded both files for #1001. JSON parsed with `files` and `manifest`, the expected proof ID, and five bundled files; PDF is a valid one-page US Letter document, 242,975 bytes. Safari required allowing downloads from Shopify/Ink. The Codex in-app browser did not produce local files. |
| Privacy data request | Bad HMAC 401; valid signed synthetic request 200; Settings receipt and valid empty JSON export | Same |
| Customer redaction | Valid signed synthetic request 200; subsequent export says data was deleted, with zero orders | Same |
| Seeded return evidence | Synthetic proof and return documents matched; identity, order-detail, GPS, device, photo, and label fields were scrubbed; linked Storage object was deleted; fixtures then removed | Same |
| Settings | Tracking-link switch off/on worked and was restored on; notification snippet Copy gave success | Connection and privacy request UI worked |
| Help | All eight FAQ expanders opened and showed answers | Help page rendered with Records, Settings, and support links |
| Public debug route | `/api/debug-carrier` returned 404 | `/api/debug-carrier` returned 404 |
| Reinstall | Uninstalled from Corvara Cicli and reinstalled through the Dev Dashboard OAuth grant; Shopify returned to the embedded Dashboard with existing order metrics. Uninstall canceled the old Starter test subscription. The merchant approved a replacement free Starter test plan; embedded Billing now shows Starter at $0.00 every 30 days, period ending Nov 9, 2026. | Uninstalled from ink review and reinstalled through the Dev Dashboard OAuth grant; Shopify returned to embedded Orders. Purchased record #1001 persisted and still showed Available. |

These tests use synthetic customer IDs. They prove webhook authentication, receipt, export, Firestore field redaction, and Storage-object deletion on seeded synthetic returns. The backend code path was also covered by the 1,206-test suite in PR #168. The local Firebase Admin credential could not upload without an explicit billing project; a one-byte upload with `--billing-project=inink-c76d3` succeeded, and the deployed webhook deleted the linked object in each app. All synthetic proof, return, and Storage fixtures were removed after verification.

## Still to complete

- Ink order #1001 shows Available, two signed events, 2/2 matching event hashes, 2/2 matching chain links, no sequence gaps, and matching chain head. Safari downloaded and validated both file formats after the browser's download permission was allowed. The Codex in-app browser did not save files; this appears browser-specific rather than an app export failure.
- Listing audit only; no submission or media upload requested yet. Shopify App Store account selection succeeded. Ink's review remains Draft: its English listing flags feature media, at least three desktop screenshots, and a reviewer screencast URL. The Ritualist remains Critical/Paused with “Fix requirement issues—check your email for details”; its English listing has feature media, three screenshots, and a screencast URL with no missing-field banner. Both apps' automated common-error checks passed. [Shopify's current listing guidance](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices) recommends 1600×900 unique screenshots of actual UI, without browser chrome, PII, or pricing.
- Shopify's automated common-error check passed for Ink after reinstall. Ink capabilities are set to embedded only. The Ritualist Dev Dashboard also shows a separate warning about deprecated offline token calls with a Jan 1 deadline, alongside an OK status for breaking API changes; investigate before the deadline, but this is not the existing paused-review reason.
- The handoff expected `POST /app.data` to return 405 with the page Origin. A bare unauthenticated POST returned 400 on both services; no authenticated exploit was established. Recheck the exact request shape before treating this as a failure.

Do not present public HTTP smoke checks or these synthetic tests as full Shopify submission clearance.
