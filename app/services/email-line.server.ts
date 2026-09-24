// THE EMAIL LINE, READ FOR ONE STORE — what both apps' setup step shows.
//
// Measured on the Steve Madden rig, 2026-09-24: Shopify sends its shipping
// emails 1–6 s before ink's tracking rewrite lands, every time, so the line a
// merchant pastes (notification-snippet.ts) is the only way the page reaches
// Shopify's own emails. This reads the brand host the line needs and the
// door's own evidence that it works (emailDoorOf).
//
// STRICT HOST: only a claimed `brand_slug` on the backend doc. The myshopify
// label looks right and 404s, and www.in.ink/o/ opens no order — so a store
// without a claimed host gets no line at all rather than one that cannot work.
import firestore from "../firestore.server";
import { brandSlugFromDomain } from "./email.server";
import {
  emailDoorOf,
  notificationSnippet,
  SNIPPET_TEMPLATES,
  type EmailDoor,
} from "./notification-snippet";

export interface EmailLineView {
  snippet: string | null;
  brandHost: string | null;
  templates: readonly string[];
  notificationsUrl: string;
  emailDoor: EmailDoor | null;
}

export function notificationsUrlFor(shop: string): string {
  const store = String(shop || "").replace(/\.myshopify\.com$/i, "");
  return store
    ? `https://admin.shopify.com/store/${encodeURIComponent(store)}/settings/notifications`
    : "https://admin.shopify.com";
}

/** Build the view from a backend merchant doc. Pure, so it is tested alone. */
export function emailLineFromBackend(shop: string, backend: Record<string, any> | null): EmailLineView {
  const slug = brandSlugFromDomain(backend?.brand_slug as string | undefined) || "";
  return {
    snippet: slug ? notificationSnippet(slug) : null,
    brandHost: slug ? `${slug}.in.ink` : null,
    templates: SNIPPET_TEMPLATES,
    notificationsUrl: notificationsUrlFor(shop),
    emailDoor: emailDoorOf(backend),
  };
}

/** Read it. Never throws: an unreadable doc is a view with no line. */
export async function readEmailLine(shop: string, shopId: string | null | undefined): Promise<EmailLineView> {
  let backend: Record<string, any> | null = null;
  if (shopId) {
    try {
      const snap = await firestore.collection("merchants").doc(shopId).get();
      backend = snap.exists ? (snap.data() ?? null) : null;
    } catch (e: any) {
      console.warn(`[email-line] backend merchant doc unreadable for ${shop}: ${e?.message ?? e}`);
    }
  }
  return emailLineFromBackend(shop, backend);
}
