// WHERE INK'S SCREEN LINKS OUT — the dashboard, and each recent order's record.
//
// ink's two screens (/app/ink, /app/ink/settings) showed the mark and the dial
// and led nowhere (day-one defect, 2026-09-22). Two doors, both reused:
//
//   the dashboard — the same single-use magic token the Ritualist's
//     /app/dashboard mints (POST /auth/magic-tokens, admin-gated), opened at
//     www.in.ink/welcome, which redeems it and lands signed in. The dashboard
//     reads the record's plan, so an ink merchant gets ink's menu.
//   the record — each recent order's public page, www.in.ink/verify/<proof_id>.
//     The proof id is the order's own ink.proof_reference metafield, written
//     at enrol under ink's scopes (webhooks.orders_create.ts). One Admin read,
//     read_orders only: no customer, no address, no line items.
//
// Both fail open: a missing token or a refused read leaves the screen as it
// was, never an error page.

import { mintMagicToken } from "./ink-api.server";

export const RECENT_ORDERS_QUERY = `#graphql
  query InkRecentOrders($first: Int!) {
    orders(first: $first, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        proof: metafield(namespace: "ink", key: "proof_reference") { value }
      }
    }
  }`;

const RECORD_BASE = "https://www.in.ink/verify/";
const PROOF_ID = /^proof_[0-9a-f]{24}$/;

/** The order's public record, or null when the value is not a proof id. */
export function recordUrlFor(proofId: string | null | undefined): string | null {
  return typeof proofId === "string" && PROOF_ID.test(proofId) ? `${RECORD_BASE}${proofId}` : null;
}

export type RecentOrderRecord = { id: string; name: string; createdAt: string | null; recordUrl: string | null; proofId: string | null };

type OrderNode = { id?: unknown; name?: unknown; createdAt?: unknown; proof?: { value?: unknown } | null };
type RecentOrdersBody = { data?: { orders?: { nodes?: (OrderNode | null)[] } } };
type AdminGraphql = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{ json: () => Promise<unknown> }> };

export async function readRecentOrderRecords(admin: AdminGraphql, first = 5): Promise<RecentOrderRecord[]> {
  try {
    const res = await admin.graphql(RECENT_ORDERS_QUERY, { variables: { first } });
    const body = (await res.json()) as RecentOrdersBody | null;
    const nodes = body?.data?.orders?.nodes ?? [];
    const rows: RecentOrderRecord[] = [];
    for (const n of nodes) {
      if (!n || typeof n.id !== "string") continue;
      const recordUrl = recordUrlFor(typeof n.proof?.value === "string" ? n.proof.value : null);
      rows.push({
        id: n.id,
        name: typeof n.name === "string" ? n.name : n.id,
        createdAt: typeof n.createdAt === "string" ? n.createdAt : null,
        recordUrl,
        // The record's own id when (and only when) it is one: the door's key.
        proofId: recordUrl ? (n.proof!.value as string) : null,
      });
    }
    return rows;
  } catch (err) {
    console.warn("[ink] recent orders read failed (the screen shows none):", err);
    return [];
  }
}

/** A signed-in door into the dashboard, minted per press (the token is single-use). */
export async function dashboardDoorUrl(shop: string): Promise<string> {
  const { token } = await mintMagicToken(shop);
  const base = process.env.PARALLEL_APP_URL || "https://www.in.ink";
  return `${base}/welcome?token=${encodeURIComponent(token)}`;
}
