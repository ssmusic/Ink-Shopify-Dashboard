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

  // Public paths — let through immediately without any DB/billing check
  if (path === "/app/payment" || path === "/app/payment/callback" || path === "/app" || path === "/app/") {
    return { apiKey: process.env.SHOPIFY_API_KEY || "" };
  }

  // 1. Check Firestore for Merchant Data (fast path)
  let merchant: any = null;
  try {
    merchant = await getMerchant(shop);
  } catch (err) {
    // Firestore cold-start timeout or error — don't crash, fall through to billing check
    console.warn("[App] getMerchant failed (non-fatal):", err);
  }

  const paymentStatus = merchant?.payment_status;
  const inkApiKey = merchant?.ink_api_key;

  // FAST PATH: Merchant already has a valid API key in Firestore.
  // This means they've already paid and been set up — skip the billing API entirely.
  // This is the most common case and saves 1-3s on every page load.
  if (inkApiKey && inkApiKey !== "undefined" && inkApiKey !== "sk_test_fallback") {
    // Fire-and-forget carrier service registration — never blocks the response
    const appUrl = process.env.SHOPIFY_APP_URL || "";
    if (appUrl) {
      ensureCarrierServiceRegistered(admin, appUrl).catch((err) =>
        console.error("[App] Carrier service registration error (non-blocking):", err)
      );
    }
    return { apiKey: process.env.SHOPIFY_API_KEY || "" };
  }

  // SLOW PATH: No API key yet — check Shopify Billing API to see if they have a subscription
  // (Only reached for brand-new installs or merchants whose Firestore record is incomplete)
  let hasActiveSubscription = false;
  try {
    const billingResponse = await admin.graphql(
      `#graphql
      query {
        currentAppInstallation {
          activeSubscriptions {
            id name test status
          }
        }
      }`
    );
    const billingData = await billingResponse.json();
    const subscriptions = billingData.data?.currentAppInstallation?.activeSubscriptions || [];
    hasActiveSubscription = subscriptions.length > 0;
  } catch (err) {
    console.error("[App] Billing check failed:", err);
  }

  if (hasActiveSubscription) {
    // Has subscription but no API key yet — redirect to callback to generate it
    if (!inkApiKey) {
      return Response.redirect(`${process.env.SHOPIFY_APP_URL}/app/payment/callback?charge_id=restore`);
    }

    const appUrl = process.env.SHOPIFY_APP_URL || "";
    if (appUrl) {
      ensureCarrierServiceRegistered(admin, appUrl).catch((err) =>
        console.error("[App] Carrier service registration error (non-blocking):", err)
      );
    }
    return { apiKey: process.env.SHOPIFY_API_KEY || "" };
  }

  // No active subscription → redirect to payment
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
