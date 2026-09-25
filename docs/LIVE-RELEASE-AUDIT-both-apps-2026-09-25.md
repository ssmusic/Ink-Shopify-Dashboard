# Live release audit — The Ritualist and Ink. (September 25, 2026)

This is the current handoff for Claude and Sam. It records what was observed after the round-two release. **Neither Shopify App Store application was submitted.** Screenshots and videos remain for Sam to review before upload or submission. The older `RELEASE-PREP-both-apps-2026-09-25.md` and `SUBMIT-ritualist-2026-09-25.md` describe earlier states and are not release instructions.

## Released and verified

| Area | The Ritualist / `corvara-cicli` | Ink. / `ink-review` |
| --- | --- | --- |
| Code | [PR #226](https://github.com/ssmusic/Ink-Shopify-Dashboard/pull/226) merged as `c62383e`; GitHub Actions run `36169982919` deployed both Cloud Run services successfully | Same code and deploy |
| Shopify config | `the-ritualist-20` released and observed Active in Dev Dashboard; nine intended scopes; no extension listed in the active version. Admin GraphQL on corvara also returned exactly those nine granted scopes, with no old grants | `ink-4` remains active; no config change needed |
| App load | Fresh Shopify Admin tab showed Dashboard, Orders, Settings (Account, Delivery, Notifications), Billing and Help ready; opened order #1010 and Advanced | Dashboard, Orders, Records, Settings and Help loaded |
| Billing | After reinstall, the old Starter plan appeared as current on Shopify's plan page but was absent from the new app installation's `activeSubscriptions`. The app sent corvara to the plan page. Growth and then Starter were approved as $0 development-store test subscriptions; Billing showed Starter and Admin GraphQL showed one ACTIVE Starter subscription | Live `RECORD_PURCHASE_TEST=false`; `RECORD_PURCHASES_ENABLED=true`. The new $29 charge for order #1002 was explicitly marked by Shopify as a test charge with no billing. Canceling returned the purchase offer; reopening and approving added #1002 to Records |
| Reinstall | Uninstalled on `corvara-cicli`, reinstalled from Shopify Admin's Uninstalled apps list, completed the plan flow, and reopened Orders and #1010 Advanced | Uninstalled on `ink-review`, reinstalled from the Uninstalled apps list, and reopened Orders; #1001 downloads persisted |
| Record files | Order #1010 exported a valid one-page PDF and parseable JSON; an existing customer data request exported parseable JSON | Purchased #1001 exported a valid one-page PDF and parseable JSON; an existing customer data request exported parseable JSON. Newly purchased #1002 appeared with PDF and JSON download controls, and its PDF was a valid one-page file. A new #1002 JSON file was not found in Downloads during this check |
| Review performance | Cloud Run `shopify-app` has one minimum instance (`shopify-app-00439-c28`) | Cloud Run `ink-app` has one minimum instance (`ink-app-00105-mw6`) |
| Privacy worker | Dedicated `ink-privacy-jobs` service account and minute-by-minute OIDC Cloud Scheduler job; unsigned request 401, signed scheduled requests 200 | Same, with separate URL and audience |
| Webhooks | Removed three duplicate shop-scoped order subscriptions after checking exact IDs, topics and URLs; retained app-scoped order subscriptions and shop-scoped fulfillment subscriptions | Removed two duplicate shop-scoped order subscriptions under the same checks |
| Security probes | Bad-HMAC `customers/redact` returned 401; retired photo upload returned 404 | Same |
| Signed privacy job | A correctly signed synthetic `customers/redact` webhook for a unique nonexistent `@example.invalid` identity and customer ID -1 returned 200 and queued a receipt. The authenticated worker completed it with zero attempts and erased its identifiers | Same |

The corvara backend merchant row was a legacy mixed-app state: Shopify showed the approved plan and Firestore had its active-plan timestamp, but the backend still had `plan=ink` and no `ritualist_installed_at`. That made Ritualist record exports disappear. I set that row's installed timestamp after confirming the app and plan were active. On a fresh Admin load, #1010 then offered and served its PDF and JSON. The two apps now have distinct review stores; this data repair is not evidence that every historical mixed-app merchant is reconciled.

The Ritualist's first Orders tab stayed open across the deploy and later displayed Shopify's “Page unavailable” iframe. Cloud Run returned 200 for the page, while the browser logged hydration and manifest-version mismatches. A fresh Admin tab loaded the final build and completed the order/export check. Reviewers should start in a fresh tab rather than reuse a pre-deploy tab.

## Draft listing changes saved; no submission

- The Ritualist's draft name is already **The Ritualist**. I replaced “signed record of delivery” claims in its introduction, details, features, plan features, subtitle and web search copy with descriptions of order activity and carrier events. I removed the “Real-time tracking” and “Real-time notifications” category tags. Its testing notes now say no separate app account is needed, name `corvara-cicli`, explain how to make a test order, and omit the storefront password. I saved and reloaded the draft to verify persistence.
- Ink.'s draft is already under **Manual pricing (legacy)** with a Free plan and additional charges. No pricing migration was necessary. I removed pricing language from its app-details field, clarified the optional $29 one-time record charge in the pricing field, and rewrote its reviewer steps for `ink-review`. I saved and reloaded the draft. Its feature media, screenshots and screencast remain for Sam's review.
- The Ritualist's Partner review summary still displays the previously selected capability “checkout UI extension, embedded” and remains paused. Its active Shopify config version lists no extension. Confirm with Shopify whether the capability label can be cleared in the paused submission; do not describe the old extension as present.

## Remaining evidence and review gates before either App Store submission

1. **Privacy limits:** The synthetic signed webhook and authenticated worker completion prove signature acceptance, queueing and processing for a nonexistent identity on both apps. They do not prove deletion of an actual customer's data, delivery by Shopify itself, or the live retry path after a forced backend failure. Tests cover claim/retry behavior; collect the remaining live evidence before describing those cases as verified.
2. **Shopify-origin webhook delivery:** Live bad-HMAC rejection and locally signed positive privacy requests were checked. A Shopify-origin signed order or privacy delivery on the final config was not separately observed; inspect Shopify webhook logs or create a safe test order.
3. **Listing media:** Compare The Ritualist's existing images/video with the final UI. Ink. still needs its own feature media, at least three screenshots and a screencast. Sam will review them before upload. Neither application has been submitted.
4. **Review capability and automated checks:** The Ritualist Partner page remains paused and shows the old checkout capability label. Re-run Shopify's automated checks and resolve the label or get reviewer confirmation before “Submit fixes.” Ink.'s preliminary steps still show draft and its screencast field is empty.
5. **Performance for review:** One minimum instance is enabled on each Cloud Run service. Keep it enabled during Shopify review, then revisit the cost after review.

An old `ink-notification-cron` Cloud Scheduler job was calling a disabled notifications route every minute and receiving 404. Notifications remain feature-flagged off; I paused the stale job. The two new privacy jobs are enabled and succeeding.

The Ritualist Dev Dashboard shows a deprecated offline-token warning. Shopify's published deadline for existing public apps is January 1, 2027; this needs a planned migration but did not block the live Admin checks today. See Shopify's [expiring offline token changelog](https://shopify.dev/changelog/expiring-offline-access-tokens-required-for-all-public-apps-as-of-january-1-2027).

## Submission boundary

Code deployment, Shopify config release, draft listing edits, worker setup and review-store data repair are complete. No “Submit for review” or “Submit fixes” action was taken; no listing media was uploaded. Sam will decide when the applications are ready for that final step.
