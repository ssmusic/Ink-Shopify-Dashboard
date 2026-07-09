/**
 * Shipping Rates Callback Endpoint
 * 
 * Legacy Carrier Service callback.
 *
 * App Store review posture: INK does not expose a customer-paid checkout
 * delivery add-on. Keep the endpoint healthy for any stale Shopify callback,
 * but return no rates so Shopify falls back to the merchant's own shipping
 * methods.
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

    const rates: any[] = [];
    console.log(`[ShippingRates] Background mode: returning no INK rates for ${rate.destination?.city || "unknown"}, ${rate.destination?.province || ""}`);

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
