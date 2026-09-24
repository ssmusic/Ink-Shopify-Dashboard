// INK'S PILL NAV — Dashboard · Orders · Records · Settings · Help, centred at
// the top of every ink screen.
//
// Sam, 2026-09-24, with a screenshot of the black pill bar ink had before
// Codex's screens: "i remember enjoying your nav over the codex one". The look
// is that bar's again — the dashboard's own segmented pills (the-ritualist
// src/components/ViewSwitcher.tsx: a rounded hairline track, the active pill
// ink-dark with paper text and a soft shadow, the others mist-grey), drawn with
// inline styles since the embed has none of the site's tokens — carrying
// Codex's five destinations in Codex's order (Sam: "dashboard should be first
// in the nav" · "dont we need a help section?"). On a phone the pills tighten
// to fit; a narrower screen scrolls the track sideways, never wraps it.
// Navigation is React Router's Link, so moving between pills keeps App
// Bridge's session — never a full page load.
//
// Labels are PLACEHOLDER copy — Sam's words replace them.

import { Link } from "react-router";

export type InkSection = "orders" | "insights" | "records" | "settings" | "help";

const PILLS: { id: InkSection; label: string; to: string }[] = [
  { id: "insights", label: "Dashboard", to: "/app/ink?view=insights" },
  { id: "orders", label: "Orders", to: "/app/ink" },
  { id: "records", label: "Records", to: "/app/ink?view=records" },
  { id: "settings", label: "Settings", to: "/app/ink/settings" },
  { id: "help", label: "Help", to: "/app/ink?view=help" },
];

const PILL_CSS = ".ink-pill{padding:6px 20px}@media (max-width:480px){.ink-pill{padding:6px 11px}}";

const INK = "#0e1116";
const INK_2 = "#2a2d33";
const MIST = "#6d7175";

export default function InkPillNav({ active }: { active: InkSection }) {
  return (
    <nav aria-label="ink." style={{ display: "flex", justifyContent: "center" }}>
      {/* The pills' padding, tighter on a phone so all five fit. No quotes in
          this rule: a quoted value inside a server-rendered <style> is escaped
          and the rule dropped. */}
      <style>{PILL_CSS}</style>
      <div
        role="tablist"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px",
          maxWidth: "100%",
          overflowX: "auto",
          scrollbarWidth: "none",
          borderRadius: "9999px",
          border: "1px solid rgba(14, 17, 22, 0.12)",
          background: "#ffffff",
        }}
      >
        {PILLS.map((p) => {
          const on = p.id === active;
          return (
            <Link
              key={p.id}
              className="ink-pill"
              to={p.to}
              role="tab"
              aria-selected={on}
              aria-current={on ? "page" : undefined}
              data-pill={p.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                whiteSpace: "nowrap",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.02em",
                textDecoration: "none",
                transition: "all 0.3s",
                color: on ? "#f7f6f2" : MIST,
                background: on ? `linear-gradient(to bottom, ${INK}, ${INK_2})` : "transparent",
                boxShadow: on ? "0 8px 24px -6px rgba(14,17,22,0.45), 0 2px 6px -2px rgba(14,17,22,0.3)" : "none",
              }}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
