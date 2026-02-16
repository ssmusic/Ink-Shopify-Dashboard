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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  // Auto-register carrier service for shipping rates (idempotent)
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  if (appUrl) {
    ensureCarrierServiceRegistered(admin, appUrl).catch((err) => {
      console.error("[App] Carrier service registration error (non-blocking):", err);
    });
  }
  
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <ShopifyAppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={translations}>
        <ShopProvider>
          <NavMenu>
            <Link to="/app" rel="home">Home</Link>
            <Link to="/app/dashboard">Dashboard</Link>
            <Link to="/app/tagged-shipments">Tagged Shipments</Link>
            <Link to="/app/help">Help</Link>
            <Link to="/app/settings">Settings</Link>
            <Link to="/app/reorder-tags">Reorder Tags</Link>
            <Link to="/app/debug">Debug</Link>
          </NavMenu>
          <Outlet />
        </ShopProvider>
      </PolarisAppProvider>
    </ShopifyAppProvider>
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
