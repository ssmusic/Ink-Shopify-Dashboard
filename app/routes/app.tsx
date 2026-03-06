import { Outlet, useLoaderData, useRouteError, useRouteLoaderData, Link, type HeadersFunction, type LoaderFunctionArgs, type LinksFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ShopProvider } from "../contexts/ShopContext";
import { ensureCarrierServiceRegistered } from "../services/carrier-service.server";

import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import translations from "@shopify/polaris/locales/en.json";

import { getMerchant } from "../services/merchant.server";

import { Toaster } from "../components/ui/toaster";
import { Toaster as Sonner } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const path = url.pathname;
  const shop = session.shop;

  // Public callback endpoint bypass (handled in its own route, but just in case)
  // Also whitelist the root dashboard path so users can see the "Home" page
  if (path === "/app/payment" || path === "/app/payment/callback" || path === "/app" || path === "/app/") {
      return { apiKey: process.env.SHOPIFY_API_KEY || "" };
  }
  
  // 1. Check Firestore for Merchant Data
  const merchant = await getMerchant(shop);
  const paymentStatus = merchant?.payment_status;
  const inkApiKey = merchant?.ink_api_key;

  // 2. If valid locally, good to go
  if (paymentStatus === "active" && inkApiKey) {
     // Auto-register carrier service logic remains here
     const appUrl = process.env.SHOPIFY_APP_URL || "";
     if (appUrl) {
        ensureCarrierServiceRegistered(admin, appUrl).catch((err) => {
          console.error("[App] Carrier service registration error (non-blocking):", err);
        });
     }
     return { apiKey: process.env.SHOPIFY_API_KEY || "" };
  }

  // 3. If not valid in DB, check Shopify Billing API (Source of Truth)
  const billingResponse = await admin.graphql(
    `#graphql
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          test
          status
        }
      }
    }`
  );
  
  const billingData = await billingResponse.json();
  const subscriptions = billingData.data?.currentAppInstallation?.activeSubscriptions || [];
  const hasActiveSubscription = subscriptions.length > 0;

  if (hasActiveSubscription) {
    // Sync DB if needed (e.g. if payment_status was missing)
    if (paymentStatus !== "active") {
        // We can't update DB here easily without importing the update function, 
        // but the callback handles the main update. 
        // For now, allow access, maybe trigger a background sync or just let it be.
        // Actually, let's just proceed. The callback is the primary writer.
    }
    
    // If we have subscription but NO API Key, redirect to callback to restore/generate it
    if (!inkApiKey) {
        return Response.redirect(`${process.env.SHOPIFY_APP_URL}/app/payment/callback?charge_id=restore`);
    }
    
    // Check carrier service
    const appUrl = process.env.SHOPIFY_APP_URL || "";
    if (appUrl) {
       ensureCarrierServiceRegistered(admin, appUrl).catch((err) => {
         console.error("[App] Carrier service registration error (non-blocking):", err);
       });
    }

    return { apiKey: process.env.SHOPIFY_API_KEY || "" };
  }

  // 4. No active subscription -> Redirect to Payment
  // Preserve query parameters (embedded, shop, host, hmac, etc.)
  const redirectUrl = new URL(`${process.env.SHOPIFY_APP_URL}/app/payment`);
  redirectUrl.search = url.search;
  return Response.redirect(redirectUrl.toString());
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <QueryClientProvider client={queryClient}>
      <ShopifyAppProvider embedded apiKey={apiKey}>
        <PolarisAppProvider i18n={translations}>
          <ShopProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <Outlet />
            </TooltipProvider>
          </ShopProvider>
        </PolarisAppProvider>
      </ShopifyAppProvider>
    </QueryClientProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const data = useRouteLoaderData<typeof loader>("routes/app");

  if (data && data.apiKey) {
    return (
      <ShopifyAppProvider embedded apiKey={data.apiKey}>
        <PolarisAppProvider i18n={translations}>
          {boundary.error(error)}
        </PolarisAppProvider>
      </ShopifyAppProvider>
    );
  }

  return boundary.error(error);
}

export const links: LinksFunction = () => [{ rel: "stylesheet", href: polarisStyles }];

export const headers: HeadersFunction = (args) => boundary.headers(args);
