// The ONE definition of notification settings — defaults, shape, sanitation.
//
// Before this module, the default literals lived in three places (the API
// route, the component's useState initializers, and the component's `??`
// fallbacks) and the API wrote `request.json()` verbatim onto the merchant
// doc. One source of truth, one sanitizer; the route and the component both
// import from here.
//
// Tap reminders (hours4/24/48) are deliberately ABSENT: they were designed for
// the NFC-tag era (Sam, 2026-08-07: "tap reminders were from when this was nfc
// tags") and no scheduler ever existed to send them. `sanitizeNotificationSettings`
// drops a legacy `reminders` group on sight, so old stored docs shed it on
// their next save.

export const TEMPLATE_KEYS = [
  "shipping_confirmation",
  "shipping_update",
  "out_for_delivery",
  "delivered",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface NotificationSettings {
  channels: { email: boolean; sms: boolean };
  delivery: { outForDelivery: boolean; delivered: boolean; deliveryConfirmed: boolean };
  /** Future: reminder emails before the return window closes. Stored for
   *  forward-compat; the page shows them disabled until the scheduler exists. */
  returnReminders: { days7: boolean; hours48: boolean };
  /** Mirrors the REAL gate (backend merchant.return_window_days) — the save
   *  path PATCHes the backend first, then stores this copy for email text. */
  returnWindow: "14" | "30" | "60" | "90";
  /** Self-reported record of the Shopify-template paste (ISO timestamp or
   *  null). Self-reported because no Shopify API can read notification
   *  templates — verified against Shopify's docs 2026-08-07. */
  templatesPastedAt: Record<TemplateKey, string | null>;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  channels: { email: true, sms: false },
  delivery: { outForDelivery: true, delivered: true, deliveryConfirmed: false },
  returnReminders: { days7: true, hours48: false },
  returnWindow: "30",
  templatesPastedAt: {
    shipping_confirmation: null,
    shipping_update: null,
    out_for_delivery: null,
    delivered: null,
  },
};

const RETURN_WINDOW_VALUES = new Set(["14", "30", "60", "90"]);

function bool(value: unknown, fallback: boolean): boolean {
  return value === true || value === false ? value : fallback;
}

/** Layer an untrusted payload over a trusted base. Only known keys survive;
 *  only literal booleans move a toggle; returnWindow only takes the four
 *  offered values; templatesPastedAt only the four known templates. */
export function sanitizeNotificationSettings(
  input: unknown,
  base: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS,
): NotificationSettings {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, any>;

  const templates = {} as NotificationSettings["templatesPastedAt"];
  for (const key of TEMPLATE_KEYS) {
    const v = raw.templatesPastedAt?.[key];
    templates[key] =
      typeof v === "string" || v === null ? v : base.templatesPastedAt[key] ?? null;
  }

  return {
    channels: {
      email: bool(raw.channels?.email, base.channels.email),
      sms: bool(raw.channels?.sms, base.channels.sms),
    },
    delivery: {
      outForDelivery: bool(raw.delivery?.outForDelivery, base.delivery.outForDelivery),
      delivered: bool(raw.delivery?.delivered, base.delivery.delivered),
      deliveryConfirmed: bool(raw.delivery?.deliveryConfirmed, base.delivery.deliveryConfirmed),
    },
    returnReminders: {
      days7: bool(raw.returnReminders?.days7, base.returnReminders.days7),
      hours48: bool(raw.returnReminders?.hours48, base.returnReminders.hours48),
    },
    returnWindow: RETURN_WINDOW_VALUES.has(raw.returnWindow)
      ? raw.returnWindow
      : base.returnWindow,
    templatesPastedAt: templates,
  };
}

/** The shop domain out of a verified token payload. App Bridge session tokens
 *  carry the shop in `dest` ("https://{shop}.myshopify.com"), not `shop` —
 *  the old route only read `shop`/`merchant_id`, which is why an embedded
 *  save could never resolve a merchant. Null when nothing names a shop:
 *  the caller 404s rather than guessing. */
export function resolveShopFromTokenPayload(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload) return null;
  if (typeof payload.shop === "string" && payload.shop) return payload.shop;
  if (typeof payload.dest === "string" && payload.dest) {
    try {
      const host = new URL(payload.dest).host;
      return host || null;
    } catch {
      return null;
    }
  }
  return null;
}
