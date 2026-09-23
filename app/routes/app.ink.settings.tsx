// INK'S SETTINGS — the store's connection, its privacy requests, and the one
// line that leads up.
//
// Mounted under APP_FLAVOR=ink only (server/ink-mounts.mjs).
//
//   · NO DESTINATION CHOICE. The forward dial (`flash_forward`, where the buyer
//     goes after the white page) is gone from Settings: Sam, 2026-09-23, "we
//     shouldnt get involved with their flow if we dont have to" · "preserve the
//     original destination automatically and remove this choice from normal
//     Settings". The retired form answers 405, so nothing here writes the
//     shared backend dial (docs/ink-original-destination.md).
//
//   · ADD THE RITUALIST. The paid product that includes ink: one link to its
//     listing, from env RITUALIST_LISTING_URL (an https apps.shopify.com
//     address, nothing else). Without the address the card is not drawn at
//     all — a disabled button is a dead control, and App Store review fails a
//     screen for one (review, 2026-09-23, B2).
//
// Every visible string is PLACEHOLDER copy — Sam writes the words.

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
