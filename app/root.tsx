import { Links, Meta, Outlet, Scripts, ScrollRestoration, useNavigation } from "react-router";
import type { LinksFunction } from "react-router";
import premiumStyles from "./styles/premium.css?url";
import globalStyles from "./styles/globals.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: globalStyles },
  { rel: "stylesheet", href: premiumStyles },
];

// Shown while App Bridge / the loader is still initializing
function GlobalLoadingScreen() {
  return (
    <div
      id="ink-global-loader"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffffff",
        zIndex: 99999,
      }}
    >
      {/* Brand mark */}
      <div style={{
        width: 52,
        height: 52,
        borderRadius: 12,
        background: "linear-gradient(135deg, #111827 0%, #374151 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      }}>
        <span style={{ color: "#fff", fontSize: 22, fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>
          INK
        </span>
      </div>

      {/* Spinner */}
      <div style={{
        width: 32,
        height: 32,
        border: "3px solid #e5e7eb",
        borderTop: "3px solid #111827",
        borderRadius: "50%",
        animation: "ink-spin 0.8s linear infinite",
      }} />

      <style>{`
        @keyframes ink-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function App() {
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600&family=Playfair+Display:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
        <Meta />
        <Links />
      </head>
      <body>
        {/* Show spinner during route transitions and on cold first-load */}
        {isLoading && <GlobalLoadingScreen />}
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
