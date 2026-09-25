import { isInk } from "./services/app-flavor.server";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteError, useRouteLoaderData } from "react-router";
import premiumStyles from "./styles/premium.css?url";
import globalStyles from "./styles/globals.css?url";

export const loader = () => ({ ink: isInk() });

export default function App() {
  const ink = (useRouteLoaderData("root") as { ink?: boolean } | undefined)?.ink === true;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        {!ink && <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600&family=Playfair+Display:wght@300;400;500;600&display=swap" rel="stylesheet" />
        </>}
        <Meta />
        {!ink && <><link rel="stylesheet" href={globalStyles} /><link rel="stylesheet" href={premiumStyles} /></>}
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) && error.status === 404
    ? "This page isn't available."
    : "The app couldn't load this page. Refresh to try again.";
  return (
    <html lang="en">
      <head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>App unavailable</title></head>
      <body>
        <main role="alert" style={{ maxWidth: 560, margin: "10vh auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <h1>Page unavailable</h1>
          <p>{message}</p>
          <button type="button" onClick={() => window.location.reload()}>Refresh</button>
        </main>
        <Scripts />
      </body>
    </html>
  );
}
