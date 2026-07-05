import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // CUSTOMERS/DATA_REQUEST
  // This app's own DB stores merchant config only. Customer data lives on the
  // proof in the ink-backend; the merchant can already read it there. The
  // 30-day obligation is on the merchant; we acknowledge receipt and log.
  // TODO(Phase 5 — PCD): surface a proof-data export keyed on
  // payload.customer.id so merchants can answer these requests in one click.

  return new Response("OK", { status: 200 });
};
