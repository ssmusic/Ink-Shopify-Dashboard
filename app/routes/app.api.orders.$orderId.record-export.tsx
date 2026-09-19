import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getProofExport } from "../services/ink-api.server";
import { findMerchantDoc } from "../services/merchant-doc.server";

// GET /app/api/orders/:orderId/record-export?proof=proof_… — the export
// bundle from ink (every file under a signed manifest), handed through as
// the file it is. Scope is enforced by ink: another shop's proof is 404.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const proofId = new URL(request.url).searchParams.get("proof") ?? "";
  if (!/^proof_[0-9a-f]{24}$/.test(proofId)) return new Response("Not found", { status: 404 });
  const firestore = (await import("../firestore.server")).default;
  const merchant = await findMerchantDoc(firestore, session.shop);
  const apiKey: string | null = merchant?.data?.ink_api_key ?? null;
  if (!apiKey) return new Response("This shop has no ink key", { status: 409 });
  const bundle = await getProofExport(apiKey, proofId);
  if (!bundle) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(bundle), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="ink-order-${(bundle?.manifest?.proof_id ?? params.orderId ?? proofId)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
};
