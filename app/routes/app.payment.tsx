import { redirect, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Legacy manual-payment entry. Billing now runs through Shopify App Pricing,
// so direct visits redirect to the honest billing page.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return redirect("/app/billing");
};
