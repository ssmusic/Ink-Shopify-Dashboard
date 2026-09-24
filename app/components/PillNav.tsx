// THE PILL BAR, drawn from a list of pills — the look of ink's top nav
// (InkPillNav), for any app screen that wears it.
//
// Sam, 2026-09-24, holding The Ritualist up against ink: "make the site
// identical to this width and nav look on top bar and left side representing
// all pages". This is InkPillNav's bar exactly: a rounded hairline track, the
// active pill ink-dark with paper text and a soft shadow, the others
// mist-grey; on a phone the pills tighten, and a narrower screen scrolls the
// track sideways, never wraps it. Navigation is React Router's Link, so moving
// between pills keeps App Bridge's session.
//
// InkPillNav keeps its own copy of these styles; the contract
// (app/contracts/ritualist-frame-and-nav.test.tsx) renders both bars from
// ink's pills and pins them to the same markup, so they cannot drift apart.

import { Link } from "react-router";

export type Pill = { id: string; label: string; to: string };

const PILL_CSS = ".ink-pill{padding:6px 20px}@media (max-width:480px){.ink-pill{padding:6px 11px}}";

const INK = "#0e1116";
const INK_2 = "#2a2d33";
const MIST = "#6d7175";

export default function PillNav({
  pills,
  active,
  label,
}: {
  pills: readonly Pill[];
  active: string | null;
  label: string;
}) {
  return (
    <nav aria-label={label} style={{ display: "flex", justifyContent: "center" }}>
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
        {pills.map((p) => {
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
