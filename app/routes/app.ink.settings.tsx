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
import { patchMerchant } from "../services/ink-api.server";
import { updateMerchant } from "../services/merchant.server";
import {
  FLASH_FORWARDS,
  readInkMerchant,
  type FlashForward,
} from "../services/ink-merchant.server";
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
      flashForward: (view.backend?.flash_forward ??
        null) as FlashForward | null,
      canSave: Boolean(view.shopId),
      ritualistUrl: listingUrl(process.env.RITUALIST_LISTING_URL),
      privacy,
      connection,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
};
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const next = String(form.get("flash_forward") || "") as FlashForward;
  const no = (error: string) => ({
    ok: false,
    flashForward: null as FlashForward | null,
    error,
  });
  if (!(FLASH_FORWARDS as readonly string[]).includes(next))
    return no("Choose a destination.");
  const view = await readInkMerchant(session.shop);
  if (!view.shopId)
    return no("Store setup is incomplete. Refresh to try again.");
  try {
    const merchant = await patchMerchant(view.shopId, { flash_forward: next });
    if (merchant?.flash_forward !== next)
      return no(
        "The destination could not be confirmed. Refresh before trying again.",
      );
    await updateMerchant(session.shop, { ink_flash_forward: next } as any);
    return { ok: true, flashForward: next, error: null };
  } catch {
    console.error("[ink settings] save could not be confirmed");
    return no(
      "The destination could not be confirmed. Refresh before trying again.",
    );
  }
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
