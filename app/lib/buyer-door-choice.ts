// WHERE THE TRACKING LINK GOES — the merchant's own choice (2026-09-25).
//
// Sam: "ORDER #1029 email link is resolving to the ritualist. It used to
// resolve to ink, and then the ritualist which should be the order page of
// Steve's choice. If he just uses ink, no control of this for me."
//
// One control in three places — ink's Settings, the Ritualist's Settings
// (Delivery) and the Ritualist dashboard's Settings (the-ritualist
// src/components/settings/BuyerDoorSettings.tsx) — over ONE dial: the buyer's
// door on the backend merchant record (ink-backend utils/buyerDoor.js). The
// dashboard's server holds the same table (the-ritualist
// worker-recovered/src/buyer-door-choice.js). Change one, change both.
//
// This file is the pure half — the table, the view, the words — so the
// Polaris card and the server share it. Every word is PLACEHOLDER for Sam.
//
// Reverses 09-23 ("we shouldnt get involved with their flow if we dont have
// to" — the destination choice left ink's Settings) on Sam's newer word
// above.

export const BUYER_DOOR_CHOICES = ["ask_order_status", "ask_ritualist_page", "ask_carrier", "ritualist_page"] as const;
export type BuyerDoorChoice = (typeof BUYER_DOOR_CHOICES)[number];

/** What each choice writes through the admin door — the backend's own words.
 *  An ask writes the white face too, so a Ritualist store's ask is the blank
 *  page (never the mark flash), and every written dial wins over the plan's
 *  default, so a choice survives the plan flipping at publish. */
export const BUYER_DOOR_CHOICE_DIALS: Record<BuyerDoorChoice, Record<string, string>> = {
  ask_order_status: { page_mode: "flash", flash_face: "white", flash_forward: "order_status" },
  ask_ritualist_page: { page_mode: "flash", flash_face: "white", flash_forward: "page" },
  ask_carrier: { page_mode: "flash", flash_face: "white", flash_forward: "carrier" },
  ritualist_page: { page_mode: "page" },
};

const RITUALIST_ONLY: ReadonlySet<BuyerDoorChoice> = new Set(["ask_ritualist_page", "ritualist_page"]);

export interface BuyerDoorView {
  plan: "ink" | "ritualist";
  /** One of the four, or null when the store's door is none of them (the
   *  mark flash, set by hand) — `face` and `forward` still say what it is. */
  choice: BuyerDoorChoice | null;
  face: "white" | "mark" | null;
  forward: "order_status" | "carrier" | "page" | null;
  /** "default": no dial written, the plan decides. "chosen": written. */
  source: "default" | "chosen";
  /** What this store may pick: the Ritualist page only on the Ritualist's
   *  plan, which flips when the merchant publishes a page. */
  choices: BuyerDoorChoice[];
}

export function isBuyerDoorChoice(value: unknown): value is BuyerDoorChoice {
  return typeof value === "string" && (BUYER_DOOR_CHOICES as readonly string[]).includes(value);
}

export function choicesFor(plan: "ink" | "ritualist"): BuyerDoorChoice[] {
  return BUYER_DOOR_CHOICES.filter((c) => plan === "ritualist" || !RITUALIST_ONLY.has(c));
}

function known<T extends string>(value: unknown, words: readonly T[]): T | null {
  return typeof value === "string" && (words as readonly string[]).includes(value) ? (value as T) : null;
}

/** The control's view of the backend merchant record, read the way the
 *  backend reads it (buyerDoorFromMerchant): an unknown word is an absence. */
export function buyerDoorView(merchant: Record<string, unknown> | null | undefined): BuyerDoorView {
  const m = merchant ?? {};
  const plan = m.plan === "ink" ? "ink" : "ritualist";
  const rawMode = known(m.page_mode, ["page", "flash"] as const);
  const rawFace = known(m.flash_face, ["white", "mark"] as const);
  const rawForward = known(m.flash_forward, ["order_status", "carrier", "page"] as const);
  const mode = rawMode ?? (plan === "ink" ? "flash" : "page");
  const choices = choicesFor(plan);
  if (mode === "page") {
    return { plan, choice: "ritualist_page", face: null, forward: null, source: rawMode ? "chosen" : "default", choices };
  }
  const face = rawFace ?? (plan === "ink" ? "white" : "mark");
  const forward = rawForward ?? "order_status";
  const choice: BuyerDoorChoice | null =
    face === "white" ? (forward === "page" ? "ask_ritualist_page" : forward === "carrier" ? "ask_carrier" : "ask_order_status") : null;
  return { plan, choice, face, forward, source: rawMode || rawFace || rawForward ? "chosen" : "default", choices };
}

// ⚠️ PLACEHOLDER COPY — the same words as the dashboard
// (the-ritualist src/lib/buyer-door-choice.ts).
export const BUYER_DOOR_HEADING = "When a buyer opens the tracking link";

export const BUYER_DOOR_CHOICE_WORDS: Record<BuyerDoorChoice, { title: string; detail: string }> = {
  ask_order_status: {
    title: "Ask, then the order page",
    detail: "ink's blank page asks for their location, then goes on to Shopify's order status page.",
  },
  ask_ritualist_page: {
    title: "Ask, then the Ritualist page",
    detail: "ink's blank page asks for their location, then goes on to the Ritualist page.",
  },
  ask_carrier: {
    title: "Ask, then the carrier",
    detail: "ink's blank page asks for their location, then goes on to the carrier's tracking page.",
  },
  ritualist_page: {
    title: "Straight to the Ritualist page",
    detail: "The Ritualist page opens at once.",
  },
};

const FORWARD_WORDS = {
  order_status: "Shopify's order status page",
  carrier: "the carrier's tracking page",
  page: "the Ritualist page",
} as const;

export function buyerDoorNowSentence(view: BuyerDoorView): string {
  if (view.choice) return BUYER_DOOR_CHOICE_WORDS[view.choice].detail;
  return `Your mark and a Share location button, then ${FORWARD_WORDS[view.forward ?? "order_status"]}.`;
}

export function buyerDoorSourceSentence(view: BuyerDoorView): string {
  if (view.source === "chosen") return "Chosen for this store.";
  return view.plan === "ink" ? "ink's default." : "The Ritualist's default.";
}

export type BuyerDoorAnswer = { ok: true; view: BuyerDoorView } | { ok: false; error: string };
