# Billing Compliance Notes - 2026-07-07

This note memorializes the Shopify App Store billing rejection audit and the
decisions made while fixing it. Code still wins over this document.

## Review Finding

Shopify rejected the app for:

- 1.2.1: app charges must use Shopify App Pricing or the Shopify Billing API.
- 1.2.2: billing must correctly support approval, decline, and approval again
  after uninstall/reinstall.

The reviewer screencast showed this path:

1. Install/open the embedded Shopify app.
2. Click `Open your ink. dashboard`.
3. Land on the standalone `in.ink/settings` Account screen.
4. See off-platform-looking billing state: `Studio plan`, `$49/mo`, `Visa`,
   invoices, plan status, and premium/add-on language.

That reachable standalone dashboard surface was the clearest rejection trigger.

## Current Pricing Source Of Truth

Use the locked handoff pricing, not old branch history:

- Source: `/Users/smusic/Desktop/ink-handoff-2026-07-06/04_parked_builds/shopify-app-submission-pack-2026-07-05.md`
- Plans: `Starter $299/mo`, `Growth $599/mo`, `Pro $999/mo`, `Enterprise custom`
- Usage: `$2.00 per completed return`
- Clicks/page opens: free, never metered
- Listing pricing must match Partner Dashboard pricing exactly.

Important stale artifact:

- GitHub PR #14 (`feat/billing-usage-rail`) is obsolete background. It mentions
  `$1,299` Pro and `$2.50` per return, which conflicts with the locked handoff.
  Do not revive or merge it without reconciling the pricing model first.

## Chosen Compliance Direction

Primary direction: Shopify App Pricing / Managed Pricing for plan approval,
decline, invoicing, cancellation, and reinstall approval behavior.

If the `$2.00 per completed return` usage line is included at launch, it must be
implemented through a Shopify-compliant path:

- Shopify Billing API usage billing, with a capped amount and usage records, or
- a Shopify-supported App Pricing setup if the Partner Dashboard supports that
  exact usage component.

Do not use Stripe or any Worker checkout/portal route for app charges.

## What PR #64 Removed From The Embed

- Deleted hardcoded/mock billing cards and usage widgets.
- Stopped install-time provisioning from marking merchants as paid/subscribed.
- Redirected legacy manual payment routes to the Shopify billing page.
- Removed `shop.in.ink` purchase/reorder links from embedded app surfaces.
- Replaced pilot/free-later copy with neutral Shopify-managed billing copy.
- Kept `access_scopes` untouched.

## What PR #394 Removed From The Reachable Dashboard/Worker

- Removed the Account billing sections visible in the reviewer screencast.
- Removed fake plan/payment/invoice copy.
- Removed Instagram premium/upgrade billing language.
- Removed Cloudflare Worker Stripe checkout and portal session endpoints.

## Hard Rules Going Forward

- No automatic internal subscription or paid plan on install.
- No internal `payment_status: active` as a billing truth.
- No fake card, invoice, plan, cap, trial, or usage rows.
- No Stripe path reachable or inferable from the Shopify app.
- No buyer/merchant copy implying INK is sold as a paid off-platform checkout
  add-on or physical sticker purchase from inside the Shopify app.
- Billing UI inside the app should either:
  - be removed, or
  - reflect Shopify's granted plan read-only.
- Plan approval, decline, invoicing, cancellation, and reinstall approval must be
  owned by Shopify.
- Do not touch `access_scopes` without the founder gate.
- Do not regenerate app credentials.

## Dev Store Acceptance Checks

Before resubmission, verify on `sm-test-hhawzn52`:

1. Fresh install creates no automatic internal paid subscription.
2. Selecting a paid plan goes through Shopify's approval screen.
3. Declining works and the app degrades gracefully.
4. Uninstall and reinstall requests Shopify approval again.
5. All invoice/payment paths are Shopify invoice paths.
6. The magic-link dashboard no longer shows off-platform billing state.
7. Targeted greps stay clean for stale billing strings:
   `Stripe`, `shop.in.ink`, `payment_status`, `Visa`, `$49`, `Invoices`,
   `Payment method`, `Premium upgrade`, `Upgrade`, `appSubscriptionCreate`.

## Second-Pass Audit Notes

After the first cleanup, a broader search found a few non-primary but confusing
surfaces:

- Embedded Delivery Mode copy still described an optional paid checkout choice
  and per-sticker cost. This was removed.
- A tabled `CommunicationsUsage` component still said `billing period`. It is
  not rendered, but the copy was neutralized anyway.
- The standalone Account page title still said `Account & billing`. It now says
  `Account`.
- The password-gated `/admin/codes` operator page still showed pilot credit as
  trial/metered-event language. This was neutralized in the standalone PR.

Backend audit:

- `ink-backend` was scanned for `Stripe`, subscription, invoice, billing, and
  plan/payment markers. No app-charge path was changed or deployed. Remaining
  hits are Shopify plan metadata, privacy copy, and unrelated cleanup/test code.

Residual checks that code cannot prove:

- Partner Dashboard App Pricing must match the locked pricing.
- Shopify must show approval on paid-plan selection.
- Decline and uninstall/reinstall behavior must be tested on the dev store.
