// Parallel landing — editorial system mirrored from parallel.in.ink.
// Brutalist paper + ink. Archivo Black display for the masthead spine,
// Geist sans for chrome and body, JetBrains Mono for micro-labels.
// Hairline dividers, no rounded cards, no scroll-zoom drama.

import { Link } from "react-router";

interface LandingPageContentProps {
  ctaLink?: string;
  signInLink?: string;
  showSignIn?: boolean;
}

const FONT_BODY = "'Geist', 'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const FONT_DISPLAY = "'Archivo Black', 'Space Grotesk', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

const display = "uppercase tracking-[-0.028em] leading-[0.92] text-black";
const eyebrow = "uppercase tracking-[0.22em] text-[11px] font-semibold text-neutral-500";
const mono = "uppercase tracking-[0.18em]";

const sectionBorder = "border-b border-black/10";
const colBorder = "border-black/10";
const containerX = "px-5 sm:px-9";
const containerWidth = "max-w-[1280px] mx-auto";

export const LandingPageContent = ({
  ctaLink = "/app",
  signInLink = "/app",
  showSignIn = true,
}: LandingPageContentProps) => {
  const sec04 = [
    {
      num: "01",
      title: "A receipt that's alive.",
      desc:
        "NFC sticker on the box. Customer taps. The receipt opens on their phone, branded to your store. No app. No login. No download.",
    },
    {
      num: "02",
      title: "Proof before anything ships.",
      desc:
        "Pre-shipment photos tie what you packed to the sticker's unique ID. A tamper-evident, timestamped record. Created at the warehouse, not reconstructed after a dispute.",
    },
    {
      num: "03",
      title: "One merchant view.",
      desc:
        "Enrollment status. Tap rates. Time to engagement. Sticker inventory with auto-refill. One dashboard.",
    },
  ];

  const sec05 = [
    {
      status: "Available now",
      title: "Photo.",
      desc:
        "Photograph each item. Apply the sticker. Ship. Maximum documentation for high-value orders.",
    },
    {
      status: "Coming soon",
      title: "High speed.",
      desc:
        "Scan the order. Scan the sticker. Ship. Two beeps. For volume operations where speed matters.",
    },
  ];

  const pricing = [
    { val: "$0.99", label: "per enrollment" },
    { val: "$2.99", label: "per verified tap" },
    { val: "$0.80", label: "per sticker" },
  ];

  const verticals = [
    { title: "Luxury · Beauty · Jewelry", desc: "High-value items that deserve documentation before they ship." },
    { title: "Electronics · Collectibles", desc: "Categories where disputes are costly and proof changes outcomes." },
    { title: "High-AOV DTC", desc: "Anything worth documenting before it ships." },
  ];

  const sec08 = [
    {
      num: "01",
      title: "One tap to open the receipt.",
      desc:
        "Phone touches sticker. The receipt opens on the customer's phone, full screen, your brand. No app. No login. One tap and they close the phone and go about their day.",
    },
    {
      num: "02",
      title: "Refund at scan.",
      desc:
        "Tappers get the express tier. The refund clears at the moment of return scan, not after a multi-day inspection cycle.",
    },
    {
      num: "03",
      title: "Returns from the receipt.",
      desc:
        "Two ways. At your store, show the passport at the counter and refund at scan. Live today. At any carrier, GPS detects the drop-off and generates a scannable QR. Rolling out with the next ink. update.",
    },
    {
      num: "04",
      title: "Return Passport at retail.",
      badge: "Coming soon",
      desc:
        "Walk into a retail partner instead of your own store. GPS detects the location. A Return Passport generates on the customer's phone. No ID, no receipt search, instant verification at the counter.",
    },
  ];

  return (
    <div
      className="min-h-screen bg-white text-black antialiased"
      style={{ fontFamily: FONT_BODY }}
    >
      {/* ───── Header ───── */}
      <header className={`${sectionBorder} bg-white`}>
        <div className={`${containerWidth} ${containerX} flex items-center justify-between py-5`}>
          <Link
            to="/"
            className="text-[13px] font-semibold uppercase tracking-[0.18em] hover:opacity-70 transition-opacity"
          >
            Parallel
          </Link>
          {showSignIn && (
            <Link
              to={signInLink}
              className={`${eyebrow} hover:text-black transition-colors`}
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* ───── Masthead — No 01 ───── */}
      <section className={`${sectionBorder} ${containerX} pt-12 sm:pt-20 pb-12 sm:pb-20`}>
        <div className={containerWidth}>
          <div className={`${eyebrow} pb-4 sm:pb-6`}>No 01 · Live receipt</div>
          <h1
            className={`m-0 ${display} text-[40px] sm:text-[clamp(56px,7.5vw,108px)]`}
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
          >
            Every order ships with a live receipt.
          </h1>
          <p className="max-w-[54ch] pt-8 text-[14px] sm:text-[15px] leading-[1.6] text-neutral-700">
            The live receipt for every Shopify order. Branded post-purchase, proof of delivery,
            Amazon-style returns. Built on ink.
          </p>
          <div className="pt-10">
            <Link
              to={ctaLink}
              className={`inline-flex items-center gap-2 bg-black text-white px-5 py-3 text-[11px] font-semibold ${mono} hover:bg-neutral-800 transition-colors`}
              style={{ fontFamily: FONT_BODY }}
            >
              Get started
              <span aria-hidden style={{ fontFamily: FONT_MONO }}>↗</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ───── No 02 — The Receipt You Already Send ───── */}
      <section className={`${sectionBorder} ${containerX} py-16 sm:py-24`}>
        <div className={`${containerWidth} grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-x-10 gap-y-8`}>
          <div>
            <div className={`${eyebrow} pb-4`}>No 02 · The receipt you already send</div>
            <h2
              className={`m-0 ${display} text-[28px] sm:text-[clamp(36px,4.4vw,56px)]`}
              style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
            >
              Parallel upgrades the receipt. Nothing else has to change.
            </h2>
          </div>
          <div className="max-w-[60ch]">
            <p className="text-[14px] sm:text-[15px] leading-[1.7] text-neutral-700">
              The warehouse stays. The carrier stays. Shopify stays. You install one app and the
              receipt becomes a branded page that taps open, runs returns, and proves delivery.
              Live in days.
            </p>
          </div>
        </div>
      </section>

      {/* ───── No 03 — Two sides of the same receipt ───── */}
      <section className={sectionBorder}>
        <div className={`${containerWidth} ${containerX} pt-16 sm:pt-24 pb-10`}>
          <div className={`${eyebrow} pb-4`}>No 03 · Two sides of the same receipt</div>
          <h2
            className={`m-0 ${display} text-[28px] sm:text-[clamp(36px,4.4vw,56px)] max-w-[20ch]`}
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
          >
            Your customer opens it. You see the truth.
          </h2>
        </div>
        <div className={`${containerWidth} grid grid-cols-1 sm:grid-cols-2 border-t ${colBorder}`}>
          <div className={`${containerX} py-12 sm:py-16 sm:border-r ${colBorder}`}>
            <div
              className={`${mono} text-[11px] text-neutral-500 pb-4`}
              style={{ fontFamily: FONT_MONO }}
            >
              Customer side
            </div>
            <h3
              className={`m-0 ${display} text-[22px] sm:text-[28px] pb-5`}
              style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
            >
              A receipt that opens.
            </h3>
            <p className="text-[14px] leading-[1.65] text-neutral-700 max-w-[44ch]">
              Phone touches sticker. Your logo, your colors, your message. Full screen. No app. No
              login. One tap and they close their phone and go about their day.
            </p>
          </div>
          <div className={`${containerX} py-12 sm:py-16 border-t sm:border-t-0 ${colBorder}`}>
            <div
              className={`${mono} text-[11px] text-neutral-500 pb-4`}
              style={{ fontFamily: FONT_MONO }}
            >
              Merchant side
            </div>
            <h3
              className={`m-0 ${display} text-[22px] sm:text-[28px] pb-5`}
              style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
            >
              Proof on every delivery.
            </h3>
            <p className="text-[14px] leading-[1.65] text-neutral-700 max-w-[44ch]">
              On screen: their order is confirmed. In the background, the tap records GPS, time,
              and device. Your customer sees a premium experience. You see a verified record.
            </p>
          </div>
        </div>
      </section>

      {/* ───── No 04 — What Parallel does ───── */}
      <section className={sectionBorder}>
        <div className={`${containerWidth} ${containerX} pt-16 sm:pt-24 pb-10`}>
          <div className={`${eyebrow} pb-4`}>No 04 · What Parallel does</div>
          <h2
            className={`m-0 ${display} text-[28px] sm:text-[clamp(36px,4.4vw,56px)] max-w-[22ch]`}
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
          >
            Branded receipt. Proof of delivery. Amazon-style returns.
          </h2>
        </div>
        <div className={`${containerWidth} grid grid-cols-1 sm:grid-cols-3 border-t ${colBorder}`}>
          {sec04.map((step, i) => (
            <div
              key={step.num}
              className={`${containerX} py-12 sm:py-16 ${
                i < sec04.length - 1 ? `sm:border-r ${colBorder} border-b sm:border-b-0` : ""
              }`}
            >
              <div
                className={`${mono} text-[12px] text-neutral-500 pb-4`}
                style={{ fontFamily: FONT_MONO }}
              >
                {step.num}
              </div>
              <h3
                className={`m-0 ${display} text-[20px] sm:text-[24px] pb-4`}
                style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
              >
                {step.title}
              </h3>
              <p className="text-[14px] leading-[1.65] text-neutral-700">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───── No 05 — Enrollment ───── */}
      <section className={sectionBorder}>
        <div className={`${containerWidth} ${containerX} pt-16 sm:pt-24 pb-10`}>
          <div className={`${eyebrow} pb-4`}>No 05 · How you enroll</div>
          <h2
            className={`m-0 ${display} text-[28px] sm:text-[clamp(36px,4.4vw,56px)]`}
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
          >
            Two methods. Both simple.
          </h2>
        </div>
        <div className={`${containerWidth} grid grid-cols-1 sm:grid-cols-2 border-t ${colBorder}`}>
          {sec05.map((m, i) => (
            <div
              key={m.title}
              className={`${containerX} py-12 sm:py-16 ${
                i === 0 ? `sm:border-r ${colBorder} border-b sm:border-b-0` : ""
              }`}
            >
              <div
                className={`${mono} text-[11px] text-neutral-500 pb-4`}
                style={{ fontFamily: FONT_MONO }}
              >
                {m.status}
              </div>
              <h3
                className={`m-0 ${display} text-[24px] sm:text-[30px] pb-5`}
                style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
              >
                {m.title}
              </h3>
              <p className="text-[14px] leading-[1.65] text-neutral-700 max-w-[42ch]">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ───── No 06 — Pricing ───── */}
      <section className={`${sectionBorder} bg-[#fafafa]`}>
        <div className={`${containerWidth} ${containerX} pt-16 sm:pt-24 pb-16 sm:pb-24`}>
          <div className={`${eyebrow} pb-4`}>No 06 · Pricing</div>
          <h2
            className={`m-0 ${display} text-[28px] sm:text-[clamp(36px,4.4vw,56px)] pb-10`}
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
          >
            No monthly fee. No tiers. Pay per package.
          </h2>
          <div className={`grid grid-cols-1 sm:grid-cols-3 pt-8 border-t ${colBorder}`}>
            {pricing.map((p, i) => (
              <div
                key={p.val}
                className={`pt-8 sm:pt-10 pb-2 ${
                  i < pricing.length - 1 ? `sm:border-r sm:pr-8 ${colBorder}` : ""
                } ${i > 0 ? "sm:pl-8" : ""}`}
              >
                <div
                  className={`text-[48px] sm:text-[64px] tabular-nums ${display}`}
                  style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
                >
                  {p.val}
                </div>
                <div
                  className={`${mono} text-[11px] text-neutral-500 pt-2`}
                  style={{ fontFamily: FONT_MONO }}
                >
                  {p.label}
                </div>
              </div>
            ))}
          </div>
          <div className={`grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-6 pt-16`}>
            {verticals.map((v) => (
              <div key={v.title}>
                <div
                  className="text-[13px] font-semibold text-black pb-2"
                  style={{ fontFamily: FONT_BODY }}
                >
                  {v.title}
                </div>
                <p className="text-[13px] leading-[1.65] text-neutral-600 max-w-[34ch]">{v.desc}</p>
              </div>
            ))}
          </div>
          <div className="pt-12">
            <Link
              to={ctaLink}
              className={`inline-flex items-center gap-2 bg-black text-white px-5 py-3 text-[11px] font-semibold ${mono} hover:bg-neutral-800 transition-colors`}
              style={{ fontFamily: FONT_BODY }}
            >
              Get started
              <span aria-hidden style={{ fontFamily: FONT_MONO }}>↗</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ───── No 07 — The hero refrain ───── */}
      <section className={`${sectionBorder} ${containerX} py-28 sm:py-44 text-center`}>
        <div className={containerWidth}>
          <div className={`${eyebrow} pb-6`}>No 07</div>
          <h2
            className={`m-0 ${display} text-[44px] sm:text-[clamp(72px,10vw,148px)]`}
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
          >
            Every receipt, alive.
          </h2>
          <p
            className={`pt-8 text-[12px] sm:text-[13px] ${mono} text-neutral-500`}
            style={{ fontFamily: FONT_MONO }}
          >
            Parallel · Built on ink.
          </p>
        </div>
      </section>

      {/* ───── No 08 — From opening to refund ───── */}
      <section className={sectionBorder}>
        <div className={`${containerWidth} ${containerX} pt-16 sm:pt-24 pb-10`}>
          <div className={`${eyebrow} pb-4`}>No 08 · The receipt does the work</div>
          <h2
            className={`m-0 ${display} text-[28px] sm:text-[clamp(36px,4.4vw,56px)] max-w-[20ch]`}
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
          >
            From opening to refund. One surface.
          </h2>
        </div>
        <div className={`${containerWidth} grid grid-cols-1 sm:grid-cols-2 border-t ${colBorder}`}>
          {sec08.map((card, i) => {
            const isRight = i % 2 === 1;
            const isLastRow = i >= 2;
            return (
              <div
                key={card.num}
                className={`${containerX} py-12 sm:py-16 ${
                  !isRight ? `sm:border-r ${colBorder}` : ""
                } ${!isLastRow ? `border-b ${colBorder}` : ""}`}
              >
                <div
                  className={`${mono} text-[12px] text-neutral-500 pb-4 flex items-center gap-3`}
                  style={{ fontFamily: FONT_MONO }}
                >
                  <span>{card.num}</span>
                  {card.badge && (
                    <span className="border border-black/20 px-2 py-0.5 text-[10px] tracking-[0.22em]">
                      {card.badge}
                    </span>
                  )}
                </div>
                <h3
                  className={`m-0 ${display} text-[22px] sm:text-[28px] pb-5 max-w-[22ch]`}
                  style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
                >
                  {card.title}
                </h3>
                <p className="text-[14px] leading-[1.65] text-neutral-700 max-w-[44ch]">
                  {card.desc}
                </p>
              </div>
            );
          })}
        </div>
        <div
          className={`${containerWidth} ${containerX} py-10 text-[12px] leading-[1.65] text-neutral-500 max-w-[64ch] text-center mx-auto`}
        >
          Customers who never tap go through your standard return process. Single-carrier label,
          standard return window. The tap is the unlock.
        </div>
      </section>

      {/* ───── Footer ───── */}
      <footer className="bg-white">
        <div
          className={`${containerWidth} ${containerX} py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4`}
        >
          <div
            className={`${mono} text-[11px] text-neutral-500`}
            style={{ fontFamily: FONT_MONO }}
          >
            © 2026 Parallel · Built on ink.
          </div>
          <div
            className={`flex items-center gap-6 text-[11px] ${mono} text-neutral-500`}
            style={{ fontFamily: FONT_MONO }}
          >
            <Link to="/app/help" className="hover:text-black transition-colors">
              Support
            </Link>
            <a href="#" className="hover:text-black transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-black transition-colors">
              Terms
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
