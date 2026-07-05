import type { OnboardingStatus } from "../routes/app.api.onboarding.status";

// The "wow": a mini render of the merchant's OWN page — their logo, hero
// image, and brand colors, pulled live from the brand book. Not a mockup,
// not stock — what their buyer sees. Shown in onboarding so, seconds after
// install, the merchant recognizes their brand already living on a page.

const BrandPreviewCard = ({
  brand,
  previewUrl,
  built,
}: {
  brand: OnboardingStatus["brand"];
  previewUrl: string;
  built: boolean;
}) => {
  const ink = brand?.ink || "#111111";
  const paper = brand?.paper || "#FAF8F4";

  return (
    <div className="rounded-md border border-border overflow-hidden bg-card">
      {/* The phone-ish page preview */}
      <div
        className="relative aspect-[4/5] w-full flex flex-col"
        style={{ backgroundColor: paper }}
      >
        {/* Brand band */}
        <div
          className="px-4 py-3 flex items-center justify-center"
          style={{ backgroundColor: "#ffffff", borderBottom: `1px solid ${ink}14` }}
        >
          {brand?.logoUrl ? (
            <img
              src={brand.logoUrl}
              alt={brand?.name || "Your brand"}
              className="max-h-6 max-w-[60%] object-contain"
            />
          ) : (
            <span
              className="text-sm font-semibold tracking-tight"
              style={{ color: ink }}
            >
              {brand?.name || "Your brand"}
            </span>
          )}
        </div>

        {/* Hero */}
        <div className="flex-1 relative overflow-hidden">
          {brand?.heroUrl ? (
            <img
              src={brand.heroUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: ink }}
            >
              <span className="text-xs" style={{ color: paper }}>
                {built ? "Your page" : "Your page — building"}
              </span>
            </div>
          )}
        </div>

        {/* Faux tracking strip + CTA, in-brand */}
        <div className="px-4 py-3 space-y-2" style={{ backgroundColor: paper }}>
          <div className="flex items-center gap-1.5">
            {["Ordered", "Shipped", "Delivered"].map((s, i) => (
              <div key={s} className="flex-1">
                <div
                  className="h-1 rounded-full"
                  style={{ backgroundColor: i <= 1 ? ink : `${ink}22` }}
                />
                <span
                  className="mt-1 block text-[9px]"
                  style={{ color: `${ink}99` }}
                >
                  {s}
                </span>
              </div>
            ))}
          </div>
          <div
            className="rounded-sm py-1.5 text-center text-[11px] font-medium"
            style={{ backgroundColor: ink, color: paper }}
          >
            Track your order
          </div>
        </div>
      </div>

      {/* Footer link to the real page */}
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground border-t border-border transition-colors"
      >
        {previewUrl.replace("https://", "")} ↗
      </a>
    </div>
  );
};

export default BrandPreviewCard;
