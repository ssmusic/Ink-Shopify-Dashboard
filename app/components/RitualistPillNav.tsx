// THE RITUALIST'S PILLS — its five pages, in the bar ink's pages wear
// (PillNav), under each page's title. The same five, in the same order, are
// the admin's left nav (routes/app.tsx NavMenu).

import { useLocation } from "react-router";
import PillNav, { type Pill } from "./PillNav";

export const RITUALIST_PILLS: readonly Pill[] = [
  { id: "dashboard", label: "Dashboard", to: "/app/dashboard" },
  // One name for both apps (Sam, 2026-09-24): "Orders". The path stays, so no
  // link or bookmark breaks.
  { id: "orders", label: "Orders", to: "/app/tagged-shipments" },
  { id: "settings", label: "Settings", to: "/app/settings" },
  { id: "billing", label: "Billing", to: "/app/billing" },
  { id: "help", label: "Help", to: "/app/help" },
];

/** Which pill a path lights: an order's own view is still Orders, and every
 *  Settings tab is Settings. */
export function ritualistPillFor(pathname: string): string | null {
  if (pathname.startsWith("/app/tagged-shipments") || pathname.startsWith("/app/orders")) return "orders";
  if (pathname.startsWith("/app/settings")) return "settings";
  if (pathname.startsWith("/app/billing")) return "billing";
  if (pathname.startsWith("/app/help")) return "help";
  if (pathname.startsWith("/app/dashboard")) return "dashboard";
  return null;
}

export default function RitualistPillNav() {
  const { pathname } = useLocation();
  return <PillNav pills={RITUALIST_PILLS} active={ritualistPillFor(pathname)} label="The Ritualist" />;
}
