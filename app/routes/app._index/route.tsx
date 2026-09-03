import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData, useRouteError, type ActionFunctionArgs, type HeadersFunction, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import { getMerchant } from "../../services/merchant.server";
import { mintMagicToken } from "../../services/ink-api.server";
import { loadEnrolledOrders } from "../../services/enrolled-orders.server";
import HomePage, { type HomeData } from "../../components/home/HomePage";

// /app IS the app. See components/home/HomePage.tsx for what it is and why.

export const loader = async ({ request }: LoaderFunctionArgs): Promise<HomeData> => {
  const { admin, session } = await authenticate.admin(request);

  // NEVER let a failed shop query throw from a component route — the
  // reauthorize Response would render as the "200 error page" (see
  // app/contracts/route-contracts.test.ts). Every field has a fallback.
  let shopName = session.shop.replace(".myshopify.com", "");
  let contactEmail = "";
  try {
    const res = await admin.graphql(`#graphql
      query HomeShop { shop { name contactEmail email } }`);
    const shop = (await res.json())?.data?.shop;
    if (shop?.name) shopName = shop.name;
    contactEmail = shop?.contactEmail || shop?.email || "";
  } catch (e) {
    console.warn("[home] shop query failed; rendering from session:", e);
  }

  const merchant = await getMerchant(session.shop);
  let installedDate = "";
  if (merchant?.createdAt) {
    const d = new Date(merchant.createdAt);
    if (!Number.isNaN(d.getTime()))
      installedDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
  }

  const enrolled = await loadEnrolledOrders(admin, 25);

  // PLAIN OBJECT, never a Response — React Router 7 serialises it.
  return {
    shopDomain: session.shop,
    shopName,
    contactEmail,
    installedDate,
    connected: Boolean(merchant?.ink_api_key),
    ...enrolled,
  };
};

// The door. Mint a single-use magic-login token for this shop and hand back
// the www.in.ink/welcome URL the merchant can open already signed in.
export const action = async ({ request }: ActionFunctionArgs): Promise<{ url: string | null; error: string | null }> => {
  const { session } = await authenticate.admin(request);
  try {
    const { token } = await mintMagicToken(session.shop);
    const base = process.env.PARALLEL_APP_URL || "https://www.in.ink";
    return { url: `${base}/welcome?token=${encodeURIComponent(token)}`, error: null };
  } catch (err) {
    console.error("[home] mint magic token failed:", err);
    return { url: null, error: "Couldn’t open the Ritualist. Try again in a moment." };
  }
};

export default function Home() {
  const data = useLoaderData<typeof loader>();
  return <HomePage {...data} />;
}

// EVERY EMBEDDED ROUTE NEEDS SHOPIFY'S BOUNDARY — a reauthorize throw without
// boundary.error() renders its STATUS: the "200 error page" of rejection 2.1.1.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
