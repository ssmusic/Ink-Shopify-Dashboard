// INK'S PILL NAV — Orders · Insights · Settings, at the top of every ink screen.
//
// Sam, 2026-09-23: "yeah we need a pill nav in the app". The look is the
// dashboard's own segmented pills (the-ritualist src/components/ViewSwitcher.tsx:
// a rounded-full hairline track, the active pill ink-dark with paper text and
// a soft shadow, the others mist-grey) drawn with inline styles, since the
// embed's Tailwind has none of the site's tokens. Navigation is React
// Router's Link, so moving between pills keeps App Bridge's session — never a
// full page load.
//
// Labels are PLACEHOLDER copy — Sam's words replace them.

import { Link } from "react-router";

export type InkSection = "orders" | "insights" | "settings";

const PILLS: { id: InkSection; label: string; to: string }[] = [
  { id: "orders", label: "Orders", to: "/app/ink" },
  { id: "insights", label: "Insights", to: "/app/ink?view=insights" },
  { id: "settings", label: "Settings", to: "/app/ink/settings" },
];

const INK = "#0e1116";
const INK_2 = "#2a2d33";
const MIST = "#6d7175";

export default function InkPillNav({ active }: { active: InkSection }) {
  return (
    <nav aria-label="ink.">
      <div
        role="tablist"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px",
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
              to={p.to}
              role="tab"
              aria-selected={on}
              aria-current={on ? "page" : undefined}
              data-pill={p.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6px 20px",
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
