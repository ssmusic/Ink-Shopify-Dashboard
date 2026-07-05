import { redirect, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// The old /app/payment showed a manual "Activate ink — ₹0.10/month" screen
// that called appSubscriptionCreate and bypassed on error. Billing now runs
// through Shopify Managed Pricing (the App Store plan picker), so this route
// is dead — redirect anyone who lands here to the honest billing page rather
// than show a fake activation flow (a reviewer WILL try direct URLs).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return redirect("/app/billing");
};
