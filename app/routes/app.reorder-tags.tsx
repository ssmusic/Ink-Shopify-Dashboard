import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
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
