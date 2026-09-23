# Original tracking destinations

Sam approved automatic preservation of the original destination and removal of the choice from normal Settings on September 23, 2026.

## Completed in the Shopify app

- Removed the destination selector and its save action. Previously opened forms cannot change the shared backend dial: the authenticated POST now returns 405.
- The ink tracking transport preserves the external URL exactly as supplied, including its query and fragment. An ink URL echoed by Shopify is omitted from the backend update, so it cannot replace an existing original URL. Carrier, tracking number and shipment status still update. Invalid schemes and URLs carrying credentials are also omitted.
- The Ritualist transport body is unchanged when `APP_FLAVOR` is unset. No backend or redirect files were edited. No flows, notification templates or Klaviyo settings were changed.

This protects the app's writes. It does not change the existing buyer flash. **Automatic forwarding already exists; do not build a second redirect.**

## Existing flash and the remaining distinction

Claude correctly pointed to the existing flash. Current Ritualist main contains `src/lib/flash-destination.ts`; `src/lib/white-flash/white-flash.ts` calls it and uses `window.location.replace`. Both flash implementations use the same destination rule. It prefers the Shopify order-status page, avoids returning straight to that origin, then uses a generated carrier URL or the existing `?page=1` fallback. The older local Ritualist checkout did not contain this implementation; its absence there was not evidence that forwarding was missing.

The resolver does not read stored `tracking_url`. Keeping an exact original custom tracking URL, including its parameters, is distinct from having an automatic forward. Claude should reconcile that detail with the accepted existing flow; if an extension is needed, extend the existing resolver, not a second redirect. The backend currently stores one tracking URL per proof. None of this authorizes changes to the read-only references or deployment.

The following are acceptance cases for exact original-URL preservation, not a claim that the current flash is missing:

1. For the ink flash flow, save the original destination before installing an ink tracking link. Use the merchant-authenticated proof ownership check. Keep the association with the fulfillment and tracking number; do not collapse distinct parcel destinations into the first URL.
2. Return an ink link bound to that saved destination. The buyer redirect resolves that binding from server-held data; it must not accept an arbitrary destination query parameter. For example, a merchant's original `https://tracking.example/parcel/ABC?source=shipping` remains the destination after the ink visit.
3. Ignore ink-link echoes at the backend as well as in the app. Retrying or replaying a webhook must not replace the original with ink, and out-of-order events must not undo a newer destination. Keep the already issued link binding intact when a merchant changes tracking.
4. Apply automatic forwarding only to the ink buyer flow. Keep the Ritualist's page, plan, existing overrides and redirect behavior unchanged. Retire the old ink destination choice through an explicit migration, not a shop-wide write that changes a Ritualist installation.
5. If no original is known, retain the existing Shopify link instead of substituting a destination. If an older record already contains an ink URL, do not pretend the lost original can be recovered. Recover only from a trustworthy saved value; document any remaining historical exceptions.
6. Keep Shopify and Klaviyo notification workflows under merchant control. Do not resend messages or edit templates. Only a link that actually passes through ink can generate an ink open; independently hard-coded links in a message remain outside that capture path.

## Acceptance cases for the complete change

| Case | Required result |
| --- | --- |
| External carrier or custom tracking page | Buyer reaches the exact original URL after the ink visit. |
| Link with query parameters or a fragment | Parameters and fragment survive unchanged. |
| Repeated ink webhook echoes | Original binding survives; status updates continue. |
| Two parcels with different destinations | Each tracking number keeps its own destination. |
| Merchant edits tracking later; older webhook arrives afterward | New tracking uses the new destination; replay does not corrupt either binding. |
| Missing URL, already overwritten URL, backend failure | Do not rewrite a Shopify link without a confirmed preserved destination. |
| Wrong merchant/proof, credential-bearing URL, ink loop | Reject without exposing data or creating a redirect loop. |
| Ritualist or dual-installed merchant | Existing Ritualist behavior is unchanged. |
| Shopify or Klaviyo message | No extra send; verify the actual message link and its final destination in an installed test store. |

Keep the existing successful flash flow. These exact-URL cases remain for Claude to reconcile; do not block handoff on permission to build a duplicate forward. Source review does not prove which revision is deployed.
