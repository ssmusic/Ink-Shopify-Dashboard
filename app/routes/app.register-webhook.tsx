import { authenticate } from "../shopify.server";
import { assertDevRoutesEnabled } from "../flags.server";
import type { ActionFunctionArgs } from "react-router";

const APP_URL = "https://shopify-app-250065525755.us-central1.run.app";

const WEBHOOK_SUBSCRIPTIONS_QUERY = `
  query existingWebhookSubscriptions {
    webhookSubscriptions(first: 50) {
      edges {
        node {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
      }
    }
  }
`;

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
 * Idempotently registers the shop-level webhooks this app still manages
 * imperatively. Safe to hit any number of times: existing topics are skipped.
 * Route: POST /app/register-webhook
 *
 * ⚠️ ORDERS_CREATE / ORDERS_FULFILLED are deliberately NOT here — they are
 * app-level declarative subscriptions in shopify.app.toml (since the 07-01
 * config deploy). Registering them here AGAIN gives every order TWO webhook
 * deliveries → duplicate proofs (order #1010, 2026-07-01). Only the
 * fulfillments topics, which the toml does not declare, stay imperative.
 */
export async function action({ request }: ActionFunctionArgs) {
  assertDevRoutesEnabled();
  const { admin } = await authenticate.admin(request);

  const webhooks = [
    { topic: "FULFILLMENTS_CREATE", path: "/webhooks/fulfillments_create" },
    // The delivered_at rail — real carrier "delivered" events land here.
    { topic: "FULFILLMENTS_UPDATE", path: "/webhooks/fulfillments_update" },
  ];

  const existingRes = await admin.graphql(WEBHOOK_SUBSCRIPTIONS_QUERY);
  const existingJson = await existingRes.json();
  const existing = (existingJson?.data?.webhookSubscriptions?.edges || []).map(
    (e: any) => e.node
  );
  const existingTopics = new Set(existing.map((n: any) => n.topic));

  const results: any[] = [];

  for (const { topic, path } of webhooks) {
    if (existingTopics.has(topic)) {
      console.log(`⏭️ ${topic} already registered; skipping`);
      results.push({ topic, skipped: true });
      continue;
    }
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

  return new Response(JSON.stringify({ registered: results, existing }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
