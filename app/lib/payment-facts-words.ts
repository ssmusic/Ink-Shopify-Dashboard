// Shopify's payment facts in one sentence — the same words ink-backend
// utils/paymentFacts.js puts in the dispute text, and the-ritualist
// src/lib/record-pdf.ts prints: a record reads the same everywhere.
// PLACEHOLDER words; the facts are Shopify's, and nothing here says what a
// network does with them.
const lower = (w: unknown) => String(w).toLowerCase().replace(/_/g, " ");
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null);

export function paymentFactsWords(facts: unknown): string | null {
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return null;
  const f = facts as Record<string, unknown>;
  const parts: string[] = [];
  if (str(f.avs_result_code)) parts.push(`address check (AVS) result ${str(f.avs_result_code)}`);
  if (str(f.cvv_result_code)) parts.push(`card-code check (CVV) result ${str(f.cvv_result_code)}`);
  if (typeof f.billing_matches_shipping === "boolean") parts.push(`billing address ${f.billing_matches_shipping ? "matches" : "does not match"} the shipping address`);
  if (str(f.risk_recommendation)) parts.push(`Shopify's risk recommendation: ${lower(f.risk_recommendation)}${str(f.risk_level) ? ` (${lower(f.risk_level)})` : ""}`);
  if (str(f.shopify_protect_status)) parts.push(`Shopify Protect: ${lower(f.shopify_protect_status)}`);
  if (Array.isArray(f.disputes)) {
    const first = f.disputes[0] as { status?: unknown } | undefined;
    parts.push(f.disputes.length ? `disputes on this order: ${f.disputes.length}${str(first?.status) ? ` (${lower(first?.status)})` : ""}` : "no disputes on this order");
  }
  if (!parts.length) return null;
  const readAt = typeof f.read_at === "string" && Number.isFinite(Date.parse(f.read_at)) ? new Date(f.read_at).toISOString().slice(0, 10) : null;
  return `Shopify's payment record${readAt ? `, read ${readAt}` : ""}: ${parts.join("; ")}.`;
}
