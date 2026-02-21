import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // CUSTOMERS/DATA_REQUEST
  // We don't store customer PII in our App's database.
  // If we did, we would email the data to the merchant or customer.
  // Since we don't, we just acknowledge.

  return new Response("OK", { status: 200 });
};
