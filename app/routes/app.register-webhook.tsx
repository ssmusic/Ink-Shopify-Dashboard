import { authenticate } from "../shopify.server";
import type { ActionFunctionArgs } from "react-router";

const APP_URL = "https://shopify-app-250065525755.us-central1.run.app";

const WEBHOOK_SUBSCRIPTION_CREATE = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
      webhookSubscription {
        id
        topic
        endpoint {
          __typename
          ... on WebhookHttpEndpoint {
            callbackUrl
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Manually registers all required webhooks for this app in Shopify.
 * Hit this route once after deploying to ensure webhooks are registered.
 * Route: POST /app/register-webhook
 */
export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const webhooks = [
    { topic: "ORDERS_CREATE",    path: "/webhooks/orders/create" },
    { topic: "ORDERS_FULFILLED", path: "/webhooks/orders_fulfilled" },
  ];

  const results: any[] = [];

  for (const { topic, path } of webhooks) {
    console.log(`📝 Registering ${topic} webhook...`);
    const response = await admin.graphql(WEBHOOK_SUBSCRIPTION_CREATE, {
      variables: {
        topic,
        webhookSubscription: {
          callbackUrl: `${APP_URL}${path}`,
          format: "JSON",
        },
      },
    });
    const data = await response.json();
    const result = data?.data?.webhookSubscriptionCreate;
    const errors = result?.userErrors;

    if (errors?.length) {
      console.error(`❌ ${topic} registration errors:`, errors);
    } else {
      console.log(`✅ ${topic} registered:`, result?.webhookSubscription?.id);
    }
    results.push({ topic, result });
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}

