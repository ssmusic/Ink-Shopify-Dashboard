// THE RITUALIST'S PILLS — its five pages, in the bar ink's pages wear
// (PillNav), under each page's title. The same five, in the same order, are
// the admin's left nav (routes/app.tsx NavMenu).

import { useLocation } from "react-router";
import PillNav, { type Pill } from "./PillNav";
import StudioLink from "./StudioLink";

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
  // The studio's wordmark at the LEFT of the line, under Shopify's own app
  // logo (which an app cannot make a link), the pills centred, nothing at the
  // right (Sam, 2026-09-25: "make the logo on the top left the link ... and
  // lose the one on the top right"). components/StudioLink.tsx.
  return (
    <div className="rt-pillbar">
      {/* A phone stacks the wordmark over the pills: one line does not fit. */}
      <style>{`.rt-pillbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px}.rt-pillbar>.rt-studio{justify-self:start}@media (max-width:640px){.rt-pillbar{grid-template-columns:minmax(0,1fr)}.rt-pillbar>.rt-studio{justify-self:center}.rt-pillbar>.rt-spacer{display:none}.rt-pillbar>*{min-width:0;max-width:100%}}`}</style>
      <span className="rt-studio">
        <StudioLink />
      </span>
      <PillNav pills={RITUALIST_PILLS} active={ritualistPillFor(pathname)} label="The Ritualist" />
      <span className="rt-spacer" />
    </div>
  );
}
