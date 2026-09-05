import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData, type LoaderFunctionArgs, useRouteError, type HeadersFunction } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { getInventory, getInventoryByShopDomain, getShopIdByDomain } from "../services/ink-api.server";
import { findMerchantDocRef } from "../services/merchant-doc.server";
import Settings from "../components/settings/Settings";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  
  // 1. Get shop details from Shopify — NEVER let this throw.
  //
  // THIS IS THE "200 ERROR PAGE". When a call cannot be authorised,
  // @shopify/shopify-app-react-router THROWS a Response with status 200 and
  // X-Shopify-API-Request-Failure-Reauthorize headers, for App Bridge to
  // intercept. On a DOCUMENT request that works. On a CLIENT-SIDE navigation
  // it does not: single-fetch serialises the throw into the turbo-stream as an
  // ErrorResponse, and React Router renders `error.status` — a page whose
  // entire body is the text "200". Measured 2026-08-20: loading /app/settings
  // directly renders fine; navigating to it from Billing renders "200".
  //
  // That is the reviewer's exact gesture. Billing's backAction points here, so
  // the one navigation they were asked to make was the one that broke.
  //
  // app.tsx already wraps its identical shop query in try/catch, which is why
  // the dashboard survives the same condition. Settings did not, so it was the
  // only route that could take the whole screen down.
  //
  // Every field below already has a fallback, so a failed query costs a shop
  // name — not the page.
  let shop: { name?: string; primaryDomain?: { host?: string }; contactEmail?: string } | null = null;
  try {
    const response = await admin.graphql(
      `#graphql
        query {
          shop {
            name
            primaryDomain { url host }
            contactEmail
            myshopifyDomain
          }
        }
      `
    );
    const shopData = await response.json();
    shop = shopData.data?.shop ?? null;
  } catch (e) {
    console.warn("[Settings Loader] shop query failed; rendering from session:", e);
  }
  
  // 2. Get Merchant details from Firestore to get accurate install date and api_key
  // Empty, not "Not available" — the component hides the row when there is no
  // date, and a field reading "Not available" looks like a failure rather than
  // an absence.
  let installedDate = "";
  let inventoryStr = "0";
  let usedStr = "0";

  try {
    // findMerchantDocRef — the same resolver the fulfillment webhook uses.
    // This used to be a private doc-id-then-"shopDomain" lookup, which is
    // exactly the §17.2 landmine: on a store holding two merchant docs, the
    // install date could live on the doc this private lookup never checked
    // (a random-id backend doc, or one using the snake_case shop_domain
    // field), and this row would read "Not available" even though the real
    // doc has a createdAt.
    const hit = await findMerchantDocRef(firestore, session.shop);
    const data: Record<string, any> | undefined = hit?.data;
    if (data?.createdAt) {
      const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      if (!Number.isNaN(date.getTime())) {
        installedDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
      }
    }

    // 3. Fetch real inventory — use admin-level Firestore lookup (no API key needed)
    try {
      const invInfo = await getInventoryByShopDomain(session.shop);
      if (invInfo) {
        inventoryStr = (invInfo.current_count || 0).toString();
        usedStr = (invInfo.used_this_month || 0).toString();
      }
    } catch (e) {
      console.warn("Could not fetch actual inventory:", e);
    }
  } catch (firestoreErr) {
    console.warn("[Settings Loader] Firestore unavailable, skipping install date:", firestoreErr);
  }

  const payload = {
     shopName: shop?.name || session.shop.replace(".myshopify.com", ""),
     shopDomain: session.shop,
     shopId: "", // Will be populated below if available
     primaryDomain: shop?.primaryDomain?.host || session.shop,
     contactEmail: shop?.contactEmail || "",
     installedDate,
     inventoryData: {
       current: inventoryStr,
       usedThisPeriod: usedStr
     }
  };

  // Populate shopId if found during inventory fetch
  try {
    payload.shopId = await getShopIdByDomain(session.shop);
  } catch (e) {
    console.warn("Could not fetch shopId:", e);
  }

  // PLAIN OBJECT, NOT A Response. This is React Router 7, where a route with
  // a component returns its data directly and the framework serialises it.
  // Returning Remix v2's `json()` here hands single-fetch a raw Response it
  // cannot encode; the failure bubbles to app.tsx's boundary.error(), which
  // renders the Response's STATUS — a page containing the bare text "200".
  //
  // That is Shopify rejection 2.1.1, second round, verbatim: "going to the
  // billing section and navigating back ... shows an 200 error page". The
  // Billing page's backAction points at /app/settings, so the reviewer hit it
  // on the one navigation they were asked to make.
  return payload;
}

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  return <Settings initialData={data} />;
}

// EVERY EMBEDDED ROUTE NEEDS SHOPIFY'S BOUNDARY.
// When a session needs re-auth, @shopify/shopify-app-react-router THROWS a
// Response with status 200 carrying X-Shopify-API-Request-Failure-Reauthorize
// headers, for App Bridge to intercept. Without boundary.error(), React Router
// treats it as a route error response and renders its STATUS — a page whose
// entire body is the text "200". That is Shopify rejection 2.1.1, round two:
// "going to the billing section and navigating back ... shows an 200 error
// page". Billing had this block; /app/settings, its own backAction target, did
// not. `headers` matters too: boundary.headers forwards the reauthorize
// headers App Bridge is waiting for.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
