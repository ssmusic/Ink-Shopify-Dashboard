// A BOUGHT RECORD'S DISPUTE PACKET — shown in the app, not linked out.
//
// Sam, 2026-09-23: "were doing everything inside this shopify app". Once a
// record is bought, the purchase carries its packet link
// (https://www.in.ink/verify/<id>?key=rk_…, ink-backend recordRetrieval.js).
// The key in it opens GET /verify/:proofId/packet?key= (routes/verifyOrder.js,
// built by utils/disputePacket.js), and the three things a merchant pastes
// into Shopify's dispute form are read from it: accessActivityLog,
// uncategorizedText, and the shipping documentation's text (Shopify takes a
// FILE there; the text is what goes in it).
//
// Only those three texts leave this file. The packet's `signed_source` export
// is built for the merchant's own records and carries the buyer's name and
// address (ink-backend exportBundle.js) — it is never passed to the screen.

const INK_API_URL = process.env.INK_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api";
const PROOF_ID = /^proof_[0-9a-f]{24}$/;
const KEY = /^rk_[0-9a-f]{64}$/;
const READ_BUDGET_MS = 3_000;

export type DisputePacketText = {
  accessActivityLog: string;
  uncategorizedText: string;
  shippingDocumentation: string;
};

/** The purchase key inside a packet link, or null. */
export function keyFromPacketUrl(packetUrl: string | null | undefined): string | null {
  if (!packetUrl) return null;
  try {
    const key = new URL(packetUrl).searchParams.get("key");
    return key && KEY.test(key) ? key : null;
  } catch {
    return null;
  }
}

export function packetTextFromBody(body: unknown): DisputePacketText | null {
  const b = body as {
    shopify_dispute_evidence?: { accessActivityLog?: unknown; uncategorizedText?: unknown };
    shopify_dispute_files?: { shippingDocumentationFile?: { text?: unknown } };
  } | null;
  const ev = b?.shopify_dispute_evidence;
  if (!ev) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    accessActivityLog: str(ev.accessActivityLog),
    uncategorizedText: str(ev.uncategorizedText),
    shippingDocumentation: str(b?.shopify_dispute_files?.shippingDocumentationFile?.text),
  };
}

export async function readDisputePacket(
  proofId: string,
  packetUrl: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<DisputePacketText | null> {
  const key = keyFromPacketUrl(packetUrl);
  if (!PROOF_ID.test(proofId) || !key) return null;
  const base = INK_API_URL.endsWith("/") ? INK_API_URL.slice(0, -1) : INK_API_URL;
  try {
    const res = await fetchImpl(`${base}/verify/${encodeURIComponent(proofId)}/packet?key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(READ_BUDGET_MS),
    });
    if (!res.ok) return null;
    return packetTextFromBody(await res.json());
  } catch (err) {
    console.warn(`[ink] dispute packet read failed for ${proofId}:`, (err as Error)?.message ?? err);
    return null;
  }
}
