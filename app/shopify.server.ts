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

  // Provision a store the instant it installs, instead of relying on the
  // merchant later opening the embedded app (app.tsx) or someone hitting the
  // manual /app/register-webhook and /app/debug routes by hand. Without this,
  // a fresh install created a session and nothing else — no webhooks, no
  // carrier service, no INK merchant record — which is why every store except
  // the one hand-wired during development came up dead. Each step is
  // independent and non-blocking so one failure can't abort the install.
  hooks: {
    afterAuth: async ({ session }) => {
      const appUrl = process.env.SHOPIFY_APP_URL || "";

      // 1. Order/fulfillment webhooks — so the app receives events from
      //    install onward (previously only registered when the merchant
      //    opened the embedded app).
      await shopify.registerWebhooks({ session }).catch((err: unknown) =>
        console.error("[afterAuth] webhook registration failed:", err),
      );

      // 2. Carrier service (Verified Delivery Mode at checkout) — needs an
      //    offline admin client for the freshly-installed shop.
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

      // 3. Register the merchant in the INK backend so the store is known
      //    downstream without waiting for billing or the first order.
      await createMerchant(session.shop, session.shop, `admin@${session.shop}`).catch(
        (err: unknown) => console.error("[afterAuth] INK createMerchant failed:", err),
      );
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
