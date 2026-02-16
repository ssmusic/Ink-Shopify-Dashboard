/**
 * Shipping Rates Callback Endpoint
 * 
 * Shopify POSTs to this URL at checkout to get available shipping rates.
 * This is called by the Carrier Service API — NOT through Shopify auth.
 * 
 * Shopify sends: { rate: { origin, destination, items, currency, locale } }
 * We respond with: { rates: [...] }
 */
import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Only accept POST requests
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await request.json();
    const rate = body?.rate;
    
    if (!rate) {
      return new Response(JSON.stringify({ rates: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const currency = rate.currency || "USD";

    // Calculate delivery dates (2-day for premium, 5-7 for standard)
    const now = new Date();
    const premiumMin = new Date(now);
    premiumMin.setDate(premiumMin.getDate() + 1);
    const premiumMax = new Date(now);
    premiumMax.setDate(premiumMax.getDate() + 2);
    const standardMin = new Date(now);
    standardMin.setDate(standardMin.getDate() + 5);
    const standardMax = new Date(now);
    standardMax.setDate(standardMax.getDate() + 7);

    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    const rates = [
      {
        service_name: "ink. Verified Delivery",
        service_code: "INK_VERIFIED",
        total_price: "1000", // $10.00 in cents
        description: "2-day delivery with verification, Priority handling and Delivery confirmation",
        currency,
        min_delivery_date: formatDate(premiumMin),
        max_delivery_date: formatDate(premiumMax),
      },
      {
        service_name: "Standard Free Delivery",
        service_code: "STANDARD_FREE",
        total_price: "0", // Free
        description: "5-7 business days",
        currency,
        min_delivery_date: formatDate(standardMin),
        max_delivery_date: formatDate(standardMax),
      },
    ];

    console.log(`[ShippingRates] Returning ${rates.length} rates for ${rate.destination?.city || "unknown"}, ${rate.destination?.province || ""}`);

    return new Response(JSON.stringify({ rates }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[ShippingRates] Error processing request:", error);
    // Return empty rates on error — Shopify will fall back to other shipping methods
    return new Response(JSON.stringify({ rates: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// Also handle GET for health checks
export const loader = async () => {
  return new Response(JSON.stringify({ status: "ok", service: "ink-shipping-rates" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
