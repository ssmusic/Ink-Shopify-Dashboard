// THE DOOR TO IN.INK — and it looks like in.ink, not like Shopify. Sam,
// 2026-09-03: "the big link to in.ink needs to look like my website."
//
// Every value here is measured from the live site's stylesheet, not remembered:
//   type   Geist (body/wordmark) · Archivo Black (display) · JetBrains Mono
//   ink    #0a0a0a  · mist #6a6a6a · hairline #e5e5e5 · ground #f4f4f4
//   pill   black, border-radius 9999px, white 14px label
// The words are the surfaces this replaced: the studio sentence and the
// sign-in footnote are the old dashboard card's; the label is Sam's.

const FONT_BODY = "'Geist', 'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

const RitualistDoor = ({
  shopDomain,
  onOpen,
  opening,
}: {
  shopDomain: string;
  onOpen: () => void;
  opening: boolean;
}) => (
  <section
    aria-label="Open the Ritualist"
    style={{
      background: "#f4f4f4",
      border: "1px solid #e5e5e5",
      borderRadius: 16,
      padding: "36px 40px 34px",
      color: "#0a0a0a",
      fontFamily: FONT_BODY,
    }}
  >
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
      <span style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em", lineHeight: 1 }}>the ritualist.</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#6a6a6a" }}>
        {shopDomain}
      </span>
    </div>

    <p
      style={{
        margin: "30px 0 0",
        maxWidth: 620,
        fontSize: 28,
        fontWeight: 500,
        lineHeight: 1.12,
        letterSpacing: "-0.022em",
      }}
    >
      Open the Ritualist studio — where your enrolled orders, pages, and returns live.
    </p>

    <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={onOpen}
        disabled={opening}
        style={{
          appearance: "none",
          border: 0,
          cursor: opening ? "progress" : "pointer",
          background: "#0a0a0a",
          color: "#ffffff",
          borderRadius: 9999,
          padding: "13px 24px",
          fontFamily: FONT_BODY,
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: "-0.005em",
          lineHeight: 1,
          opacity: opening ? 0.7 : 1,
        }}
      >
        {opening ? "Opening…" : "Open the Ritualist"}
      </button>
      <span style={{ fontSize: 13, color: "#6a6a6a" }}>
        You’ll be signed in automatically — no password needed.
      </span>
    </div>
  </section>
);

export default RitualistDoor;
