import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { redactCustomerInInk } from "../services/ink-api.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // CUSTOMERS/REDACT — this app's own DB stores merchant config only; the
  // buyer's PII lives on the ink-backend (proof order_details / buyer profile
  // / GPS, return docs, raw tap+click event rows). Forward the redaction
  // there. Response semantics follow the #58 retryability doctrine:
  //   backend reached + handled (2xx, incl. merchant-unknown no-op) → 200
  //   endpoint missing (404: backend not deployed yet)              → 200 + loud log
  //   transient failure (5xx / network)                             → 500 so Shopify redelivers
  const p = payload as any;
  const customerId = p?.customer?.id ?? null;
  const customerEmail = p?.customer?.email ?? null;
  const orderIds: Array<string | number> = Array.isArray(p?.orders_to_redact)
    ? p.orders_to_redact
    : [];

  if (customerId == null && !customerEmail && orderIds.length === 0) {
    console.warn(
      `[customers/redact] ${shop}: payload carried no customer id/email/orders — nothing to forward.`,
    );
    return new Response("OK", { status: 200 });
  }

  const result = await redactCustomerInInk({
    shopDomain: shop,
    customerId,
    customerEmail,
    orderIds,
  });

  if (result.ok) {
    console.log(
      `[customers/redact] ${shop}: ink-backend scrubbed —`,
      JSON.stringify(result.body?.counts ?? result.body ?? {}),
    );
    return new Response("OK", { status: 200 });
  }
  if (result.status === 404) {
    // Endpoint not live yet (backend deploys are local + Sam-gated). Ack the
    // webhook — retrying against a missing route helps nobody — but log at
    // ERROR with the non-PII identifiers needed to run the redaction manually.
    console.error(
      `[customers/redact] ${shop}: ink-backend endpoint NOT DEPLOYED — run manual redaction for customer_id=${customerId ?? "n/a"} (${orderIds.length} orders).`,
    );
    return new Response("OK", { status: 200 });
  }

  console.error(
    `[customers/redact] ${shop}: forward failed (status ${result.status}) —`,
    JSON.stringify(result.body ?? {}),
  );
  return new Response("Redaction forward failed — will retry", { status: 500 });
};
