import { boundary } from "@shopify/shopify-app-react-router/server";
import { redirect, type LoaderFunctionArgs, useRouteError, type HeadersFunction } from "react-router";
import { authenticate } from "../shopify.server";

// Legacy manual-payment entry. Billing now runs through Shopify App Pricing,
// so direct visits redirect to the honest billing page.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return redirect("/app/billing");
};

// EVERY EMBEDDED ROUTE NEEDS SHOPIFY'S BOUNDARY.
// When a session needs re-auth, @shopify/shopify-app-react-router THROWS a
// Response with status 200 carrying X-Shopify-API-Request-Failure-Reauthorize
// headers, for App Bridge to intercept. Without boundary.error(), React Router
// treats it as a route error response and renders its STATUS — a page whose
// entire body is the text "200". That is Shopify rejection 2.1.1, round two:
// "going to the billing section and navigating back ... shows an 200 error
// page". Billing had this block; /app/settings, its own backAction target, did
// not. `headers` matters too: boundary.headers forwards the reauthorize
// headers App Bridge is waiting for.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
