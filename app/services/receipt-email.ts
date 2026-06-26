// The EMAIL painter + a SERVER-SAFE assembler.
//
// COPIED VERBATIM from parallelreturns src/lib/email/receipt-email.ts so the
// SendGrid send rail in the Shopify app can paint the SAME branded receipt the
// tap page is built from. The ONLY change vs. the source is the two type-only
// imports (BrandBook / Proof) → local `any` so this compiles standalone, plus
// the added `fetchBrandBook` helper at the bottom. Do NOT change painter logic.
//
// The receipt email is EMITTED from the SAME source the tap page is built from —
// the brand book's published page (`book.tap_page`: its hero media + headline +
// deck, in the merchant's tokens) + the proof (the order). Change the page →
// the email changes, with nothing to hand-sync.
//
// The live tap-page engine (`buildTapPageContext`/`generateTapPage`) is CLIENT-side
// (Supabase + localStorage), so it can't run in the send rail. `buildReceiptEmailData`
// is a PURE, server-safe reader of the same `book.tap_page` + proof. Both functions
// are pure (no React / DOM / Supabase) so they run in the SendGrid rail.
//
// DATA-SHAPE NOTES for the rail:
//   - The brand book lives at `response.brand_book.book` (NOT `response.brand_book`).
//   - The book JSON can carry raw control chars → parse with a tolerant strip:
//     `JSON.parse(text.replace(/[\x00-\x1f]/g, " "))`.
//   - The hero is often a VIDEO (`tap_page.hero_video_url`); email uses the poster
//     image (`tap_page.hero_url`), and the full video plays on the live page.

// Local minimal types so this file compiles standalone (the real BrandBook /
// Proof types live in the parallelreturns repo, not the Shopify app).
type BrandBook = any;
type Proof = any;

export interface ReceiptEmailData {
  brandName: string;
  /** The page's hero headline (e.g. "Start the timer"). */
  headline: string;
  /** The page's hero deck / subline. */
  deck: string;
  /** Hero image — the page's hero (IG photo or video POSTER). */
  heroUrl: string | null;
  ink: string;
  accent: string;
  surface: string;
  displayFont: string;
  bodyFont: string;
  product: string;
  /** The bought product's photo — STAMPED in the hero corner, mirroring the
   *  tap page. null when there's no product image, or it IS the hero. */
  productImageUrl: string | null;
  orderNo: string;
}

export interface ReceiptEmailInput {
  receiptUrl: string;
  qrImageUrl?: string | null;
  poweredByInk?: boolean;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeFont(family: string | undefined | null, fallback: string): string {
  return family ? `'${family}', ${fallback}` : fallback;
}

function brandNameFromUrl(url: string | undefined | null): string {
  if (!url) return "";
  const host = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] ?? "";
  const stem = host.split(".")[0] ?? "";
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : "";
}

/** SERVER-SAFE: assemble the painter's data from the brand book's published page +
 *  proof — the same source the tap page renders from. Pure. */
export function buildReceiptEmailData(book: BrandBook, proof: Proof): ReceiptEmailData {
  const runtime = book.runtime?.parallel_brand_runtime;
  const colors = book.tokens?.colors;
  const rtColors = runtime?.design_tokens?.colors;
  const ink = rtColors?.text ?? colors?.ink ?? "#111111";
  const accent = rtColors?.accent ?? colors?.accent ?? ink;

  const type = book.tokens?.typography;
  // Email can't load the brand's Adobe/Typekit face (e.g. acumin-pro-extra-
  // condensed), so the FALLBACK must carry the brand's CHARACTER, not collapse
  // to a serif. Condensed-sans stack: Oswald (webfont-loaded in the head for
  // Apple/iOS Mail) → Arial Narrow / Helvetica → sans. Never serif.
  const displayFont = safeFont(type?.display?.family, "'Oswald', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif");
  const bodyFont = safeFont(type?.body?.family, "Inter, system-ui, sans-serif");

  const brandName =
    runtime?.brand?.name?.trim() ||
    book.dembrandt?.siteName?.trim() ||
    book.instagram?.owner_full_name?.trim() ||
    brandNameFromUrl(book.source_url) ||
    proof.merchant ||
    "";

  const od = proof.order_details;
  const item0 = od?.line_items?.[0];
  const product = item0?.title || item0?.description || "";
  const orderNo = od?.order_number || proof.order_id || "";

  // The published page's hero — its headline / deck / media win; the product is
  // only the fallback when the merchant hasn't published a page.
  const tap = book.tap_page;
  const heroSection = tap?.custom_sections?.find((s: any) => s.kind === "hero");
  const headline = (heroSection && "headline" in heroSection ? heroSection.headline : "") || product || "Your order";
  // Always STATE what was bought. The page's deck wins; otherwise a neutral
  // product line that mirrors the live tap page ("{first name}, your {product}
  // is here.") so the email never leaves the order unnamed.
  const firstName = (od?.customer_name || "").trim().split(/\s+/)[0] || "";
  const pageDeck = (heroSection && "deck" in heroSection ? heroSection.deck : "") || "";
  const deck = pageDeck || (product ? `${firstName ? `${firstName}, your` : "Your"} ${product} is here.` : "");
  // Email shows the poster image (hero_url); the video (hero_video_url) plays on
  // the live page. Falls back to product image only when the page has no hero.
  const heroUrl = tap?.hero_url || (tap?.hero_images && tap.hero_images[0]) || item0?.image_url || null;
  // The bought product's photo, STAMPED in the hero corner — but only when it's
  // DISTINCT from the hero (else a product-only hero would stamp itself), exactly
  // like the tap page's ProductStamp guard.
  const productImageUrl = item0?.image_url && item0.image_url !== heroUrl ? item0.image_url : null;

  return { brandName, headline, deck, heroUrl, ink, accent, surface: "#ffffff", displayFont, bodyFont, product, productImageUrl, orderNo };
}

/** Paint the email — hero-forward, mirroring the tap page: brand mark → big hero →
 *  headline → deck → CTA into the live page. Inbox-safe (tables, inline styles). */
export function renderReceiptEmail(data: ReceiptEmailData, input: ReceiptEmailInput): string {
  const { ink, surface, displayFont: display, bodyFont: body, brandName: brand, headline, deck, heroUrl: hero, product, productImageUrl: stamp, orderNo } = data;

  const heroImg = `<img src="${esc(hero)}" width="600" alt="${esc(headline)}" style="width:100%;max-width:600px;height:auto;display:block;border:0;outline:none;" />`;
  // The bought product is STAMPED in the hero's bottom-right corner, mirroring the
  // tap page. position:absolute renders the corner in Apple/iOS Mail (the bulk of
  // opens); Gmail/Outlook strip positioning so the product flows just under the
  // hero — degraded but never broken, and the hero ALWAYS shows (it's a real
  // <img>, no background-image dependency).
  // The whole hero (image + product stamp) is a LINK into the live receipt —
  // tap the picture, open the door.
  const heroBlock = hero
    ? `<tr><td style="padding:0;">
         <a href="${esc(input.receiptUrl)}" target="_blank" style="display:block;text-decoration:none;">
           <div style="position:relative;line-height:0;font-size:0;">
             ${heroImg}${stamp ? `
             <div style="position:absolute;right:14px;bottom:14px;width:22%;max-width:132px;line-height:0;">
               <img src="${esc(stamp)}" width="132" alt="${esc(product)}" style="width:100%;height:auto;display:block;border-radius:12px;border:3px solid #ffffff;box-shadow:0 6px 18px rgba(0,0,0,0.28);" />
             </div>` : ""}
           </div>
         </a>
       </td></tr>`
    : "";

  const deckBlock = deck
    ? `<tr><td style="padding:10px 34px 0;font:16px/1.5 ${body};color:${esc(ink)};opacity:.7;">${esc(deck)}</td></tr>`
    : "";

  const metaBits = [esc(product), orderNo ? `Order ${esc(orderNo)}` : ""].filter((s) => s && s.length).join(" &nbsp;&middot;&nbsp; ");
  const metaBlock = metaBits
    ? `<tr><td style="padding:18px 34px 0;font:12px/1.5 ${body};color:${esc(ink)};opacity:.5;letter-spacing:.02em;">${metaBits}</td></tr>`
    : "";

  const qrBlock = input.qrImageUrl
    ? `<tr><td style="padding:18px 34px 0;">
         <table role="presentation" cellpadding="0" cellspacing="0"><tr>
           <td style="padding-right:14px;"><img src="${esc(input.qrImageUrl)}" width="74" height="74" alt="Scan to open your receipt" style="display:block;border-radius:8px;background:#fff;border:0;" /></td>
           <td style="font:13px/1.45 ${body};color:${esc(ink)};opacity:.7;">On a laptop?<br/>Scan to open it on your phone.</td>
         </tr></table>
       </td></tr>`
    : "";

  const footer = input.poweredByInk
    ? `<tr><td style="padding:24px 34px 28px;font:11px/1 ${body};color:${esc(ink)};opacity:.4;letter-spacing:.04em;">Powered by ink.</td></tr>`
    : `<tr><td style="padding:18px 34px 26px;"></td></tr>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/><title>${esc(brand)} &mdash; ${esc(headline)}</title><style>@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap');</style></head>
<body style="margin:0;padding:0;background:#ededeb;">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(headline)} &mdash; open your receipt.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ededeb;">
  <tr><td align="center" style="padding:22px 10px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${esc(surface)};border-radius:16px;overflow:hidden;">
      <tr><td style="padding:24px 34px 18px;font:700 15px/1 ${display};letter-spacing:.2em;color:${esc(ink)};text-transform:uppercase;">${esc(brand)}</td></tr>
      ${heroBlock}
      <tr><td style="padding:26px 34px 0;font:700 44px/1.0 ${display};letter-spacing:-.015em;color:${esc(ink)};">${esc(headline)}</td></tr>
      ${deckBlock}
      ${metaBlock}
      <tr><td style="padding:26px 34px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td align="center" bgcolor="${esc(ink)}" style="border-radius:40px;background:${esc(ink)};">
            <a href="${esc(input.receiptUrl)}" target="_blank" style="display:block;padding:17px 24px;font:700 16px/1 ${display};letter-spacing:.04em;color:#ffffff;text-decoration:none;">OPEN YOUR RECEIPT&nbsp;&nbsp;&rarr;</a>
          </td>
        </tr></table>
      </td></tr>
      ${qrBlock}
      ${footer}
    </table>
  </td></tr>
</table>
</body></html>`;
}

/**
 * SERVER-SAFE brand-book fetch for the send rail. Pulls the published brand book
 * from the public worker proxy and returns `response.brand_book.book` (the shape
 * `buildReceiptEmailData` expects), or null on any error. Tolerant of raw
 * control chars in the book JSON (strips them before parse). Never throws.
 */
export async function fetchBrandBook(shopId: string): Promise<any | null> {
  try {
    const r = await fetch(
      `https://ink-easypost-proxy.inink.workers.dev/api/public/brand-book?shop_id=${encodeURIComponent(shopId)}`
    );
    const txt = await r.text();
    // Tolerant control-char strip (the book JSON can carry raw control chars).
    const json = JSON.parse(txt.replace(/[\x00-\x1f]/g, " "));
    return json?.brand_book?.book ?? null;
  } catch {
    return null;
  }
}
