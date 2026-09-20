/** The body POST /api/enroll receives — built here, pure, so a test can pin
 *  its shape without importing ink-api.server.ts (which needs the app's
 *  secrets at import time) or the webhook route (which needs the Shopify
 *  app config). enrollOrder in ink-api.server.ts is the only caller.
 *
 *  Alan's API requires order details nested in an `order_details` JSON
 *  object (verified in Cloud Run logs 2026-04-26); top-level operational
 *  fields (order_id, nfc_token, photos, GPS, carrier) stay where they are.
 */
import type { OrderMoney } from "./order-money";

export interface EnrollOrderContext {
  orderStatusUrl?: string | null;
  shopDomain?: string | null;
  /** The order's own money, lifted from the orders/create body (Track C).
   *  Absent on the warehouse and tagged-shipments call sites, which have no
   *  Shopify body in hand — the backend rolls those up and says so. */
  money?: OrderMoney | null;
}

/** The wire shape — order_details is an open record because the backend
 *  spreads unknown keys onto the proof (and that is how the order door and
 *  the money reach the buyer's page "for free"). */
export interface EnrollPayload {
  order_id: string;
  nfc_token: string;
  order_details: Record<string, unknown>;
  warehouse_location?: { lat: number; lng: number };
  nfc_uid?: string;
  photo_urls?: string[];
  photo_hashes?: string[];
  carrier_name?: string;
  tracking_number?: string;
}

export function buildEnrollPayload(args: {
  orderId: string;
  nfcToken: string;
  orderNumber: string;
  customerEmail: string | null;
  shippingAddress: unknown;
  productDetails: unknown[];
  warehouseLocation?: { lat: number; lng: number };
  nfcUid?: string;
  photoUrls?: string[];
  photoHashes?: string[];
  carrierName?: string | null;
  trackingNumber?: string | null;
  customerPhone?: string | null;
  orderContext?: EnrollOrderContext;
}): EnrollPayload {
  const {
    orderId, nfcToken, orderNumber, customerEmail, shippingAddress, productDetails,
    warehouseLocation, nfcUid, photoUrls, photoHashes, carrierName, trackingNumber,
    customerPhone, orderContext,
  } = args;
  const payload: EnrollPayload = {
    order_id: orderId, // numeric ID string
    nfc_token: nfcToken,
    order_details: {
      order_number: orderNumber,
      // Parallel renders order_details.customer_name (no fallback to
      // shipping_address.name), so lift the recipient name up to it —
      // otherwise "Customer"/"Ship To" stay blank in the dashboard.
      customer_name:
        (shippingAddress && typeof shippingAddress === "object"
          ? String((shippingAddress as { name?: unknown }).name ?? "")
          : "") || "",
      customer_email: customerEmail || "",
      customer_phone: customerPhone || "",
      shipping_address: shippingAddress,
      product_details: productDetails,
    },
  };

  // Shopify's orders/create body has always carried `order_status_url` — the
  // buyer's own order-status page, no login required. Only stamped when
  // present — an absent field must stay absent rather than become an empty
  // string, because the page hides the link on absence and "" would render a
  // dead one (law 7).
  if (orderContext?.orderStatusUrl) {
    payload.order_details.order_status_url = orderContext.orderStatusUrl;
  }
  // The real shop domain, alongside it. `proof.merchant` and `proof.shop_id`
  // are BOTH the merchant_id despite the comment on the former saying
  // shop_domain, so nothing on the wire has ever carried the actual host.
  if (orderContext?.shopDomain) {
    payload.order_details.shop_domain = orderContext.shopDomain;
  }
  // THE MONEY (Track C): the store's total, currency and the codes the buyer
  // typed, exactly as Shopify sent them. Same law as the two fields above —
  // present means present, absent stays absent. The backend labels a total
  // we sent "order" and never rolls it up.
  if (orderContext?.money) {
    for (const [key, value] of Object.entries(orderContext.money)) {
      if (value !== undefined && value !== null) payload.order_details[key] = value;
    }
  }

  if (warehouseLocation) payload.warehouse_location = warehouseLocation;
  if (nfcUid) payload.nfc_uid = nfcUid;
  if (photoUrls && photoUrls.length > 0) payload.photo_urls = photoUrls;
  if (photoHashes && photoHashes.length > 0) payload.photo_hashes = photoHashes;
  if (carrierName) payload.carrier_name = carrierName;
  if (trackingNumber) payload.tracking_number = trackingNumber;
  return payload;
}
