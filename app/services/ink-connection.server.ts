import { merchantRead } from "./ink-reader.server";
import { kpisFromBody } from "./ink-kpis.server";

export type InkConnection = {
  shop: string;
  name: string;
  logoUrl: string | null;
  shopify: "connected" | "unavailable" | "not_checked";
  ink: "connected" | "unavailable" | "setup" | "not_checked";
  checkedAt: string | null;
};

type Admin = { graphql: (query: string) => Promise<Response> };
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const IDENTITY_QUERY = `#graphql
  query InkConnection { shop { name myshopifyDomain } }`;
// Shopify supports this public branding query without a Storefront token.
// Only the authenticated session's shop is queried. No customer data, Admin
// token, merchant key, theme access or additional scope is involved.
// https://community.shopify.dev/t/21642/5
const LOGO_QUERY = `query InkStoreLogo {
  shop { brand {
    squareLogo { image { url } }
    logo { image { url } }
  } }
}`;

function shopifyImage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" &&
      url.hostname === "cdn.shopify.com" &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function readShopLogo(
  shop: string,
  fetchImpl = fetch,
): Promise<string | null> {
  if (!SHOP_DOMAIN.test(shop)) return null;
  try {
    const response = await fetchImpl(
      `https://${shop}/api/2026-07/graphql.json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: LOGO_QUERY }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok) return null;
    const body = await response.json();
    if (body.errors?.length) return null;
    const brand = body.data?.shop?.brand;
    return (
      shopifyImage(brand?.squareLogo?.image?.url) ||
      shopifyImage(brand?.logo?.image?.url)
    );
  } catch {
    return null;
  }
}

export async function readInkConnection({
  admin,
  shop,
  apiKey,
  shopId,
  fetchImpl = fetch,
}: {
  admin: Admin;
  /** Must come from authenticate.admin, never from form or query parameters. */
  shop: string;
  apiKey: string | null | undefined;
  shopId: string;
  fetchImpl?: typeof fetch;
}): Promise<InkConnection> {
  const [identity, logoUrl, backend] = await Promise.all([
    (async () => {
      try {
        const response = await admin.graphql(IDENTITY_QUERY);
        if (!response.ok) return null;
        const body = await response.json();
        const value = body.data?.shop;
        return !body.errors?.length &&
          value?.myshopifyDomain === shop &&
          typeof value.name === "string" &&
          value.name.trim()
          ? { name: value.name.trim() }
          : null;
      } catch {
        return null;
      }
    })(),
    readShopLogo(shop, fetchImpl),
    merchantRead(apiKey, "merchant-insights", fetchImpl),
  ]);
  const scoped =
    typeof backend?.shop_id === "string" &&
    backend.shop_id.startsWith("shop_") &&
    (!shopId || backend.shop_id === shopId);
  return {
    shop,
    name: identity?.name || shop,
    logoUrl,
    shopify: identity ? "connected" : "unavailable",
    ink: !apiKey
      ? "setup"
      : scoped && kpisFromBody(backend)
        ? "connected"
        : "unavailable",
    checkedAt: new Date().toISOString(),
  };
}
