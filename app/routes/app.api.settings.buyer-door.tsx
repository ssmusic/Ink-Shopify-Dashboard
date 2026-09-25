/**
 * Where the tracking link goes — the Ritualist's Settings › Delivery door
 * (2026-09-25; app/lib/buyer-door-choice.ts has the why).
 *
 * GET  → BuyerDoorAnswer (what the store does now, where it came from, the
 *        choices this store has)
 * POST { choice } → BuyerDoorAnswer after the write
 *
 * Gated by `authenticate.admin(request)`: the shop is the Shopify session's.
 * The write goes to the backend's admin door from this server
 * (services/buyer-door-choice.server.ts) — never a secret in the browser.
 * ink draws the same card from its own Settings route (app.ink.settings.tsx).
 */
import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { readBuyerDoor, saveBuyerDoor } from "../services/buyer-door-choice.server";

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return json(await readBuyerDoor(session.shop));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, { status: 405 });
  const { session } = await authenticate.admin(request);
  const body = await request.json().catch(() => null);
  return json(await saveBuyerDoor(session.shop, body?.choice));
};
