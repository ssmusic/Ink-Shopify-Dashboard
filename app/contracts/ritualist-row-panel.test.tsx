// THE RITUALIST'S SHIPMENTS ROW OPENS ONTO INK'S PANEL (Sam, 2026-09-24: "we
// are making the ritualist as good as ink" · "it has to mirror the ritualist
// webapp"). A Shipments row is a row of ink's ledger, and opened it is the
// Ritualist's row (components/OrderExpandedRow.tsx): ink's own panel
// (components/InkRecentOrders.tsx OrderPanel) with "View full record" at its
// foot, read the way ink's Orders reads it (services/ritualist-rows.server.ts).
// Pinned here:
//   · the honest rail: each step says where its time came from; a tick only
//     on ink's own record or a carrier's scan — Shopify's fulfillment gets a
//     ring, never a tick (#145);
//   · THE LAST OPEN leads: its distance with its accuracy, its place in words,
//     its moment and device; the delivery address small beside it; EVERY OPEN
//     lists each open with its device, browser and kind (#144, #148, #149, #158);
//   · a record without a delivery point says which fact it is (#159);
//   · the record is included: the door never offers it, never names a price,
//     and the files stand whenever there is a record and a key;
//   · nothing judges a distance and no coordinate is printed.
// Made-up shop, orders and points: this repository is public.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../firestore.server", () => ({ default: {}, firestore: {}, app: {} }));
vi.mock("../services/merchant-doc.server", () => ({
  findMerchantDoc: vi.fn(async () => ({ data: { ink_api_key: "ink_key_example" }, apiKey: "ink_key_example" })),
}));

const { default: OrderExpandedRow } = await import("../components/OrderExpandedRow");
const { default: InkRecentOrders } = await import("../components/InkRecentOrders");
const { includedRecordDoor, ritualistApiKey, ritualistRowRecord } = await import("../services/ritualist-rows.server");
const { readJwks } = await import("../services/ink-record.server");
const { timelineFrom } = await import("../services/ink-timeline.server");
import type { RecordRead } from "../lib/record-words";

const text = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
// Words that would judge a distance or claim a delivery. ink's own sentences
// that say what does NOT confirm ("not what confirms the open", "do not
// confirm physical delivery") are allowed; the words below never are.
const JUDGED = /within|outside|beyond|\bnear\b|\bpass\b|flagged|\brange\b|default|at the door|confirmed|verified delivery|delivery verified/i;

// React warns that RouterProvider's useLayoutEffect does nothing on the server.
const realError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes("useLayoutEffect does nothing on the server")) return;
    realError(...args);
  };
});
afterAll(() => {
  console.error = realError;
});

const PROOF = "proof_000000000000000000a10420";
const HOME = { lat: 40.69, lng: -73.99 };
const OPEN_AT = "2026-09-22T19:00:00.000Z";
const PROOF_BODY = {
  proof_id: PROOF,
  enrolled_at: "2026-09-20T15:01:00.000Z",
  delivered_at: "2026-09-22T18:00:00.000Z",
  delivery_source: "merchant",
  first_tap_at: OPEN_AT,
  shipping_geocode_lat: HOME.lat,
  shipping_geocode_lng: HOME.lng,
};
const OPENS_BODY = {
  proof_id: PROOF,
  address: HOME,
  capped: false,
  opens: [
    { at: OPEN_AT, outcome: "success", gps_verdict: "flagged", distance_m: 2600, accuracy_m: 7, lat: 40.7123, lng: -74.0189, device: "iPhone", browser: "A", kind: "first" },
  ],
  last_open: { at: OPEN_AT, lat: 40.7123, lng: -74.0189, accuracy_m: 7, distance_m: 2600, device: "iPhone", address_words: "Example Street, Example City" },
};
const SIGNED_OPEN = {
  event_id: "event_00000000000000000000a001", at: OPEN_AT, legacy: false, outcome: null, browser: "browser A", device: "iPhone",
  network: null, verdict: "flagged", distance_m: 2600, accuracy_m: 7, shared_later: false, share_event_id: null, check: "verified",
};
const RECORD: RecordRead = {
  summary: { order_number: "#1042", opens: 1, first_open_at: OPEN_AT },
  elements: [
    { element: "order", label: "Order", status: "attested", value: { order_number: "#1042", enrolled_at: PROOF_BODY.enrolled_at } },
    { element: "delivery_date", label: "Delivery date", status: "attested", value: { delivered_at: PROOF_BODY.delivered_at, source: "merchant" } },
    { element: "the_open", label: "The open", status: "verified", value: { first_open_at: OPEN_AT, first_open_signed: true, opens: 1, signed_opens: 1, non_human_opens: 0, location: { verdict: "flagged", distance_m: 2600, accuracy_m: 7, signed: true } } },
  ],
  locked: false,
  whole: true,
  events: [{ seq: 1, event_id: SIGNED_OPEN.event_id, type: "Opened", at: OPEN_AT, check: "verified", legacy: false }],
  checks: null,
  forSale: null,
  opens: [SIGNED_OPEN],
};
const DETAIL = {
  id: "1042", orderNumber: "#1042", customerName: "Gift Recipient", customerEmail: "order@example.com",
  customerAddress: { address1: "1 Test St", address2: "", city: "Brooklyn", provinceCode: "NY", zip: "11201", country: "United States" },
  date: "Sep 20, 2026", total: "58.00", subtotal: "58.00", currency: "USD", status: "enrolled",
  items: [{ title: "Bar Tape", quantity: 2, price: "29.00", sku: "BT-1" }], metafields: {},
};
const rowWith = (record: RecordRead, proofBody: object, opensBody: object) => ({
  id: "gid://shopify/Order/1042",
  name: "#1042",
  proofId: PROOF,
  detail: DETAIL,
  record,
  door: includedRecordDoor("ink_key_example", PROOF),
  timeline: timelineFrom(proofBody, opensBody, record),
});

/** A Shipments row, opened: the ledger's row with the Ritualist's row drawn in it. */
function open(row: ReturnType<typeof rowWith>) {
  const Stub = createRoutesStub([
    {
      id: "screen",
      path: "/",
      Component: () => (
        <InkRecentOrders orders={[row] as never} defaultExpandedId={row.id} renderPanel={(r) => <OrderExpandedRow row={r} onViewFull={() => {}} />} />
      ),
    },
  ]);
  return renderToString(
    <AppProvider i18n={translations}>
      <Stub initialEntries={["/"]} />
    </AppProvider>,
  );
}

describe("the Ritualist's record is included", () => {
  it("its door never offers the record, never names a price, and hands over the files whenever there is a record and a key", () => {
    expect(includedRecordDoor("ink_key_example", PROOF)).toEqual({
      offerLine: null, pending: false, paidPendingRecord: false, resumeUrl: null, downloadable: true, inHistory: false, purchase: null,
    });
    expect(includedRecordDoor(null, PROOF).downloadable).toBe(false);
    expect(includedRecordDoor("ink_key_example", null).downloadable).toBe(false);
    expect(includedRecordDoor("ink_key_example", "not-a-proof").downloadable).toBe(false);
  });

  it("the key is the one the Ritualist's order page reads its proof with", async () => {
    expect(await ritualistApiKey("made-up-shop.myshopify.com")).toBe("ink_key_example");
  });
});

describe("each row is read the way ink's Orders reads it, and streams", () => {
  const asked: Array<{ url: string; auth: string | null }> = [];
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
    asked.push({ url, auth });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.endsWith("/.well-known/jwks.json")) return json({ keys: [] });
    if (url.endsWith(`/proofs/${PROOF}/audit`)) return json({ proof_id: PROOF, audience: "merchant", summary: RECORD.summary, verdict: { elements: RECORD.elements }, chain: [] });
    if (url.endsWith(`/proofs/${PROOF}/opens`)) return json(OPENS_BODY);
    if (url.endsWith(`/proofs/${PROOF}`)) return json(PROOF_BODY);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  it("the record through the merchant audit door with the merchant's key, the rail through the proof and opens doors", async () => {
    asked.length = 0;
    const side = await ritualistRowRecord("ink_key_example", PROOF, readJwks(fake), fake);
    expect(side.record?.whole).toBe(true);
    expect(side.timeline?.steps.find((s) => s.key === "delivered")?.note).toBe("From Shopify's fulfillment");
    expect(side.timeline?.lastOpen?.distance_m).toBe(2600);
    expect(side.door).toEqual(includedRecordDoor("ink_key_example", PROOF));
    expect(side.packet).toBeNull();
    for (const door of [`/proofs/${PROOF}/audit`, `/proofs/${PROOF}/opens`, `/proofs/${PROOF}`]) {
      const hit = asked.find((a) => a.url.endsWith(door));
      expect(hit, door).toBeDefined();
      expect(hit!.auth).toBe("Bearer ink_key_example");
    }
  });

  it("no proof, no read; a door that does not answer draws as a row without it", async () => {
    asked.length = 0;
    for (const proofId of [null, "not-a-proof"]) {
      expect(await ritualistRowRecord("ink_key_example", proofId, null, fake)).toEqual({
        record: null, door: includedRecordDoor("ink_key_example", proofId), packet: null, timeline: null,
      });
    }
    expect(asked).toEqual([]);
    const down = (async () => { throw new Error("backend down"); }) as typeof fetch;
    const side = await ritualistRowRecord("ink_key_example", PROOF, null, down);
    expect(side).toMatchObject({ record: null, timeline: null, packet: null });
  });
});

describe("the row, opened", () => {
  let html = "";
  let t = "";
  beforeAll(() => {
    html = open(rowWith(RECORD, PROOF_BODY, OPENS_BODY));
    t = text(html);
  });

  it("keeps the Ritualist's full-record button and draws ink's panel: the glance, the order's activity, Advanced", () => {
    for (const part of ["View full record", "Products", "Bar Tape", "Recipient", "Gift Recipient", "Order email: order@example.com", "Order activity", "Advanced"]) expect(t).toContain(part);
  });

  it("the rail says where each time came from, and ticks only ink's own record", () => {
    expect(t).toContain("Recorded by ink");
    expect(t).toContain("From Shopify's fulfillment");
    // enrolled and opened are ink's own; delivered is Shopify's report: a ring, no tick.
    expect(html.match(/aria-label="Recorded"/g)?.length).toBe(2);
    expect(html.match(/aria-label="Reported"/g)?.length).toBe(1);
    expect(html).not.toContain('aria-label="Carrier scan"');
  });

  it("the last open leads, with its distance and accuracy, its place and its device; the delivery address small beside it", () => {
    for (const part of ["The last open", "Opened 2.6 km from the delivery address. Accuracy ±7 m.", "Example Street, Example City", "· iPhone", "Delivery address", "1 Test St"]) expect(t).toContain(part);
    expect(html).toContain('data-testid="the-last-open"');
    expect(html).toContain('data-testid="delivery-address-block"');
  });

  it("every open says its device, browser and kind", () => {
    expect(html).toContain('data-testid="every-open"');
    for (const part of ["Every open", "Device", "Browser", "Open", "iPhone", "browser A", "first open"]) expect(t).toContain(part);
  });

  it("the record's files stand, free: never Get the record, never a price", () => {
    for (const part of ["Export the record", "Download PDF", "Download CSV", "Download record (JSON)"]) expect(t).toContain(part);
    for (const gone of ["Get the record", "$29", "One-time Shopify charge", "again in Records"]) expect(t).not.toContain(gone);
  });

  it("judges nothing, and prints no coordinate", () => {
    expect(t).not.toMatch(JUDGED);
    expect(t).not.toMatch(/40\.71|74\.01|40\.69|73\.99/);
  });
});

describe("the row's full-record view says the same activity, and no invented shipping", () => {
  let t = "";
  beforeAll(async () => {
    const { default: OrderDetailView } = await import("../components/OrderDetailView");
    const order = { ...DETAIL, customerName: "Made Up", customerEmail: "buyer@example.com", row: rowWith(RECORD, PROOF_BODY, OPENS_BODY) };
    const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <OrderDetailView order={order as never} onBack={() => {}} /> }]);
    t = text(renderToString(<AppProvider i18n={translations}><Stub initialEntries={["/"]} /></AppProvider>));
  });

  it("the order's activity is ink's rail, each step with its source — never a bare delivered time", () => {
    for (const part of ["Order activity", "Recorded by ink", "From Shopify's fulfillment"]) expect(t).toContain(part);
    expect(t).not.toContain("No delivery recorded yet.");
  });

  it("no 'Shipping — Free' on an order that paid for shipping or not", () => {
    expect(t).not.toMatch(/Shipping\s*Free/);
    expect(t).toContain("Subtotal");
  });

  it("keeps the way to Shopify and the handoff to the studio", () => {
    expect(t).toContain("View in Shopify");
    expect(t).toContain("lives in The Ritualist Studio. Open it from the Dashboard.");
  });
});

describe("a record without a delivery point says which fact it is", () => {
  const noPoint = { ...PROOF_BODY, shipping_geocode_lat: null, shipping_geocode_lng: null };
  const opensNoPoint = { ...OPENS_BODY, address: null, last_open: { ...OPENS_BODY.last_open, distance_m: null } };
  const saying = (word: "none" | "ungeocoded"): RecordRead => ({ ...RECORD, summary: { ...RECORD.summary, address_state: word } });

  it("no shipping address on the order", () => {
    const t = text(open(rowWith(saying("none"), noPoint, opensNoPoint)));
    expect(t).toContain("No shipping address on this order.");
    expect(t).not.toMatch(/geocod/i);
  });

  it("an address on file with no map point yet", () => {
    expect(text(open(rowWith(saying("ungeocoded"), noPoint, opensNoPoint)))).toContain("The address is on file but has no map point yet.");
  });
});
