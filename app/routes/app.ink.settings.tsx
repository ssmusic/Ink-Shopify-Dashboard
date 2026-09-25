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
import { exportPrivacyRequest, readPrivacyRequests } from "../services/ink-privacy.server";
import { readInkConnection } from "../services/ink-connection.server";
import { readEmailLine } from "../services/email-line.server";
import { readBuyerDoor, saveBuyerDoor } from "../services/buyer-door-choice.server";

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
  const [privacy, connection, emailLine, buyerDoor] = await Promise.all([
    readPrivacyRequests(session.shop).catch(() => null),
    readInkConnection({ admin, shop: session.shop, apiKey: view.doc?.ink_api_key, shopId: view.shopId }),
    readEmailLine(session.shop, view.shopId).catch(() => null),
    readBuyerDoor(session.shop),
  ]);
  return routeData(
    {
      ritualistUrl: listingUrl(process.env.RITUALIST_LISTING_URL),
      privacy,
      connection,
      emailLine,
      buyerDoor,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  // Two things Settings does: hand the merchant a customer's data for a
  // customers/data_request (services/ink-privacy.server.ts), and — Sam,
  // 2026-09-25, "if he just uses ink, no control of this for me" — save where
  // the tracking link goes (services/buyer-door-choice.server.ts), one word,
  // through the backend's admin door. The retired 09-23 form (a bare
  // `flash_forward` field) is still refused below: only the named intent
  // writes the shared dial.
  if (form.get("intent") === "privacy_export") {
    const result = await exportPrivacyRequest(session.shop, String(form.get("id") || "")).catch(() => ({
      ok: false as const,
      note: "The data could not be prepared. Try again.", // PLACEHOLDER
    }));
    return routeData(result, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (form.get("intent") === "buyer_door") {
    const result = await saveBuyerDoor(session.shop, form.get("choice"));
    return routeData(result, { headers: { "Cache-Control": "private, no-store" } });
  }
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
