// THE DISCOUNTS DOOR, embed side (Track C, 2026-09-04).
//
// Shopify's DISCOUNTS_* webhook bodies are THIN — create/update carry only
// the gid, title, status and the clock; delete carries the gid and
// deleted_at; redeemcode_added/removed carry the gid and one code
// (https://shopify.dev/docs/api/webhooks?reference=toml). Everything a
// merchant would recognise as "the sale" — the dates, Shopify's own summary
// in their words, the codes, the arithmetic — lives on the DiscountNode and
// needs `read_discounts` (https://shopify.dev/docs/api/admin-graphql/2025-10/queries/discountNodes).
//
// So this module does two things and nothing else: reads a node back (one
// on a webhook, every one on a backfill) and hands what Shopify said to the
// backend's door, POST /api/promos/shopify, which owns the record shape and
// merges every event onto one row. The embed never re-words a discount.
//
// Field names below were checked against the 2025-10 schema (introspected
// 2026-09-04): `summary` exists on the Basic/Bxgy/FreeShipping members and
// NOT on the two App members; `codes` on the four Code* members;
// `customerGets` on Basic and Bxgy; `minimumRequirement` on Basic and
// FreeShipping. An unauthorized or unknown field fails the WHOLE query
// (order #1019), which is why this query rides its own wire and fails open.

export type DiscountDoorEntry =
  | { topic: string; payload: unknown }
  | { node: Record<string, unknown>; source_event?: "webhook" | "backfill" };

type GraphqlAdmin = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{ json(): Promise<unknown> }>;
};

type Loose = Record<string, unknown>;
function loose(v: unknown): Loose {
  return v && typeof v === "object" ? (v as Loose) : {};
}
function firstErrorMessage(json: unknown): string | null {
  const errors = loose(json).errors;
  if (!Array.isArray(errors) || !errors.length) return null;
  const m = loose(errors[0]).message;
  return typeof m === "string" ? m : null;
}
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const VALUE = `value {
  __typename
  ... on DiscountPercentage { percentage }
  ... on DiscountAmount { amount { amount currencyCode } appliesOnEachItem }
  ... on DiscountOnQuantity {
    quantity { quantity }
    effect {
      __typename
      ... on DiscountPercentage { percentage }
      ... on DiscountAmount { amount { amount currencyCode } appliesOnEachItem }
    }
  }
}`;

const MINIMUM = `minimumRequirement {
  __typename
  ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount currencyCode } }
  ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity }
}`;

const CODES = `codes(first: 25) { nodes { code } }`;
const CLOCK = `title status startsAt endsAt asyncUsageCount createdAt updatedAt`;
const LIMITS = `usageLimit appliesOncePerCustomer`;

/** The one selection every discount read shares. */
export const DISCOUNT_SELECTION = `
  id
  discount {
    __typename
    ... on DiscountCodeBasic { ${CLOCK} summary ${CODES} customerGets { ${VALUE} } ${MINIMUM} ${LIMITS} }
    ... on DiscountCodeBxgy { ${CLOCK} summary ${CODES} customerGets { ${VALUE} } ${LIMITS} }
    ... on DiscountCodeFreeShipping { ${CLOCK} summary ${CODES} ${MINIMUM} ${LIMITS} }
    ... on DiscountCodeApp { ${CLOCK} ${CODES} ${LIMITS} }
    ... on DiscountAutomaticBasic { ${CLOCK} summary customerGets { ${VALUE} } ${MINIMUM} }
    ... on DiscountAutomaticBxgy { ${CLOCK} summary customerGets { ${VALUE} } }
    ... on DiscountAutomaticFreeShipping { ${CLOCK} summary ${MINIMUM} }
    ... on DiscountAutomaticApp { ${CLOCK} }
  }
`;

export const DISCOUNT_NODE_QUERY = `#graphql
  query InkDiscountNode($id: ID!) {
    discountNode(id: $id) { ${DISCOUNT_SELECTION} }
  }
`;

export const DISCOUNT_NODES_QUERY = `#graphql
  query InkDiscountNodes($cursor: String) {
    discountNodes(first: 50, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes { ${DISCOUNT_SELECTION} }
    }
  }
`;

/** Read one discount back. Null on ANY failure — a revoked scope, a deleted
 *  node, a network blip — and the refusal is LOGGED, naming the gid, so
 *  "why is this discount thin" is answerable from the logs (TECH law 32). */
export async function fetchDiscountNode(
  admin: GraphqlAdmin,
  gid: string,
  label = "[discounts]",
): Promise<Record<string, unknown> | null> {
  try {
    const res = await admin.graphql(DISCOUNT_NODE_QUERY, { variables: { id: gid } });
    const json = await res.json();
    const node = loose(loose(loose(json).data).discountNode);
    if (!node.id) {
      const why = firstErrorMessage(json) || "no discountNode in response";
      console.warn(`${label} node unavailable for ${gid} — the thin event still lands: ${why}`);
      return null;
    }
    return node;
  } catch (err: unknown) {
    console.warn(`${label} node read failed for ${gid} — the thin event still lands:`, messageOf(err));
    return null;
  }
}

export interface BackfillResult {
  pages: number;
  nodes: number;
  written: number;
  /** More pages remained past the cap — the caller says "partial". */
  truncated: boolean;
  errors: string[];
}

/** Walk every discount on the store, newest-updated first, and hand each
 *  page to the door. `pageCap` bounds a webhook-time run (Shopify retries a
 *  slow webhook); the Settings "Allow" flow runs uncapped. Idempotent:
 *  the door merges, so re-running lands the same rows. */
export async function backfillDiscounts(
  admin: GraphqlAdmin,
  post: (entries: DiscountDoorEntry[]) => Promise<{ written: number }>,
  { pageCap = 40, label = "[discounts backfill]" }: { pageCap?: number; label?: string } = {},
): Promise<BackfillResult> {
  const result: BackfillResult = { pages: 0, nodes: 0, written: 0, truncated: false, errors: [] };
  let cursor: string | null = null;
  for (;;) {
    if (result.pages >= pageCap) {
      result.truncated = true;
      break;
    }
    let page: Loose;
    try {
      const res = await admin.graphql(DISCOUNT_NODES_QUERY, { variables: { cursor } });
      const json = await res.json();
      const found = loose(loose(json).data).discountNodes;
      if (!found || typeof found !== "object") {
        result.errors.push(firstErrorMessage(json) || "no discountNodes in response");
        break;
      }
      page = loose(found);
    } catch (err: unknown) {
      result.errors.push(messageOf(err));
      break;
    }
    result.pages += 1;
    const nodes: Loose[] = Array.isArray(page.nodes)
      ? (page.nodes as unknown[]).map(loose).filter((n) => Boolean(n.id))
      : [];
    result.nodes += nodes.length;
    if (nodes.length) {
      try {
        const r = await post(nodes.map((node) => ({ node, source_event: "backfill" as const })));
        result.written += Number(r?.written) || 0;
      } catch (err: unknown) {
        result.errors.push(`page ${result.pages}: ${messageOf(err)}`);
      }
    }
    const pageInfo = loose(page.pageInfo);
    const endCursor = typeof pageInfo.endCursor === "string" ? pageInfo.endCursor : null;
    if (!pageInfo.hasNextPage || !endCursor) break;
    cursor = endCursor;
  }
  console.log(`${label} pages=${result.pages} nodes=${result.nodes} written=${result.written}${result.truncated ? " (partial)" : ""}${result.errors.length ? ` errors=${result.errors.join(" | ")}` : ""}`);
  return result;
}

/** The scope the door needs, as Shopify names it on the session. */
export const DISCOUNTS_READ_SCOPE = "read_discounts";
export const DISCOUNTS_WRITE_SCOPE = "write_discounts";

export function scopeListHas(scope: string | null | undefined, wanted: string): boolean {
  if (!scope) return false;
  return scope.split(",").map((s) => s.trim()).includes(wanted);
}
