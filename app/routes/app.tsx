import { Outlet, useLoaderData, useRouteError, useRouteLoaderData, Link, type HeadersFunction, type LoaderFunctionArgs, type LinksFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import { authenticate, registerWebhooks } from "../shopify.server";
import { ShopProvider } from "../contexts/ShopContext";
import { ensureCarrierServiceRegistered } from "../services/carrier-service.server";
import { createMerchant } from "../services/ink-api.server";
import { getMerchant, updateMerchant } from "../services/merchant.server";

import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import translations from "@shopify/polaris/locales/en.json";

import { Toaster } from "../components/ui/toaster";
import { Toaster as Sonner } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Billing gate temporarily disabled while the app is configured as a
  // Managed Pricing app in Shopify Partners. Managed Pricing handles
  // subscriptions through the App Store listing — calling
  // `appSubscriptionCreate` from /app/payment errors out with
  // "Managed Pricing Apps cannot use the Billing API (to create charges)".
  //
  // Until billing is reconciled (either switch off Managed Pricing in
  // Partners, or rewrite this app to read activeSubscriptions only), we
  // let every authenticated merchant through. Re-enable the fast/slow
  // path below by reverting this commit.
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  if (appUrl) {
    ensureCarrierServiceRegistered(admin, appUrl).catch((err) =>
      console.error("[App] Carrier service registration error (non-blocking):", err)
    );
  }
  registerWebhooks({ session }).catch((err) =>
    console.error("[App] Webhook registration error (non-blocking):", err)
  );

  // Self-provision on app load. Managed-install apps (use_legacy_install_flow =
  // false) don't fire afterAuth on token exchange — so the install hook never
  // runs for these stores. This loader does, on every embedded load. Seed the
  // INK merchant's api_key into merchants/{shop} + default to automatic the
  // first time only (guarded on ink_api_key so an existing key is never
  // re-rotated). Non-blocking: never delays or breaks the app render.
  (async () => {
    const existing = await getMerchant(session.shop);
    if (!existing?.ink_api_key) {
      const inkData = await createMerchant(session.shop, session.shop, `admin@${session.shop}`);
      if (inkData?.api_key) {
        await updateMerchant(session.shop, {
          ink_api_key: inkData.api_key,
          verified_delivery_mode: "background",
          payment_status: "active",
        });
      }
    }
  })().catch((err) =>
    console.error("[App] INK self-provision error (non-blocking):", err)
  );

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
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
