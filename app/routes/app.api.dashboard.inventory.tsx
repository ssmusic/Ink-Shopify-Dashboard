import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getInventoryByShopDomain } from "../services/ink-api.server";
const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    
    // Fetch inventory using our existing service
    const inventoryData = await getInventoryByShopDomain(session.shop);
    
    return json({
      remaining: inventoryData.current_count,
      total: inventoryData.total_purchased,
      success: true
    });
  } catch (err: any) {
    console.error("Dashboard Inventory API Error:", err);
    return json({ error: "Failed to fetch inventory", success: false }, { status: 500 });
  }
};
