// ink. landing — one screen, one door.
// Brand top-left, optional sign-in top-right, big Archivo Black
// headline centered, short Geist deck, single black enter button.
// Used by both the public landing (_index) and the in-admin landing
// (app/_index). Routes vary the props; the surface stays minimal.

import { Link } from "react-router";

interface LandingPageContentProps {
  ctaLink?: string;
  ctaLabel?: string;
  signInLink?: string;
  showSignIn?: boolean;
  headline?: string;
  sub?: string;
  footnote?: string;
}

const FONT_BODY = "'Geist', 'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const FONT_DISPLAY = "'Archivo Black', 'Space Grotesk', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

export const LandingPageContent = ({
  ctaLink = "/app",
  ctaLabel = "Get started",
  signInLink = "/app",
  showSignIn = true,
  headline = "A surface that opens when the order arrives.",
  sub = "You communicate in ink. You sign in ink. Now you do both on every order — the loud half is the brand; the quiet half is the signature that closes the loop with the buyer.",
  footnote,
}: LandingPageContentProps) => {
  return (
    <div
      className="min-h-screen bg-white text-black antialiased flex flex-col"
      style={{ fontFamily: FONT_BODY }}
    >
      {/* Header */}
      <header className="border-b border-black/10 bg-white">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-9 flex items-center justify-between py-5">
          <Link
            to="/"
            className="text-[13px] font-semibold uppercase tracking-[0.18em] hover:opacity-70 transition-opacity"
          >
            ink.
          </Link>
          {showSignIn && (
            <Link
              to={signInLink}
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500 hover:text-black transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Center stage — the door */}
      <main className="flex-1 flex items-center justify-center px-5 sm:px-9 py-16">
        <div className="w-full max-w-[820px] text-center">
          <h1
            className="m-0 uppercase tracking-[-0.028em] leading-[0.92] text-black text-[44px] sm:text-[clamp(56px,7vw,104px)]"
            style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
          >
            {headline}
          </h1>
          <p className="pt-7 text-[14px] sm:text-[15px] leading-[1.6] text-neutral-700 max-w-[52ch] mx-auto">
            {sub}
          </p>
          <div className="pt-10">
            <Link
              to={ctaLink}
              className="inline-flex items-center gap-3 bg-black text-white px-7 py-4 text-[12px] font-semibold uppercase tracking-[0.22em] hover:bg-neutral-800 transition-colors"
              style={{ fontFamily: FONT_BODY }}
            >
              {ctaLabel}
              <span aria-hidden style={{ fontFamily: FONT_MONO }}>↗</span>
            </Link>
          </div>
          {footnote && (
            <div
              className="pt-12 text-[10px] uppercase tracking-[0.22em] text-neutral-400 max-w-[54ch] mx-auto"
              style={{ fontFamily: FONT_MONO }}
            >
              {footnote}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-black/10">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-9 py-6 flex items-center justify-between">
          <div
            className="text-[10px] uppercase tracking-[0.22em] text-neutral-400"
            style={{ fontFamily: FONT_MONO }}
          >
            © 2026 ink.
          </div>
        </div>
      </footer>
    </div>
  );
};
