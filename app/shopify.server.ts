import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { FirestoreSessionStorage } from "./firestore-session-storage.server";
import { DeliveryMethod } from "@shopify/shopify-api"; // ✅ Added import
import { ensureCarrierServiceRegistered } from "./services/carrier-service.server";
import { createMerchant } from "./services/ink-api.server";
import { updateMerchant } from "./services/merchant.server";

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

  // Provision a store the instant it installs — webhooks, carrier service,
  // AND a fully usable INK merchant: seed the api_key into the app-side
  // merchants/{shop} doc and default to automatic (background) delivery so
  // every order auto-enrolls into Parallel. Without the seed step, a fresh
  // install registers the merchant in INK but the orders/create webhook has
  // no api_key to enroll with — orders get tagged and silently dropped.
  // Each step is independent and non-blocking so one failure can't abort
  // the install.
  hooks: {
    afterAuth: async ({ session }) => {
      const appUrl = process.env.SHOPIFY_APP_URL || "";

      await shopify.registerWebhooks({ session }).catch((err: unknown) =>
        console.error("[afterAuth] webhook registration failed:", err),
      );

      try {
        const { admin } = await shopify.unauthenticated.admin(session.shop);
        if (appUrl) {
          await ensureCarrierServiceRegistered(admin, appUrl).catch((err: unknown) =>
            console.error("[afterAuth] carrier service registration failed:", err),
          );
        }
      } catch (err) {
        console.error("[afterAuth] could not get admin client for provisioning:", err);
      }

      try {
        const inkData = await createMerchant(
          session.shop,
          session.shop,
          `admin@${session.shop}`,
        );
        if (inkData?.api_key) {
          await updateMerchant(session.shop, {
            ink_api_key: inkData.api_key,
            verified_delivery_mode: "background",
            payment_status: "active",
          });
        }
      } catch (err) {
        console.error("[afterAuth] INK createMerchant/seed failed:", err);
      }
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
