import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { FirestoreSessionStorage } from "./firestore-session-storage.server";
import { DeliveryMethod } from "@shopify/shopify-api"; // ✅ Added import

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
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
