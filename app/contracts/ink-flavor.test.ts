// THE INK FLAVOR'S CONTRACTS, CHECKED MECHANICALLY.
//
// Four promises, each one a thing that could drift green:
//   1. shopify.app.ink.toml asks a merchant for exactly the scopes the code
//      is written against (ink-scopes.server.ts), and its record, host and
//      webhook shape are what the plan says. The live toml is untouched.
//   2. With APP_FLAVOR unset, every Shopify query on the enrol and tracking
//      path is byte-for-byte the string it was before ink existed.
//   3. Under ink, none of those queries selects a field outside ink's list —
//      Shopify fails the whole query over one such selection (#1019).
//   4. The deploy ships ink-app with --update-env-vars, never --set-env-vars
//      (which clears every other variable on the service first), and the
//      Ritualist's deploy command is what it was.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INK_SCOPES } from "../services/ink-scopes.server";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** One `const NAME = \`…\`` template literal's text, from a source file. */
function templateLiteral(src: string, name: string): string {
  const start = src.indexOf(`${name} = \``);
  if (start === -1) throw new Error(`${name} not found`);
  const open = src.indexOf("`", start);
  const close = src.indexOf("`", open + 1);
  return src.slice(open + 1, close);
}

// ── 1. the record ────────────────────────────────────────────────────────
describe("shopify.app.ink.toml", () => {
  const toml = read("shopify.app.ink.toml");
  const live = read("shopify.app.toml");
  const field = (src: string, key: string) => src.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"))?.[1];

  it("is the dormant record, renamed ink, at install.in.ink", () => {
    expect(field(toml, "client_id")).toBe("45cc130ef59cbeaf9133acea201981ed");
    expect(field(toml, "name")).toBe("ink");
    expect(field(toml, "application_url")).toBe("https://install.in.ink");
    expect(toml).toMatch(/^embedded = true$/m);
    expect(toml).toMatch(/^use_legacy_install_flow = false$/m);
    expect(toml).toContain('"https://install.in.ink/auth/callback"');
    expect(toml).toContain('"https://install.in.ink/auth/shopify/callback"');
  });

  it("asks for exactly the scopes the code is written against", () => {
    const scopes = field(toml, "scopes")!.split(",").map((s) => s.trim()).sort();
    expect(scopes).toEqual([...INK_SCOPES].sort());
    for (const never of ["read_products", "read_customers", "read_files", "write_files", "read_metaobjects", "write_metaobjects", "read_online_store_pages", "write_online_store_pages", "write_themes", "write_shipping"]) {
      expect(scopes, `${never} is the Ritualist's, not ink's`).not.toContain(never);
    }
  });

  it("subscribes the same seven topics as the live record, every one at the ink-app service", () => {
    const uris = [...toml.matchAll(/^\s*uri = "([^"]+)"/gm)].map((m) => m[1]);
    expect(uris).toHaveLength(7);
    for (const uri of uris) expect(uri.startsWith("https://ink-app-250065525755.us-central1.run.app/webhooks/")).toBe(true);
    const topics = [...toml.matchAll(/^\s*(?:topics|compliance_topics) = \[ "([^"]+)" \]/gm)].map((m) => m[1]).sort();
    const liveTopics = [...live.matchAll(/^\s*(?:topics|compliance_topics) = \[ "([^"]+)" \]/gm)].map((m) => m[1]).sort();
    expect(topics).toEqual(liveTopics);
    expect(topics).toEqual(["app/scopes_update", "app/uninstalled", "customers/data_request", "customers/redact", "orders/create", "orders/fulfilled", "shop/redact"]);
    // The underscore spellings that match the flat-route handler files.
    expect(uris).toContain("https://ink-app-250065525755.us-central1.run.app/webhooks/orders_create");
    expect(uris).toContain("https://ink-app-250065525755.us-central1.run.app/webhooks/orders_fulfilled");
    expect(field(toml, "api_version")).toBe(field(live, "api_version"));
  });

  it("ships no extension: the Ritualist's order-status block stays on the Ritualist's record", () => {
    // An empty list means the default ("extensions/*") to the CLI, so the
    // ink record's list must name a directory that holds no extension.
    const dirs = toml.match(/^extension_directories\s*=\s*\[([^\]]*)\]/m)?.[1];
    expect(dirs, "shopify.app.ink.toml must set extension_directories").toBeDefined();
    const list = [...dirs!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(list.length).toBeGreaterThan(0);
    for (const d of list) expect(d.startsWith("extensions/"), `${d} would pick up the Ritualist's extensions`).toBe(false);
    expect(live).not.toMatch(/^extension_directories/m);
  });

  it("leaves the live record alone", () => {
    expect(field(live, "client_id")).toBe("8da1addef3dcd4251db5057cda3c85fa");
    expect(field(live, "name")).toBe("The Ritualist");
    expect(field(live, "application_url")).toBe("https://app.in.ink");
  });
});

// ── 2. byte-identical with the env unset ─────────────────────────────────
describe("the Ritualist's queries, byte for byte", () => {
  it("orders/create still sends the enrol-critical query it always has", () => {
    const src = read("app/routes/webhooks.orders_create.ts");
    expect(templateLiteral(src, "ORDER_DETAIL_QUERY")).toBe(`
  query AutoEnrollOrder($id: ID!) {
    order(id: $id) {
      id
      name
      customer { email phone firstName lastName }
      shippingAddress { name address1 address2 city province zip country }
      totalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 20) {
        edges {
          node {
            title
            quantity
            sku
            originalUnitPriceSet { shopMoney { amount } }
            image { url }
          }
        }
      }
      metafield(namespace: "ink", key: "proof_reference") { value }
      fulfillments { trackingInfo { company number } }
    }
  }
`);
    // And picks it by flavor, with the Ritualist as the fallback.
    expect(src).toContain('return flavor === "ink" ? ORDER_DETAIL_QUERY_INK : ORDER_DETAIL_QUERY;');
    expect(src).toContain("admin.graphql(orderDetailQueryFor(appFlavor()), {");
  });

  it("fulfillments/create still sends the order read it always has (hoisted, not changed)", () => {
    const src = read("app/routes/webhooks.fulfillments_create.tsx");
    expect(templateLiteral(src, "const ORDER_QUERY")).toBe(`query GetOrderMetafield($id: ID!) {
        order(id: $id) {
          name
          customer { email firstName }
          metafield(namespace: "ink", key: "proof_reference") { value }
        }
      }`);
    expect(src).toContain("ink ? ORDER_QUERY_INK : ORDER_QUERY,");
  });

  it("fulfillments/update still sends the order read it always has", () => {
    const src = read("app/routes/webhooks.fulfillments_update.tsx");
    expect(templateLiteral(src, "const orderQuery")).toBe(`#graphql
      query GetOrderForFulfillmentEvent($id: ID!) {
        order(id: $id) {
          name
          tags
          customer {
            email
            phone
            firstName
          }
          proofMetafield: metafield(namespace: "ink", key: "proof_reference") { value }
        }
      }
    `);
    expect(src).toContain(".graphql(ink ? ORDER_QUERY_INK : orderQuery, { variables: { id: orderGid } })");
  });

  it("the Ritualist's provision text and shop query are untouched inside app.tsx", () => {
    const src = read("app/routes/app.tsx");
    expect(src).toContain("query ShopIdentity { shop { name email contactEmail } }`);");
    expect(src).toContain("const inkData = await createMerchant(session.shop, shopName, ownerEmail);");
    expect(src).toContain("notification_settings: DEFAULT_NOTIFICATION_SETTINGS,");
    // The carrier service and the ink install are the two branches on the flavor.
    expect(src).toContain("if (appUrl && !ink) {");
    expect(src).toContain("provisionInkMerchant({ admin, shop: session.shop })");
  });

  it("only ink claims a host: the Ritualist's install path names neither the capture nor the claim", () => {
    // `brand_slug` is the one author of {brand}.in.ink. ink's install claims it
    // through the Worker; the Ritualist's merchants get theirs where they
    // always did — an operator's door at mint — and nothing in its branch of
    // app.tsx, or in the file its branch calls, reaches the capture door.
    const src = read("app/routes/app.tsx");
    expect(src).not.toContain("captureBrandMark");
    expect(src).not.toContain("brand-mark.server");
    expect(src).not.toContain("brand_slug");
    // The one caller of the capture is ink's own install file.
    expect(read("app/services/ink-install.server.ts")).toContain("captureBrandMark({ site: siteUrl, shopId })");
  });

  it("the Ritualist's session collection keeps its name, and no route or helper names it by hand", () => {
    const src = read("app/firestore-session-storage.server.ts");
    expect(src).toContain('export const SESSION_COLLECTION = isInk() ? "shopify_sessions_ink" : "shopify_sessions";');
    for (const file of ["app/routes/webhooks.app.uninstalled.tsx", "app/routes/webhooks.app.scopes_update.tsx", "app/routes/auth.$.tsx", "app/session-utils.server.ts"]) {
      expect(read(file)).toContain("SESSION_COLLECTION");
      expect(read(file)).not.toContain('"shopify_sessions"');
    }
  });

  it("both installs create only when the shared doc has no key — the create door rotates the key on every call", () => {
    // The Ritualist's guard, verbatim; ink's, in its own file.
    expect(read("app/routes/app.tsx")).toContain("if (!existing?.ink_api_key) {");
    expect(read("app/services/ink-install.server.ts")).toContain('if (existing?.ink_api_key) return { outcome: "already_provisioned" };');
  });

  it("plan precedence is wired: the Ritualist's provision claims an ink doc, its uninstall hands back, ink's uninstall does neither", () => {
    expect(read("app/routes/app.tsx")).toContain("await claimRitualistPlan({ shop: session.shop, existing });");
    // AN INSTALL IS NOT A PUBLISH: the only `plan` this app ever PATCHes is
    // the hand-back to ink on uninstall. `plan: "ritualist"` belongs to the
    // Worker's publish door (the-ritualist), because page_mode follows the
    // plan and the page must not appear before the merchant has one.
    const precedence = read("app/services/plan-precedence.server.ts");
    expect(precedence).not.toContain('plan: "ritualist"');
    expect(precedence).toContain('patchMerchant(shopId, { plan: "ink", ritualist_installed_at: null })');
    // The arrival records the ENTITLEMENT, never the plan (ink-backend #121).
    expect(precedence).toContain("ritualist_installed_at: new Date().toISOString()");
    const uninstall = read("app/routes/webhooks.app.uninstalled.tsx");
    expect(uninstall).toContain("if (!isInk()) {");
    expect(uninstall).toContain("await restoreInkPlanOnRitualistUninstall(shop)");
    // The uninstall never touches the shared merchant doc.
    expect(uninstall).not.toMatch(/collection\("merchants"\)/);
  });
});

// ── 3. nothing outside ink's list ────────────────────────────────────────
/** A selection and the scope Shopify demands for it (Admin GraphQL 2025-10;
 *  the validator's own answer for each query is quoted in the PR). Nothing
 *  ink's queries may contain. */
const SELECTION_NEEDS: Array<[RegExp, string]> = [
  [/\bcustomer\s*\{/, "read_customers"],
  [/\bproduct\s*\{/, "read_products"],
  [/\bvariant\s*\{/, "read_products"],
  [/\bonlineStoreUrl\b/, "read_products"],
  [/\bmetaobject/i, "read_metaobjects"],
  [/\bfiles\s*\(/, "read_files"],
  [/\bcarrierService/i, "write_shipping"],
  [/\bthemes?\s*[({]/, "read_themes"],
  [/\bpages?\s*\(/, "read_online_store_pages"],
];

describe("under ink, the enrol and tracking queries select nothing outside INK_SCOPES", () => {
  const inkQueries = [
    ["orders/create", templateLiteral(read("app/routes/webhooks.orders_create.ts"), "ORDER_DETAIL_QUERY_INK")],
    ["fulfillments/create", templateLiteral(read("app/routes/webhooks.fulfillments_create.tsx"), "ORDER_QUERY_INK")],
    ["fulfillments/update", templateLiteral(read("app/routes/webhooks.fulfillments_update.tsx"), "ORDER_QUERY_INK")],
    ["orders/fulfilled", read("app/routes/webhooks.orders_fulfilled.tsx").match(/query GetOrderMetafield[\s\S]*?\n\s*`/)![0]],
    ["branded tracking link", templateLiteral(read("app/services/branded-tracking-link.server.ts"), "MUTATION")],
    ["shop identity", read("app/services/ink-install.server.ts").match(/query ShopIdentity \{[^`]*/)![0]],
  ] as const;

  it.each(inkQueries)("%s", (_label, query) => {
    for (const [selection, scope] of SELECTION_NEEDS) {
      expect(INK_SCOPES.includes(scope) || !selection.test(query), `selects something that needs ${scope}: ${selection}`).toBe(true);
    }
  });

  it("ink's enrol query still carries everything a proof is made of", () => {
    const q = templateLiteral(read("app/routes/webhooks.orders_create.ts"), "ORDER_DETAIL_QUERY_INK");
    for (const required of ["name", "email", "phone", "shippingAddress", "totalPriceSet", "lineItems", "sku", "image", "metafield", "fulfillments"]) {
      expect(q).toContain(required);
    }
  });

  it("ink's fulfillment reads still carry the proof link", () => {
    expect(templateLiteral(read("app/routes/webhooks.fulfillments_create.tsx"), "ORDER_QUERY_INK")).toContain('metafield(namespace: "ink", key: "proof_reference")');
    expect(templateLiteral(read("app/routes/webhooks.fulfillments_update.tsx"), "ORDER_QUERY_INK")).toContain('proofMetafield: metafield(namespace: "ink", key: "proof_reference")');
  });

  it("the tracking rewrite needs only what ink holds", () => {
    // fulfillmentTrackingInfoUpdate: any one of the three write_*_fulfillment_orders (+ read_orders).
    expect(INK_SCOPES).toContain("write_merchant_managed_fulfillment_orders");
    expect(INK_SCOPES).toContain("write_third_party_fulfillment_orders");
    expect(INK_SCOPES).toContain("write_assigned_fulfillment_orders");
    expect(INK_SCOPES).toContain("read_orders");
    expect(INK_SCOPES).toContain("write_orders"); // tagsAdd, metafieldsSet on the order
  });

  it("ink's install registers no carrier service (write_shipping) and its embed sends no buyer email", () => {
    expect(read("app/routes/app.tsx")).toContain("if (appUrl && !ink) {");
    expect(read("app/services/state-email.server.ts")).toMatch(/if \(isInk\(\)\) \{\s*console\.log\(`📧 SKIP/);
    expect(read("app/services/notifications.server.ts")).toMatch(/if \(isInk\(\)\) \{\s*console\.log\(`\[NotificationService\] Skipped/);
    expect(read("app/routes/webhooks.fulfillments_create.tsx")).toContain("if (!ink) {\n    try {\n      const { sendStateEmailOnce }");
    expect(read("app/routes/webhooks.fulfillments_update.tsx")).toContain("if (!ink) try {\n        const { sendStateEmailOnce }");
    expect(read("app/routes/webhooks.fulfillments_update.tsx")).toContain("if (ink) {\n      console.log(`📦 ink: delivery recorded; no notifications are ink's to send. Exiting.`);");
  });
});

// ── 4. the deploy ────────────────────────────────────────────────────────
describe("deploy-cloud-run.yml", () => {
  const yml = read(".github/workflows/deploy-cloud-run.yml");

  it("ships ink-app with --update-env-vars APP_FLAVOR=ink and never --set-env-vars", () => {
    expect(yml).toContain("gcloud run deploy ink-app");
    expect(yml).toContain("--update-env-vars APP_FLAVOR=ink");
    // Command lines only — the header's prose names both flags to warn about them.
    expect(yml).not.toMatch(/^\s*--set-env-vars/m);
    expect(yml).not.toMatch(/^\s*--clear-env-vars/m);
  });

  it("skips ink-app until the service exists, and the Ritualist's deploy command is unchanged", () => {
    expect(yml).toContain("gcloud run services describe ink-app");
    expect(yml).toContain("if: steps.exists.outputs.created == 'true'");
    expect(yml).toContain(`gcloud run deploy shopify-app \\
            --source . \\
            --project inink-c76d3 \\
            --region us-central1 \\
            --quiet`);
  });
});
