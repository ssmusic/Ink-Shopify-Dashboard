import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getMerchantInsights } from "../services/ink-api.server";

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

// GET /app/api/dashboard/insights — server-side operational + integrity aggregate
// for the authenticated merchant (ink-backend /api/merchant-insights). Consumed by
// the Advanced section's native KPI cards. Degrades to { unavailable: true } so the
// card never throws.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const insights = await getMerchantInsights(session.shop);
    return json(insights ?? { unavailable: true });
  } catch (err: any) {
    // Re-auth redirects from authenticate.admin are Responses — bubble those.
    if (err instanceof Response) throw err;
    console.error("[insights] error:", err?.message || err);
    return json({ unavailable: true });
  }
};
