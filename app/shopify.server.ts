import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { FirestoreSessionStorage } from "./firestore-session-storage.server";
import { DeliveryMethod } from "@shopify/shopify-api"; // ✅ Added import
import { BILLING_PLANS } from "./services/billing-plans";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,

  // Scopes MUST match shopify.app.smusic.toml exactly to avoid session invalidation
  scopes: [
    "read_assigned_fulfillment_orders",
    "write_assigned_fulfillment_orders",
    "read_customers",
    "read_files",
    "write_files",
    "read_fulfillments",
    "write_fulfillments",
    "read_metaobjects",
    "write_metaobjects",
    "read_online_store_pages",
    "write_online_store_pages",
    "read_orders",
    "write_orders",
    "write_shipping",
    "write_themes",
  ],

  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new FirestoreSessionStorage(),
  distribution: AppDistribution.AppStore,

  // THE THREE LOCKED TIERS, through the Shopify Billing API
  // (appSubscriptionCreate under the hood — https://shopify.dev/docs/api/admin-graphql/2025-10/mutations/appSubscriptionCreate).
  // Shopify owns approval, decline, invoicing, cancellation and the
  // reinstall re-approval (requirements 1.2.1 / 1.2.2, docs/billing-compliance).
  // Nothing here charges on its own: a plan starts only when the merchant
  // chooses one on /app/billing and approves it on Shopify's screen. The
  // numbers are services/billing-plans.ts — never typed here.
  billing: {
    Starter: {
      lineItems: [{ amount: BILLING_PLANS.Starter.amount, currencyCode: BILLING_PLANS.Starter.currencyCode, interval: BillingInterval.Every30Days }],
    },
    Growth: {
      lineItems: [{ amount: BILLING_PLANS.Growth.amount, currencyCode: BILLING_PLANS.Growth.currencyCode, interval: BillingInterval.Every30Days }],
    },
    Pro: {
      lineItems: [{ amount: BILLING_PLANS.Pro.amount, currencyCode: BILLING_PLANS.Pro.currencyCode, interval: BillingInterval.Every30Days }],
    },
  },
  
  // ✅ Webhook definitions with proper DeliveryMethod enum
  webhooks: {
    ORDERS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/orders_create",
    },
    FULFILLMENTS_CREATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/fulfillments_create",
    },
    FULFILLMENTS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/fulfillments_update",
    },
    ORDERS_FULFILLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks/orders_fulfilled",
    },
  },

  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),

  // EXPIRING OFFLINE ACCESS TOKENS. Shopify requires these of every public app
  // from 2027-01-01; after that date a non-expiring token gets authentication
  // errors instead of data. The app's API health report flagged us with "Calls
  // made with deprecated offline tokens detected in the last 14 days".
  //
  // The point is blast radius: a non-expiring token that leaks is valid
  // forever, an expiring one for sixty minutes, and it rotates itself. This
  // codebase has already leaked one token into a transcript, so that is not a
  // hypothetical.
  //
  // Merchants do NOT reinstall — the library exchanges existing tokens in
  // place and refreshes them before expiry. FirestoreSessionStorage already
  // persists and rehydrates `expires` as a Date (it was written for the
  // framework's refresh path), so the storage half needed no change.
  future: {
    expiringOfflineAccessTokens: true,
  },
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
