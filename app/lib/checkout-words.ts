// THE CHECKOUT BESIDE THE OPENS, IN TWO LINES (Sam, 2026-09-23: "i want to
// be able to flag a mismatch between the phone that ordered the item and the
// one thats checking" → "i want those things").
//
// The backend's words carry `checkout_vs_opens` (ink-backend utils/auditPacket.js
// checkoutVsOpens) only when its CHECKOUT_DETAILS_ENABLED switch is on: what
// the checkout was — Shopify's client_details, reduced at enrol — and, of the
// order's opens, how many were on the checkout's device type, how many came
// from its network, and the first that was on neither. These are counts and
// facts: no line here says what they mean.
//
// The same words as the record page (the-ritualist src/lib/checkout-words.ts);
// checkout-words.vectors.json is that repo's file, byte for byte. Pure: the
// screen renders the same words on the server and in the browser.
//
// Every string is PLACEHOLDER copy — Sam's words replace it.

import { when as localWhen } from "./record-words";

type Compared = { compared: number; same: number };

export type CheckoutVsOpens =
  | { recorded: false }
  | {
      recorded: true;
      checkout: { device: string | null; browser: string | null; os: string | null; language: string | null };
      opens: {
        count: number;
        device: Compared | null;
        network: Compared | null;
        first_on_neither: { at: string | null; device: string | null; browser: string | null } | null;
        capped: boolean;
      };
    };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const count = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

function comparedOf(v: unknown): Compared | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== "object") return undefined;
  const c = v as Record<string, unknown>;
  const compared = count(c.compared);
  const same = count(c.same);
  return compared != null && same != null && same <= compared ? { compared, same } : undefined;
}

/** The door's `checkout_vs_opens`, read strictly — or null, and nothing is printed. */
export function checkoutFromBody(v: unknown): CheckoutVsOpens | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const b = v as Record<string, unknown>;
  if (b.recorded === false) return { recorded: false };
  if (b.recorded !== true) return null;
  const c = b.checkout && typeof b.checkout === "object" ? (b.checkout as Record<string, unknown>) : null;
  const o = b.opens && typeof b.opens === "object" ? (b.opens as Record<string, unknown>) : null;
  if (!c || !o) return null;
  const n = count(o.count);
  const device = comparedOf(o.device);
  const network = comparedOf(o.network);
  if (n == null || device === undefined || network === undefined) return null;
  const f = o.first_on_neither && typeof o.first_on_neither === "object" ? (o.first_on_neither as Record<string, unknown>) : null;
  return {
    recorded: true,
    checkout: { device: str(c.device), browser: str(c.browser), os: str(c.os), language: str(c.language) },
    opens: {
      count: n,
      device,
      network,
      first_on_neither: f ? { at: str(f.at), device: str(f.device), browser: str(f.browser) } : null,
      capped: o.capped === true,
    },
  };
}

export type CheckoutLine = { label: string; words: string };

/** The two lines (one, for an order with no checkout facts). */
export function checkoutLines(cvo: CheckoutVsOpens, { when = localWhen }: { when?: (iso: string) => string } = {}): CheckoutLine[] {
  // PLACEHOLDER copy, every string below.
  if (!cvo.recorded) return [{ label: "Checkout", words: "Device not recorded" }];
  const c = cvo.checkout;
  const device = c.device === "Other" ? "Other device" : c.device;
  const said = [device, c.browser, c.language].filter(Boolean);
  const lines: CheckoutLine[] = [{ label: "Checkout", words: said.length ? said.join(" · ") : "Device not recorded" }];

  const o = cvo.opens;
  let words: string;
  if (o.count === 0) {
    words = "No opens yet";
  } else if (!o.device && !o.network) {
    words = "Not compared: the checkout's device type and network were not recorded";
  } else {
    const parts: string[] = [];
    if (o.device) parts.push(`${o.device.same} of ${o.device.compared} on the checkout's device type`);
    if (o.network) parts.push(`${o.network.same} of ${o.network.compared} from the checkout's network`);
    const f = o.first_on_neither;
    if (f && f.at) {
      const what = [f.device, f.browser].filter(Boolean).join(" · ");
      parts.push(`first on neither: ${when(f.at)}${what ? ` (${what})` : ""}`);
    }
    if (o.capped) parts.push("newest opens only");
    words = parts.join(" · ");
  }
  lines.push({ label: "Opens compared", words });
  return lines;
}
