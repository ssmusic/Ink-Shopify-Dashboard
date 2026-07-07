import { redirect, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Orphaned with /app/payment. Kept as a redirect so any stale return URL
// resolves to the honest billing page instead of 404-ing.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return redirect("/app/billing");
};
