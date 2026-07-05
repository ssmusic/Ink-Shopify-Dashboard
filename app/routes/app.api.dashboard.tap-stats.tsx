import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getMerchantTapStats } from "../services/ink-api.server";

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

// GET /app/api/dashboard/tap-stats — real verified-tap + enrollment totals for the
// authenticated merchant, summed from their proofs. Consumed by CurrentPlanCard.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const stats = await getMerchantTapStats(session.shop);
    return json(stats);
  } catch (err: any) {
    // Re-auth redirects from authenticate.admin are Responses — bubble those so
    // App Bridge can recover; only swallow real errors to zeros.
    if (err instanceof Response) throw err;
    console.error("[tap-stats] error:", err?.message || err);
    return json({ totalTaps: 0, enrollments: 0, engaged: 0, delivered: 0, clicked: 0, totalClicks: 0 });
  }
};
