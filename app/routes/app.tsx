import { forwardRef } from "react";
import { Outlet, useLoaderData, useRouteError, useRouteLoaderData, Link, type HeadersFunction, type LoaderFunctionArgs, type LinksFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import { authenticate, registerWebhooks } from "../shopify.server";
import { createMerchant } from "../services/ink-api.server";
import { getMerchant, updateMerchant } from "../services/merchant.server";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../services/notification-settings";

import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import translations from "@shopify/polaris/locales/en.json";

import { Toaster } from "../components/ui/toaster";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Billing is owned by Shopify App Pricing / the Shopify Billing API, never
  // by INK's internal merchant provisioning. This loader may create the
  // operational merchant record needed for orders/pages, but it must not mark
  // a merchant as subscribed or paid.
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
      // Real owner identity, not the old admin@{domain} placeholder — that
      // placeholder made the magic link the ONLY door into in.ink (the
      // merchant could never log in with their real email).
      let shopName = session.shop;
      let ownerEmail = "";
      try {
        const res = await admin.graphql(`#graphql
          query ShopIdentity { shop { name email contactEmail } }`);
        const shopData = (await res.json())?.data?.shop;
        if (shopData?.name) shopName = shopData.name;
        const realEmail = shopData?.email || shopData?.contactEmail;
        if (realEmail) ownerEmail = realEmail;
      } catch (e) {
        console.warn("[App] shop identity fetch failed; provisioning will retry:", e);
      }
      if (!ownerEmail) {
        console.warn(`[App] No Shopify owner/contact email for ${session.shop}; provisioning will retry on the next app load`);
        return;
      }
      const inkData = await createMerchant(session.shop, shopName, ownerEmail);
      if (inkData?.api_key) {
        // Seed notification_settings at provision. Every sender treats a
        // MISSING notification_settings as "send nothing" — so a merchant
        // without one had toggles that silently did not exist, while the
        // Settings page rendered them all as ON (audit 2026-08-07). The
        // Notifications GET backfills too, so installs predating this heal
        // on their first visit to the tab.
        await updateMerchant(session.shop, {
          ink_api_key: inkData.api_key,
          verified_delivery_mode: "background",
          notification_settings: DEFAULT_NOTIFICATION_SETTINGS,
        });
      }
    }
  })().catch((err) =>
    console.error("[App] INK self-provision error (non-blocking):", err)
  );

  // No pricingUrl: the Partner Dashboard exposes one public Free plan, so
  // there is no paid charge or approval flow to launch. The previous version built
  // `…/charges/${SHOPIFY_APP_HANDLE || "ink-verified-delivery"}/pricing_plans`
  // — but SHOPIFY_APP_HANDLE is set in NO environment (verified against Cloud
  // Run 2026-08-01), so that fallback was always what shipped, and it is not
  // this app's handle. It would have put a Shopify 404 in front of the
  // reviewer on the one screen the rejection was about.
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};


// THE "200 ERROR PAGE" — root cause, and it was never the loader.
//
// Polaris renders every `url` prop it is given — Page backAction, Button url,
// Link url — through UnstyledLink, which does exactly this:
//
//     const LinkComponent = useLink();
//     if (LinkComponent) return <LinkComponent {...props} />;
//     return <a href={url} ... />;            // ← when no linkComponent is set
//
// Nothing in this app ever set one, so those were plain anchors. A plain
// <a href> inside the embedded iframe is a FULL DOCUMENT navigation: it drops
// ?shop=&host=&id_token=, the request arrives unauthenticated, and the server
// answers with App Bridge's re-authorize page — carrying status 200. The iframe
// renders that, and the merchant sees a screen whose body is the text "200".
//
// Measured 2026-08-20 in Cloud Run, which is the only reason it was found:
// clicking through to Billing logs `GET /app/billing.data` — authenticated,
// session loaded, 70ms. Clicking Billing's BACK ARROW logs `GET /app/settings`
// — a document request, no params, no "Authenticating admin request" line at
// all, 10ms — and `/app/settings.data` never appears anywhere in the logs. The
// settings loader was never reached. All three earlier fixes (#88, #91, #92)
// treated the loader, which is why logging out and back in changed nothing.
//
// Routing Polaris urls through React Router's Link makes them client-side
// navigations, which keep the embedded session. This covers the whole class,
// not just Billing's back arrow: app/components/settings/SettingsAdvanced.tsx
// carries the identical backAction.
const PolarisLink = forwardRef<HTMLAnchorElement, any>(function PolarisLink(
  { url = "", external, target, children, ...rest },
  ref,
) {
  // Anything leaving the app stays a real anchor.
  if (external || target === "_blank" || /^(https?:|mailto:|tel:)/i.test(url)) {
    return (
      <a href={url} target={target ?? "_blank"} rel="noopener noreferrer" ref={ref} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={url} ref={ref} {...rest}>
      {children}
    </Link>
  );
});

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <ShopifyAppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={translations} linkComponent={PolarisLink}>
        {/* Shopify's own left-rail navigation for the app (App Bridge NavMenu):
            three destinations, and the first is home. The custom tab bar it
            replaces (TopNav) was a second nav inside Shopify's nav. */}
        <NavMenu>
          <Link to="/app" rel="home">Home</Link>
          <Link to="/app/billing">Billing</Link>
          <Link to="/app/help">Help</Link>
        </NavMenu>
        <Toaster />
        <Outlet />
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
        <PolarisAppProvider i18n={translations} linkComponent={PolarisLink}>
          {boundary.error(error)}
        </PolarisAppProvider>
      </ShopifyAppProvider>
    );
  }

  return boundary.error(error);
}

export const links: LinksFunction = () => [{ rel: "stylesheet", href: polarisStyles }];

export const headers: HeadersFunction = (args) => boundary.headers(args);
