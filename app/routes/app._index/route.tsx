// In-admin landing — the screen a merchant sees the first time they
// open the app inside Shopify. Stripped to a single door: brand,
// one-line orientation, big "Open dashboard" CTA. The full public
// marketing landing lives at the public route (_index); this one
// just gets them to work.

import { type LoaderFunctionArgs, Link } from "react-router";
import { authenticate } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const FONT_BODY = "'Geist', 'Space Grotesk', ui-sans-serif, system-ui, sans-serif";
const FONT_DISPLAY = "'Archivo Black', 'Space Grotesk', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

export default function LandingPage() {
  return (
    <div
      className="min-h-[calc(100vh-120px)] bg-white text-black flex items-center justify-center px-5 sm:px-9 py-16"
      style={{ fontFamily: FONT_BODY }}
    >
      <div className="w-full max-w-[720px] text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500 pb-6">
          Parallel
        </div>
        <h1
          className="m-0 uppercase tracking-[-0.028em] leading-[0.92] text-black text-[40px] sm:text-[clamp(48px,6vw,80px)]"
          style={{ fontFamily: FONT_DISPLAY, fontWeight: 400 }}
        >
          Your dashboard is ready.
        </h1>
        <p className="pt-6 text-[14px] sm:text-[15px] leading-[1.65] text-neutral-700 max-w-[48ch] mx-auto">
          The live receipt for every Shopify order. Branded post-purchase,
          carrier-agnostic returns, built on ink.
        </p>
        <div className="pt-10">
          <Link
            to="/app/dashboard"
            className="inline-flex items-center gap-3 bg-black text-white px-6 py-4 text-[12px] font-semibold uppercase tracking-[0.22em] hover:bg-neutral-800 transition-colors"
            style={{ fontFamily: FONT_BODY }}
          >
            Open dashboard
            <span aria-hidden style={{ fontFamily: FONT_MONO }}>↗</span>
          </Link>
        </div>
        <div
          className="pt-12 text-[10px] uppercase tracking-[0.22em] text-neutral-400"
          style={{ fontFamily: FONT_MONO }}
        >
          New here? Open the dashboard to set up your brand and order your first stickers.
        </div>
      </div>
    </div>
  );
}
