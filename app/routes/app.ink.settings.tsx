import {
  data as routeData,
  useLoaderData,
  useRouteError,
  type ActionFunctionArgs,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import InkSettingsView from "../components/InkSettingsView";
import { readInkMerchant } from "../services/ink-merchant.server";
import { readPrivacyRequests } from "../services/ink-privacy.server";
import { readInkConnection } from "../services/ink-connection.server";

function listingUrl(raw: string | undefined) {
  try {
    const u = new URL(raw || "");
    return u.protocol === "https:" &&
      u.hostname === "apps.shopify.com" &&
      !u.username &&
      !u.password
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const view = await readInkMerchant(session.shop);
  const [privacy, connection] = await Promise.all([
    readPrivacyRequests(session.shop).catch(() => null),
    readInkConnection({ admin, shop: session.shop, apiKey: view.doc?.ink_api_key, shopId: view.shopId }),
  ]);
  return routeData(
    {
      ritualistUrl: listingUrl(process.env.RITUALIST_LISTING_URL),
      privacy,
      connection,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
};
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  // Retired forms must not keep changing a shared backend destination dial.
  return new Response("Settings are read-only.", {
    status: 405,
    headers: { Allow: "GET", "Cache-Control": "private, no-store" },
  });
};
export default function InkSettings() {
  return <InkSettingsView data={useLoaderData<typeof loader>()} />;
}
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
export const headers: HeadersFunction = (args) => {
  const headers = new Headers(boundary.headers(args));
  headers.set("Cache-Control", "private, no-store");
  return headers;
};
