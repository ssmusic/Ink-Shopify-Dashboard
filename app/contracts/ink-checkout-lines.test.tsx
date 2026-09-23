// INK'S ORDER VIEW SAYS THE CHECKOUT BESIDE THE OPENS — two lines under the
// record's words, only when the backend's words carry `checkout_vs_opens`
// (ink-backend, behind its CHECKOUT_DETAILS_ENABLED). Absent, the record reads
// and renders exactly as it did: the snapshot below pins the record's markup
// with no checkout, and must never move for the checkout's sake.
//
// (It moved once, on purpose: 2026-09-23, when the Codex audit's design pass
// and the rulings pass were reconciled, the record's words took the Polaris
// look Sam steered — sentence case, a level badge per element. The checkout's
// two lines, their words and their place after the open did not change, and
// "switch off, nothing printed" is still pinned below: a malformed comparison
// renders byte-identically to none.) It moved back the same evening, when Sam
// chose Codex's screens as they were at 4022900: the record's markup is Codex's
// RecordWords again, and the checkout's two lines still follow the elements.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { describe, expect, it } from "vitest";
import { recordFromBody } from "../services/ink-record.server";
import { RecordWords } from "../components/InkRecentOrders";

const PROOF = "proof_aec827b527fb30457c1da890";
// The backend's public read, as it answered for Corvara #1010 on 2026-09-23.
const BODY = {
  proof_id: PROOF,
  audience: "public",
  summary: { order_number: "#1010", buyer_initials: "SM", opens: 1 },
  verdict: {
    elements: [
      { element: "order", required: true, label: "Order", value: { order_number: "#1010", enrolled_at: "2026-08-20T18:50:54.195Z" }, status: "attested" },
      { element: "delivery_date", required: true, label: "Delivery date", value: null, status: "missing" },
      { element: "the_open", required: true, label: "The open", value: { opens: 1, first_open_signed: true }, status: "verified" },
    ],
    elements_complete: false,
  },
  record: { locked: true, price_cents: 2900, currency: "USD" },
};
const CVO = {
  recorded: true,
  checkout: { device: "iPhone", browser: "Safari", os: "iOS", language: "en-US" },
  opens: {
    count: 5,
    device: { compared: 4, same: 2 },
    network: { compared: 4, same: 1 },
    first_on_neither: { at: "2026-09-16T22:00:00.000Z", device: "Android", browser: "Chrome" },
    capped: false,
  },
};

const html = (body: unknown) =>
  renderToString(
    <AppProvider i18n={translations}>
      <RecordWords record={recordFromBody(body)} />
    </AppProvider>,
  );
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// The snapshot's record carries no instant: a time renders in the machine's
// own clock, and CI's clock is not this laptop's.
const UNTIMED = {
  ...BODY,
  verdict: {
    ...BODY.verdict,
    elements: BODY.verdict.elements.map((e) => (e.element === "order" ? { ...e, value: { order_number: "#1010" } } : e)),
  },
};

describe("the record without the checkout — today's, byte for byte", () => {
  it("reads to today's three keys", () => {
    expect(Object.keys(recordFromBody(BODY)!)).toEqual(["summary", "elements", "locked"]);
  });

  it("renders today's markup", () => {
    const h = html(UNTIMED);
    expect(h).toMatchSnapshot();
    expect(text(h)).not.toContain("Checkout");
    expect(text(h)).not.toContain("Opens compared");
  });
});

describe("the record with the checkout beside the opens", () => {
  it("reads it off the words", () => {
    expect(recordFromBody({ ...BODY, checkout_vs_opens: CVO })?.checkout).toEqual(CVO);
    expect(recordFromBody({ ...BODY, checkout_vs_opens: { recorded: false } })?.checkout).toEqual({ recorded: false });
  });

  it("prints the two lines under the record's words, after the open", () => {
    const t = text(html({ ...BODY, checkout_vs_opens: CVO }));
    expect(t).toContain("Checkout iPhone · Safari · en-US");
    expect(t).toContain("Opens compared 2 of 4 on the checkout's device type · 1 of 4 from the checkout's network · first on neither:");
    expect(t).toContain("(Android · Chrome)");
    expect(t.indexOf("Checkout")).toBeGreaterThan(t.indexOf("The open"));
  });

  it("an old order says one line", () => {
    const t = text(html({ ...BODY, checkout_vs_opens: { recorded: false } }));
    expect(t).toContain("Checkout Device not recorded");
    expect(t).not.toContain("Opens compared");
  });

  it("a malformed comparison is not printed at all", () => {
    expect(html({ ...BODY, checkout_vs_opens: { recorded: true } })).toBe(html(BODY));
  });
});

describe("the Ritualist flavor never prints it", () => {
  it("only ink's order view reads the checkout words (ink-mounts.test.ts pins that /app/ink is ink's alone)", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const importers = (readdirSync(root, { recursive: true }) as string[])
      .filter((f) => /^(routes|components)\//.test(f) && /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
      .filter((f) => readFileSync(join(root, f), "utf8").includes("checkout-words"))
      .sort();
    expect(importers).toEqual(["components/InkRecentOrders.tsx"]);
  });
});
