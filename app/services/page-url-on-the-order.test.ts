// THE PAGE-ON-THE-ORDER CANARY — the promise that the FIRST shipping email
// opens the buyer's page, for every carrier, with no second email.
//
// WHAT BROKE. Steve Madden order #1027, 2026-09-05: Shopify's record of the
// fulfilment carried our page as its tracking URL (the rewrite ran), and the
// shipping-confirmation email's primary button still opened ups.com — the
// email was composed at the instant of fulfilment, when the tracking URL was
// UPS's, and the rewrite is `notifyCustomer:false` by rule, so no email ever
// carried the rewritten link. The 2026-08-07 milestone had worked only because
// the mutation then sent the mail itself.
//
// WHAT THIS GUARDS. `stampPageUrlOnOrder` writes `ink.page_url` on the order
// at enrol, before any fulfilment exists; `pageUrlForEnrolledOrder` names the
// page without a proof fetch. Every branch runs against an injected
// `admin.graphql` — no Shopify login, no network, no store — so it runs on
// every push. The source pins at the end hold the webhook to the right place
// and keep rule 4 (never a second shipping email) where it is.
//
// WHAT IT CANNOT GUARD, stated plainly: this tests that we ASK Shopify
// correctly and that the Liquid line reads what the stamp writes. It cannot
// tell you a buyer's inbox opened the page — that needs the embed deployed
// after round four, one fulfilment on the Steve Madden rig with any carrier,
// and Sam opening the email. Unit-green plus that walk is the pair.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type GraphqlAdmin,
  PAGE_URL_FALLBACK_TYPE,
  PAGE_URL_KEY,
  PAGE_URL_NAMESPACE,
  PAGE_URL_TYPE,
  SHIPPING_TEMPLATES,
  SHIPPING_TEMPLATE_LINE,
  pageUrlForEnrolledOrder,
  stampPageUrlOnOrder,
} from "./page-url-on-the-order.server";

const ORDER = "gid://shopify/Order/6001027";
const PAGE = "https://stevemadden.in.ink/r/nfc_mtnbfgn1_7zfyv3g3";

/** A fake Shopify admin that answers the guard read and the set mutation the
 *  way the real one does, and records every call. The recording IS the
 *  assertion for the mutation shape. */
function fakeAdmin(opts: {
  /** What the order carries before we act. */
  current?: { value: string; type?: string } | null;
  /** Successive bodies for InkPageUrlSet; a missing one answers success. */
  setResponses?: unknown[];
  guardResponse?: unknown;
  throwWith?: string;
} = {}) {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  let setIndex = 0;
  const admin: GraphqlAdmin = {
    graphql: vi.fn(async (query: string, o?: { variables?: Record<string, unknown> }) => {
      calls.push({ query, variables: o?.variables ?? {} });
      if (opts.throwWith) throw new Error(opts.throwWith);
      let body: unknown;
      if (query.includes("InkPageUrlGuard")) {
        body = opts.guardResponse ?? {
          data: {
            order: {
              id: ORDER,
              metafield: opts.current
                ? { id: "gid://shopify/Metafield/1", value: opts.current.value, type: opts.current.type ?? "url" }
                : null,
            },
          },
        };
      } else {
        const asked = metafieldOf(o?.variables ?? {});
        body = opts.setResponses?.[setIndex++] ?? {
          data: {
            metafieldsSet: {
              metafields: [{ id: "gid://shopify/Metafield/2", type: asked.type, value: asked.value }],
              userErrors: [],
            },
          },
        };
      }
      return { json: async () => body } as unknown as Response;
    }),
  };
  const sets = () => calls.filter((c) => c.query.includes("InkPageUrlSet"));
  return { admin, calls, sets };
}

/** The one metafield a set call carries — the shape the assertions read. */
function metafieldOf(variables: Record<string, unknown>): Record<string, unknown> {
  const list = variables.metafields;
  return Array.isArray(list) && list[0] && typeof list[0] === "object" ? (list[0] as Record<string, unknown>) : {};
}

const stamp = (admin: GraphqlAdmin, over: Record<string, unknown> = {}) =>
  stampPageUrlOnOrder({ admin, orderGid: ORDER, orderName: "#1027", pageUrl: PAGE, ...over });

let logs: string[] = [];
beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
  vi.spyOn(console, "warn").mockImplementation((...a) => void logs.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a) => void logs.push(a.join(" ")));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the stamp — the happy path writes exactly what the template reads", () => {
  it("puts the page on the order as ink.page_url, typed url, and says so", async () => {
    const { admin, sets } = fakeAdmin({ current: null });
    const out = await stamp(admin);

    expect(out).toMatchObject({ outcome: "written", value: PAGE, type: "url" });
    expect(sets()).toHaveLength(1);
    expect(sets()[0].variables.metafields).toEqual([
      { ownerId: ORDER, namespace: "ink", key: "page_url", type: "url", value: PAGE },
    ]);
    expect(metafieldOf(sets()[0].variables)).toMatchObject({ namespace: PAGE_URL_NAMESPACE, key: PAGE_URL_KEY });
    expect(logs.join("\n")).toContain("#1027");
  });

  it("guards on the same namespace and key it writes", async () => {
    const { admin, calls } = fakeAdmin({ current: null });
    await stamp(admin);
    const guard = calls.find((c) => c.query.includes("InkPageUrlGuard"));
    expect(guard?.variables).toEqual({ id: ORDER });
    expect(guard?.query).toContain(`namespace: "${PAGE_URL_NAMESPACE}", key: "${PAGE_URL_KEY}"`);
  });
});

describe("the stamp — idempotent, one order at a time", () => {
  it("the same value is never rewritten: one read, no write", async () => {
    const { admin, calls, sets } = fakeAdmin({ current: { value: PAGE } });
    const out = await stamp(admin);

    expect(out.outcome).toBe("unchanged");
    expect(calls).toHaveLength(1);
    expect(sets()).toHaveLength(0);
  });

  it("a different value is rewritten (a brand renamed, a page re-minted)", async () => {
    const { admin, sets } = fakeAdmin({ current: { value: "https://old.in.ink/r/nfc_old" } });
    const out = await stamp(admin);

    expect(out.outcome).toBe("written");
    expect(metafieldOf(sets()[0].variables).value).toBe(PAGE);
  });

  it("an existing text-typed metafield keeps its type — no wasted refusal", async () => {
    // Shopify refuses a type change on an existing metafield; asking for
    // `url` first would cost a round trip that always fails.
    const { admin, sets } = fakeAdmin({ current: { value: "https://old.in.ink/r/x", type: PAGE_URL_FALLBACK_TYPE } });
    const out = await stamp(admin);

    expect(out).toMatchObject({ outcome: "written", type: PAGE_URL_FALLBACK_TYPE });
    expect(sets()).toHaveLength(1);
    expect(metafieldOf(sets()[0].variables).type).toBe(PAGE_URL_FALLBACK_TYPE);
  });
});

describe("the stamp — Shopify's refusals are outcomes, never exceptions", () => {
  const refusedUrl = {
    data: {
      metafieldsSet: {
        metafields: [],
        userErrors: [{ field: ["metafields", "0", "type"], message: "Type is invalid", code: "INVALID_TYPE" }],
      },
    },
  };

  it("a refused `url` type falls back to single_line_text_field, once", async () => {
    const { admin, sets } = fakeAdmin({ current: null, setResponses: [refusedUrl] });
    const out = await stamp(admin);

    expect(out).toMatchObject({ outcome: "written", type: PAGE_URL_FALLBACK_TYPE, value: PAGE });
    expect(sets().map((c) => metafieldOf(c.variables).type)).toEqual([PAGE_URL_TYPE, PAGE_URL_FALLBACK_TYPE]);
    expect(logs.join("\n")).toContain("retrying as single_line_text_field");
  });

  it("both types refused ⇒ failed, in Shopify's own words, and the webhook lives", async () => {
    const { admin, sets } = fakeAdmin({ current: null, setResponses: [refusedUrl, refusedUrl] });
    const out = await stamp(admin);

    expect(out.outcome).toBe("failed");
    expect(out.detail).toContain("Type is invalid");
    expect(sets()).toHaveLength(2);
    expect(logs.join("\n")).toContain("#1027 failed");
  });

  it("a scope the app does not hold is skipped_scope_missing — named, not retried", async () => {
    const denied = {
      errors: [
        {
          message: "Access denied for metafieldsSet field. Required access: `write_orders` access scope.",
          extensions: { code: "ACCESS_DENIED" },
        },
      ],
      data: null,
    };
    const { admin, sets } = fakeAdmin({ current: null, setResponses: [denied] });
    const out = await stamp(admin);

    expect(out.outcome).toBe("skipped_scope_missing");
    expect(out.detail).toContain("write_orders");
    expect(sets()).toHaveLength(1);
    expect(logs.join("\n")).toContain("skipped_scope_missing");
  });

  it("a scope refusal on the guard read is the same skip, and writes nothing", async () => {
    const { admin, sets } = fakeAdmin({
      guardResponse: {
        errors: [{ message: "Access denied for order field. Required access: `read_orders` access scope." }],
        data: null,
      },
    });
    const out = await stamp(admin);

    expect(out.outcome).toBe("skipped_scope_missing");
    expect(sets()).toHaveLength(0);
  });

  it("a thrown request is non-fatal — the webhook must still return 200", async () => {
    const { admin } = fakeAdmin({ throwWith: "socket hang up" });
    const out = await stamp(admin);

    expect(out.outcome).toBe("failed");
    expect(out.detail).toContain("socket hang up");
  });

  it("a thrown scope refusal (the client library's form) still says its own name", async () => {
    const { admin } = fakeAdmin({ throwWith: "GraphQL query returned errors: Access denied for metafieldsSet field. Required access: `write_orders` access scope." });
    const out = await stamp(admin);

    expect(out.outcome).toBe("skipped_scope_missing");
  });

  it("an unexpected GraphQL error on the write is failed, not silently green", async () => {
    const { admin } = fakeAdmin({
      current: null,
      setResponses: [{ errors: [{ message: "Internal error. Looks like something went wrong on our end." }] }],
    });
    const out = await stamp(admin);

    expect(out.outcome).toBe("failed");
    expect(out.detail).toContain("Internal error");
  });
});

describe("the stamp — nothing to stamp is a named skip, and Shopify is left alone", () => {
  it("no page URL ⇒ skipped_no_page_url, zero calls, the reason in the log", async () => {
    const { admin, calls } = fakeAdmin();
    const out = await stamp(admin, { pageUrl: null, reason: "no brand_slug on the merchant doc" });

    expect(out).toMatchObject({ outcome: "skipped_no_page_url", detail: "no brand_slug on the merchant doc" });
    expect(calls).toHaveLength(0);
    expect(logs.join("\n")).toContain("skipped_no_page_url — no brand_slug on the merchant doc");
  });
});

describe("the resolver — the page's address without a proof fetch", () => {
  const EMBED_DOC = { shop: "sm-test-hhawzn52.myshopify.com", ink_api_key: "ink_x", shop_domain: "sm-test-hhawzn52.myshopify.com" };

  it("the backend doc's brand_slug names the host — the one author", async () => {
    const read = vi.fn(async () => ({ brand_slug: "stevemadden", status: "active" }));
    const out = await pageUrlForEnrolledOrder({
      shopId: "shop_bb508e5ca47a1036",
      nfcToken: "nfc_mtnbfgn1_7zfyv3g3",
      merchantData: EMBED_DOC,
      readBackendMerchantDoc: read,
    });

    expect(out).toEqual({ pageUrl: PAGE, brandSlug: "stevemadden" });
    expect(read).toHaveBeenCalledWith("shop_bb508e5ca47a1036");
  });

  it("no brand_slug anywhere ⇒ no page — NEVER the myshopify domain (#1016)", async () => {
    const out = await pageUrlForEnrolledOrder({
      shopId: "shop_1",
      nfcToken: "nfc_tok",
      merchantData: EMBED_DOC,
      readBackendMerchantDoc: async () => ({ status: "active" }),
    });

    expect(out.pageUrl).toBeNull();
    expect(out.reason).toBe("no_slug");
    expect(JSON.stringify(out)).not.toContain("sm-test-hhawzn52");
  });

  it("no token ⇒ no page, and the backend doc is never read", async () => {
    const read = vi.fn();
    const out = await pageUrlForEnrolledOrder({ shopId: "shop_1", nfcToken: "", merchantData: EMBED_DOC, readBackendMerchantDoc: read });

    expect(out.reason).toBe("no_token");
    expect(read).not.toHaveBeenCalled();
  });

  it("a backend doc that cannot be read leaves the embed doc to answer (fail-soft)", async () => {
    const out = await pageUrlForEnrolledOrder({
      shopId: "shop_1",
      nfcToken: "nfc_tok",
      merchantData: { ...EMBED_DOC, brand_slug: "clarev" },
      readBackendMerchantDoc: async () => {
        throw new Error("DEADLINE_EXCEEDED");
      },
    });

    expect(out.pageUrl).toBe("https://clarev.in.ink/r/nfc_tok");
    expect(logs.join("\n")).toContain("DEADLINE_EXCEEDED");
  });

  it("no backend identity on the enrol response ⇒ the embed doc alone, no read", async () => {
    const read = vi.fn();
    const out = await pageUrlForEnrolledOrder({
      shopId: null,
      nfcToken: "nfc_tok",
      merchantData: { brand_slug: "clarev" },
      readBackendMerchantDoc: read,
    });

    expect(out.pageUrl).toBe("https://clarev.in.ink/r/nfc_tok");
    expect(read).not.toHaveBeenCalled();
  });

  it("the slug is normalised the way every other builder normalises it", async () => {
    const out = await pageUrlForEnrolledOrder({
      nfcToken: "nfc_tok",
      merchantData: { brand_slug: "https://www.StéveMadden.com/" },
      readBackendMerchantDoc: async () => null,
    });
    expect(out.pageUrl).toBe("https://stevemadden.in.ink/r/nfc_tok");
  });
});

// ── The Liquid line Sam pastes reads what the stamp writes ──────────────────
describe("the template line and the stamp are one contract", () => {
  it("reads metafields.ink.page_url first, in Shopify's documented email form", () => {
    expect(SHIPPING_TEMPLATE_LINE.startsWith(`{% if metafields.${PAGE_URL_NAMESPACE}.${PAGE_URL_KEY} != blank %}`)).toBe(true);
    expect(SHIPPING_TEMPLATE_LINE).toContain(`{% assign order_status_url = metafields.${PAGE_URL_NAMESPACE}.${PAGE_URL_KEY} %}`);
  });

  it("keeps the order. form as the second reading", () => {
    expect(SHIPPING_TEMPLATE_LINE).toContain(`{% elsif order.metafields.${PAGE_URL_NAMESPACE}.${PAGE_URL_KEY} != blank %}`);
  });

  it("keeps the 2026-08-07 tracking_url line as the fallback AFTER the page", () => {
    const page = SHIPPING_TEMPLATE_LINE.indexOf("metafields.ink.page_url");
    const fallback = SHIPPING_TEMPLATE_LINE.indexOf("{% elsif fulfillment.tracking_url %}{% assign order_status_url = fulfillment.tracking_url %}{% endif %}");
    expect(page).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(page);
    expect(SHIPPING_TEMPLATE_LINE.endsWith("{% endif %}")).toBe(true);
  });

  it("is one line — it is pasted as line 1 of the body", () => {
    expect(SHIPPING_TEMPLATE_LINE).not.toContain("\n");
  });

  it("belongs in the two shipping templates and no other (the timing law)", () => {
    expect([...SHIPPING_TEMPLATES]).toEqual(["Shipping confirmation", "Shipping update"]);
  });
});

// ── The webhook wires it in the right place ─────────────────────────────────
//
// Read from the route's source, the way enroll-survives-enrichment.test.ts
// does: the stamp must sit AFTER the enrol, INSIDE the activates branch, on
// its own wire, and never be able to fail the webhook.
describe("webhooks/orders_create carries the stamp where the slice allows it", () => {
  const ROUTE_SRC = readFileSync(
    fileURLToPath(new URL("../routes/webhooks.orders_create.ts", import.meta.url)),
    "utf8",
  );

  it("resolves the page and stamps it after a successful enrol", () => {
    expect(ROUTE_SRC).toContain("pageUrlForEnrolledOrder(");
    expect(ROUTE_SRC).toContain("stampPageUrlOnOrder(");
    expect(ROUTE_SRC).toMatch(/proofShopId = String\(inkData\?\.shop_id/);
  });

  it("sits inside the activates branch, after the enrol-critical batch", () => {
    const batchEnd = ROUTE_SRC.indexOf('Metafields initialized for ${orderName}');
    const stampAt = ROUTE_SRC.indexOf("stampPageUrlOnOrder(");
    const outerCatch = ROUTE_SRC.indexOf("} catch (error: any) {");
    expect(batchEnd).toBeGreaterThan(-1);
    expect(stampAt).toBeGreaterThan(batchEnd);
    expect(stampAt).toBeLessThan(outerCatch);
  });

  it("never rides the atomic enrol-critical batch", () => {
    // metafieldsSet is atomic: a refused page_url would take proof_reference
    // down with it. The batch's own variables must not know the key.
    const start = ROUTE_SRC.indexOf('key: "verification_status"');
    const end = ROUTE_SRC.indexOf('.filter((m) => m.value !== "")');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(ROUTE_SRC.slice(start, end)).not.toContain("page_url");
  });

  it("cannot fail the webhook — wrapped, and a skip says its own name", () => {
    const block = ROUTE_SRC.slice(ROUTE_SRC.indexOf("if (proofReference && inkToken) {"), ROUTE_SRC.indexOf("} catch (error: any) {"));
    expect(block).toContain("catch (stampErr");
    expect(block).toContain("skipped_no_token");
  });
});

// ── Rule 4 stays: never a second shipping email ─────────────────────────────
describe("the tracking rewrite is untouched — belt and braces, and still silent", () => {
  const REWRITE_SRC = readFileSync(
    fileURLToPath(new URL("./branded-tracking-link.server.ts", import.meta.url)),
    "utf8",
  );

  it("keeps notifyCustomer:false — the fix is the stamp, not a re-send", () => {
    expect(REWRITE_SRC).toContain("notifyCustomer: false");
    expect(REWRITE_SRC).not.toContain("notifyCustomer: true");
  });
});
