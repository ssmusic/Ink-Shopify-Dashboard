// THE DOOR ON THE SHOP — one metafield, and the order status page speaks.
//
// The order-page-block extension (extensions/order-page-block) renders on the
// Order status page — the page Shopify's email buttons open — but ONLY when
// the shop carries an `ink:order_door` metafield holding the brand's door
// base (`https://{brand}.in.ink/o/`). No metafield, no surface. This service
// is the only writer of that metafield, so turning the block on or off for a
// store is a server-side act; the extension never redeploys.
//
// THREE RULES, each paid for elsewhere:
//
//  1. THE METAFIELD IS ITS OWN GUARD. Steady state is ONE cheap read per
//     fulfillment event and nothing else — no Alan call, no Firestore
//     schema recording "did we write it", no drift between a record and the
//     truth. Brand resolution (an Alan proof fetch + doc merge) runs only
//     when the metafield is absent, i.e. once per merchant ever. The
//     register-quota lesson (#954): per-event list calls are a real bill.
//  2. THE SLUG COMES FROM THE ONE AUTHOR. `resolveBrandPageUrl` merges the
//     backend merchant doc over the embed's — the same resolution the
//     tracking rewrite uses. brand_slug ONLY: a domain-derived guess mints
//     `sm-test-hhawzn52.in.ink`, a host that looks right and 404s (#1016).
//     No slug ⇒ no write, and any existing door is DELETED — a wrong door
//     is worse than none (the Clare-V law).
//  3. NEVER FATAL. This runs on webhook paths where the only unforgivable
//     outcome is a non-200. Every failure logs and returns an outcome.
//
// The kill switch mirrors branded_tracking_link: default ON for every
// merchant; `merchants/{shop}.order_door_block === false` turns one store
// off (the metafield is deleted on the next fulfillment event), and the
// extension goes dark there with no deploy.

import { resolveBrandPageUrl } from "./brand-page-url.server";

export type OrderDoorOutcome =
  | "written"
  | "deleted"
  | "unchanged"
  | "skipped_off"
  | "skipped_no_slug"
  | "failed";

export interface OrderDoorResult {
  outcome: OrderDoorOutcome;
  value?: string;
  detail?: string;
}

const GUARD_QUERY = `#graphql
  query InkOrderDoorGuard {
    shop {
      id
      metafield(namespace: "ink", key: "order_door") { id value }
    }
  }
`;

const SET_MUTATION = `#graphql
  mutation InkOrderDoorSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

const DELETE_MUTATION = `#graphql
  mutation InkOrderDoorDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

/** The door base for one brand slug — the exact string the extension trusts
 *  (`^https://[a-z0-9][a-z0-9-]*\.in\.ink/o/$`). Exported so the test and the
 *  extension's expectation can never drift apart silently. */
export function orderDoorBase(slug: string): string {
  return `https://${slug}.in.ink/o/`;
}

export async function assertOrderDoorMetafield({
  admin,
  shop,
  merchantData,
  merchantApiKey,
  proofId,
  label = "order-door",
}: {
  admin: { graphql: (query: string, opts?: any) => Promise<Response> };
  shop: string;
  merchantData: Record<string, any>;
  merchantApiKey?: string | null;
  /** A proof on this shop — how the one-author resolution finds the backend
   *  merchant doc. Any current proof works; the slug is per-merchant. */
  proofId: string;
  label?: string;
}): Promise<OrderDoorResult> {
  try {
    // 1 · What does the shop carry right now? (The whole cost, steady state.)
    const guardRes = await admin.graphql(GUARD_QUERY);
    const guard: any = await guardRes.json();
    const shopGid: string | undefined = guard?.data?.shop?.id;
    const current: string = String(guard?.data?.shop?.metafield?.value || "");
    if (!shopGid) {
      console.warn(`🚪 ${label}: shop id unreadable for ${shop} — leaving the door as is.`);
      return { outcome: "failed", detail: "no shop id" };
    }

    const off = merchantData?.order_door_block === false;

    // 2 · OFF ⇒ the only work is tearing down a door that exists.
    if (off) {
      if (!current) return { outcome: "skipped_off" };
      const res = await admin.graphql(DELETE_MUTATION, {
        variables: { metafields: [{ ownerId: shopGid, namespace: "ink", key: "order_door" }] },
      });
      const errors = (await res.json())?.data?.metafieldsDelete?.userErrors ?? [];
      if (errors.length > 0) {
        const detail = errors.map((e: any) => e.message).join("; ");
        console.error(`🚪 ${label}: could not remove the door for ${shop} — ${detail}`);
        return { outcome: "failed", detail };
      }
      console.log(`🚪 ${label}: door removed for ${shop} (order_door_block=false).`);
      return { outcome: "deleted" };
    }

    // 3 · A door already stands ⇒ done. Resolution never runs again.
    //     (To re-point a renamed brand: delete the metafield or flip
    //     order_door_block off and on; the next fulfillment rebuilds it.)
    if (current) return { outcome: "unchanged", value: current };

    // 4 · First time only: resolve the brand the way the tracking rewrite
    //     does, and refuse to write anything a doc did not say.
    const resolved = await resolveBrandPageUrl({ merchantApiKey, proofId, shop, merchantData, label });
    const slug = String(resolved?.brandDoc?.brand_slug ? resolved.brandSlug : "").trim();
    if (!slug) {
      console.log(
        `🚪 ${label}: no brand_slug on the merchant doc for ${shop} — no door (never a derived host).`,
      );
      return { outcome: "skipped_no_slug" };
    }

    const value = orderDoorBase(slug);
    const setRes = await admin.graphql(SET_MUTATION, {
      variables: {
        metafields: [
          {
            ownerId: shopGid,
            namespace: "ink",
            key: "order_door",
            type: "single_line_text_field",
            value,
          },
        ],
      },
    });
    const setErrors = (await setRes.json())?.data?.metafieldsSet?.userErrors ?? [];
    if (setErrors.length > 0) {
      const detail = setErrors.map((e: any) => e.message).join("; ");
      console.error(`🚪 ${label}: Shopify refused the door for ${shop} — ${detail}`);
      return { outcome: "failed", detail };
    }
    console.log(`✅ ${label}: order status page carries the door for ${shop} → ${value}`);
    return { outcome: "written", value };
  } catch (e: any) {
    // Webhook discipline: a missing door is a quieter page, never a non-200.
    console.error(`🚪 ${label}: threw (non-fatal) — ${e?.message ?? e}`);
    return { outcome: "failed", detail: String(e?.message ?? e) };
  }
}
