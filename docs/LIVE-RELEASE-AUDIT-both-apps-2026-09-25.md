# Live release audit — The Ritualist and Ink. (September 25, 2026)

This is the current handoff for Claude and Sam. It records what was observed after the round-two release. **Neither Shopify App Store application was submitted.** Screenshots and videos remain for Sam to review before upload or submission. The older `RELEASE-PREP-both-apps-2026-09-25.md` and `SUBMIT-ritualist-2026-09-25.md` describe earlier states and are not release instructions.

## Released and verified

| Area | The Ritualist / `corvara-cicli` | Ink. / `ink-review` |
| --- | --- | --- |
| Code | [PR #226](https://github.com/ssmusic/Ink-Shopify-Dashboard/pull/226) merged as `c62383e`; GitHub Actions run `36169982919` deployed both Cloud Run services successfully | Same code and deploy |
| Shopify config | `the-ritualist-20` released and observed Active in Dev Dashboard; nine intended scopes; no extension listed in the active version | `ink-4` remains active; no config change needed |
| App load | Fresh Shopify Admin tab showed Dashboard, Orders, Settings (Account, Delivery, Notifications), Billing and Help ready; opened order #1010 and Advanced | Dashboard, Orders, Records, Settings and Help loaded |
| Billing | Corvara had a previously approved Starter test plan; the active plan is mirrored in the app's Firestore record | Live `RECORD_PURCHASE_TEST=false`; `RECORD_PURCHASES_ENABLED=true`. Code uses Shopify `shop.plan.partnerDevelopment` to keep development-store purchases test-only; an actual new charge after the flag change has not been approved in this pass |
| Record files | Order #1010 exported a valid one-page PDF and parseable JSON; an existing customer data request exported parseable JSON | Purchased #1001 exported a valid one-page PDF and parseable JSON; an existing customer data request exported parseable JSON |
| Review performance | Cloud Run `shopify-app` has one minimum instance (`shopify-app-00439-c28`) | Cloud Run `ink-app` has one minimum instance (`ink-app-00105-mw6`) |
| Privacy worker | Dedicated `ink-privacy-jobs` service account and minute-by-minute OIDC Cloud Scheduler job; unsigned request 401, signed scheduled requests 200 | Same, with separate URL and audience |
| Webhooks | Removed three duplicate shop-scoped order subscriptions after checking exact IDs, topics and URLs; retained app-scoped order subscriptions and shop-scoped fulfillment subscriptions | Removed two duplicate shop-scoped order subscriptions under the same checks |
| Security probes | Bad-HMAC `customers/redact` returned 401; retired photo upload returned 404 | Same |

The corvara backend merchant row was a legacy mixed-app state: Shopify showed the approved plan and Firestore had its active-plan timestamp, but the backend still had `plan=ink` and no `ritualist_installed_at`. That made Ritualist record exports disappear. I set that row's installed timestamp after confirming the app and plan were active. On a fresh Admin load, #1010 then offered and served its PDF and JSON. The two apps now have distinct review stores; this data repair is not evidence that every historical mixed-app merchant is reconciled.

The Ritualist's first Orders tab stayed open across the deploy and later displayed Shopify's “Page unavailable” iframe. Cloud Run returned 200 for the page, while the browser logged hydration and manifest-version mismatches. A fresh Admin tab loaded the final build and completed the order/export check. Reviewers should start in a fresh tab rather than reuse a pre-deploy tab.

## Draft listing changes saved; no submission

- The Ritualist's draft name is already **The Ritualist**. I replaced “signed record of delivery” claims in its introduction, details, features, plan features, subtitle and web search copy with descriptions of order activity and carrier events. I removed the “Real-time tracking” and “Real-time notifications” category tags. Its testing notes now say no separate app account is needed, name `corvara-cicli`, explain how to make a test order, and omit the storefront password. I saved and reloaded the draft to verify persistence.
- Ink.'s draft is already under **Manual pricing (legacy)** with a Free plan and additional charges. No pricing migration was necessary. I removed pricing language from its app-details field, clarified the optional $29 one-time record charge in the pricing field, and rewrote its reviewer steps for `ink-review`. I saved and reloaded the draft. Its feature media, screenshots and screencast remain for Sam's review.
- The Ritualist's Partner review summary still displays the previously selected capability “checkout UI extension, embedded” and remains paused. Its active Shopify config version lists no extension. Confirm with Shopify whether the capability label can be cleared in the paused submission; do not describe the old extension as present.

## Remaining gates before either App Store submission

1. **Authenticated transaction walkthrough:** Billing plan change/cancel/re-approve and fresh install/reinstall were not repeated after this deploy. Prior rounds exercised install/reinstall and approved test charges. Do not mark those actions as newly verified. The final-build navigation and existing file exports listed above were checked.
2. **Privacy deletion end to end:** The signed workers run successfully and tests cover claim/retry behavior, but this pass did not send a real Shopify erasure request for a disposable customer or force a backend failure. Verify the receipt reaches completed or is purged, and that retry works, before claiming the erasure gate passed.
3. **Signed positive webhook delivery:** Live bad-HMAC rejection is verified. A real Shopify-signed order and privacy webhook delivery on the final released config has not been observed in this pass; check Dev Dashboard webhook logs or create a safe test order.
4. **Listing media:** Compare The Ritualist's existing images/video with the final UI. Ink. still needs its own feature media, at least three screenshots and a screencast. Sam will review them before upload. Neither application has been submitted.
5. **Review capability and automated checks:** The Ritualist Partner page remains paused and shows the old checkout capability label. Re-run Shopify's automated checks and resolve the label or get reviewer confirmation before “Submit fixes.” Ink.'s preliminary steps still show draft and its screencast field is empty.
6. **Performance for review:** One minimum instance is enabled on each Cloud Run service. Keep it enabled during Shopify review, then revisit the cost after review.

An old `ink-notification-cron` Cloud Scheduler job was calling a disabled notifications route every minute and receiving 404. Notifications remain feature-flagged off; I paused the stale job. The two new privacy jobs are enabled and succeeding.

The Ritualist Dev Dashboard shows a deprecated offline-token warning. Shopify's published deadline for existing public apps is January 1, 2027; this needs a planned migration but did not block the live Admin checks today. See Shopify's [expiring offline token changelog](https://shopify.dev/changelog/expiring-offline-access-tokens-required-for-all-public-apps-as-of-january-1-2027).

## Submission boundary

Code deployment, Shopify config release, draft listing edits, worker setup and review-store data repair are complete. No “Submit for review” or “Submit fixes” action was taken; no listing media was uploaded. Sam will decide when the applications are ready for that final step.
