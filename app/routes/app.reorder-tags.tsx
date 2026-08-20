import { boundary } from "@shopify/shopify-app-react-router/server";
import { redirect, type LoaderFunctionArgs, useRouteError, type HeadersFunction } from "react-router";
import { authenticate } from "../shopify.server";
import { FEATURE_NFC } from "../flags";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  // NFC hardware lane tabled (app/flags.ts) — page returns when the flag does.
  if (!FEATURE_NFC) return redirect("/app/dashboard");
  return null;
};

export default function ReorderTags() {
  return (
    <div style={{ padding: "32px 24px", maxWidth: "900px", margin: "0 auto" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "2.25rem",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          marginBottom: "8px",
        }}>
          Reorder Tags
        </h1>
        <p style={{ color: "#666", fontSize: "15px" }}>
          Purchase additional NFC tags for your shipments
        </p>
      </div>

      <div style={{
        backgroundColor: "#fff",
        border: "1px solid #e5e5e5",
        padding: "64px 32px",
        textAlign: "center",
      }}>
        <div style={{
          width: 64,
          height: 64,
          backgroundColor: "#000",
          margin: "0 auto 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: "24px",
        }}>
          🏷️
        </div>
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "1.5rem",
          fontWeight: 500,
          marginBottom: "12px",
        }}>
          Tag Ordering Coming Soon
        </h2>
        <p style={{ color: "#999", maxWidth: "400px", margin: "0 auto", lineHeight: 1.6 }}>
          You'll be able to order additional NFC tags directly from this page. Contact support if you need tags now.
        </p>
      </div>
    </div>
  );
}

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
