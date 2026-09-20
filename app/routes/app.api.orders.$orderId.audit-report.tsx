import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getProofAudit } from "../services/ink-api.server";
import { findMerchantDoc } from "../services/merchant-doc.server";
import { buildAuditReportPdf } from "../services/audit-report.server";
import { publicVerifyUrl } from "../services/verify-url.server";

// GET /app/api/orders/:orderId/audit-report?proof=proof_… — the merchant's
// printed audit report, as a PDF. The proof id comes from the page; the
// merchant's own key asks ink, and ink answers 404 for any other shop's
// proof, so the scope is enforced where the record lives.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const proofId = new URL(request.url).searchParams.get("proof") ?? "";
  if (!/^proof_[0-9a-f]{24}$/.test(proofId)) return new Response("Not found", { status: 404 });
  const firestore = (await import("../firestore.server")).default;
  const merchant = await findMerchantDoc(firestore, session.shop);
  const apiKey: string | null = merchant?.data?.ink_api_key ?? null;
  if (!apiKey) return new Response("This shop has no ink key", { status: 409 });
  const packet = await getProofAudit(apiKey, proofId);
  if (!packet) return new Response("Not found", { status: 404 });
  const tz = (await shopTimezone(request)) ?? "UTC";
  const pdf = buildAuditReportPdf(packet, { verifyUrl: publicVerifyUrl(proofId), tz });
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ink-audit-report-${(packet.summary.order_number ?? params.orderId ?? proofId).replace(/[^A-Za-z0-9#_-]/g, "")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
};

// The shop's IANA timezone, so the report's clock is the merchant's — the
// order page already renders dates this way (ENGINEERING_BIBLE §17.2).
async function shopTimezone(request: Request): Promise<string | null> {
  try {
    const { admin } = await authenticate.admin(request);
    const res = await admin.graphql(`#graphql
      query InkShopTz { shop { ianaTimezone } }`);
    const body = await res.json();
    return body?.data?.shop?.ianaTimezone ?? null;
  } catch {
    return null;
  }
}
