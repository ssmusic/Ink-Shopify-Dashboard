import { Outlet } from "react-router";
import { useRouteError } from "react-router";
import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

/**
 * Layout wrapper for all /app/tagged-shipments/* routes.
 * The actual content lives in:
 *   _index.tsx  → /app/tagged-shipments  (list)
 *   $orderId.tsx → /app/tagged-shipments/:id (detail)
 */
export default function TaggedShipmentsLayout() {
  return <Outlet />;
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
