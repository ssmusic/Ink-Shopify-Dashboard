
import sendgrid from "@sendgrid/mail";
import { stampEmailUtm } from "./brand-email.server";

// SendGrid credentials from environment variables. FROM defaults to a NEUTRAL
// notifications@in.ink — the merchant-branded {brand}@in.ink From is passed in
// per-send (payload.fromEmail); this env value is only the no-merchant-context
// fallback. in.ink is SendGrid domain-authenticated, so any {x}@in.ink sends.
const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL || "notifications@in.ink";

if (apiKey) {
  sendgrid.setApiKey(apiKey);
} else {
  console.warn("⚠️ SendGrid API Key missing. Email service will be disabled.");
}

// Derive the {brand} slug for a {brand}@in.ink sender — mirrors the ink-backend
// brandSlugFromDomain() (utils/resolveMerchantForAnimation.js) which mints
// {brand}.in.ink: strip protocol/www, take the first DNS label, slugify.
// e.g. "stevemadden.myshopify.com" → "stevemadden" → stevemadden@in.ink.
export function brandSlugFromDomain(domain?: string | null): string {
  const host = String(domain || "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0];
  return (host.split(".")[0] || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

interface ReturnPassportEmailPayload {
  to: string;
  customerName: string;
  orderName: string;
  proofUrl: string;
  merchantName?: string;
  photoUrls?: string[];  // 4 enrollment photos
  returnWindowDays?: number;  // Return window (e.g., 30 days)
  returnUrl?: string;  // URL to start return
  productImageUrl?: string; // Main product image
  // Merchant-authored overrides from the Outreach panel (parallelreturns
  // Settings.tsx → ink-backend merchant.outreach.messages.return_unlocked_*).
  // Templated with {order_no}, {product}, {return_url}, {merchant_name},
  // {customer_name}, {return_window} before send. Unset ⇒ hardcoded defaults
  // (today's shape, no drift for merchants who haven't touched Outreach).
  subjectOverride?: string;
  bodyOverride?: string;
  productName?: string; // template variable for {product}
  // Dynamic branded sender. When set, the email comes FROM the merchant's brand
  // ({brand}@in.ink) with their name + support reply-to, instead of the neutral
  // notifications@in.ink default. Computed by the caller from the merchant doc.
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
  // Email-as-tap-page (2026-07-02): pre-resolved brand kit + the buyer's
  // aimed section, resolved by the CALLER (which knows shop_id and the
  // proof's customer_tier). Absent/null ⇒ the neutral template renders
  // exactly as before — the send never depends on the brand-book fetch.
  brand?: import("./brand-email.server").BrandEmailKit | null;
  campaign?: import("./brand-email.server").EmailCampaign | null;
}

// One-pass template substitution. The TEMPLATE is trusted (merchant-authored),
// but the VALUES are NOT — {customer_name} and {product} come straight from the
// Shopify order (buyer-controlled firstName / line-item title), so they can
// carry markup. This fn stays raw and is safe ONLY where the output lands in a
// plain-text context (the SendGrid subject line + the text/plain part). For the
// HTML body, escape the assembled string with escapeHtml() before it goes in a
// tag. Missing keys collapse to empty string so a merchant's stray `{typo}`
// doesn't leak into the sent email.
function fillTemplate(
  tpl: string,
  vars: Record<string, string | undefined | null>,
): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

// Escape a plain-text string for safe interpolation into HTML. The merchant
// Outreach body is authored as plain text (a textarea, not an HTML editor), so
// escaping the WHOLE assembled string — template + injected values — is correct
// AND kills the XSS from buyer-controlled {customer_name}/{product}. Newlines
// are converted to <br> by the caller AFTER escaping, so those tags survive.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Legacy interface for backward compatibility
interface EmailPayload {
  to: string;
  customerName: string;
  orderName: string;
  proofUrl: string;
  merchantName?: string;
}

export const EmailService = {
  /**
   * Sends the Return Passport email after delivery is unlocked.
   * Includes: Enrollment photos, return window info, "Start Return" CTA
   */
  async sendReturnPassportEmail(payload: ReturnPassportEmailPayload): Promise<boolean> {
    if (!apiKey || !fromEmail) {
      console.error("❌ Cannot send email: SendGrid credentials missing.");
      return false;
    }

    const {
      to,
      customerName,
      orderName,
      proofUrl,
      merchantName = "your store",
      photoUrls = [],
      returnWindowDays = 30,
      returnUrl,
      productImageUrl,
      subjectOverride,
      bodyOverride,
      productName,
      fromEmail: fromEmailOverride,
      fromName,
      replyTo,
      brand,
      campaign,
    } = payload;

    // Branded sender: {brand}@in.ink + shop_name when provided, else the neutral
    // notifications@in.ink env default. Reply-to = merchant support (omitted if
    // unset). Display name defaults to the merchant name we already show.
    const senderEmail = fromEmailOverride || fromEmail;
    const senderName = fromName || merchantName;

    // Determine return button URL
    const returnButtonUrl = returnUrl || proofUrl;

    // ── Email-as-tap-page pieces (all optional, all inline-styled) ──────
    // The header band wears the brand (logo image > brand name in caps >
    // today's "ink."), the page's own hero media rides under the heading,
    // and the buyer's aimed section — the SAME campaign the tap page shows
    // for this proof — renders after the primary CTA, links stamped
    // utm_medium=email for attribution.
    const headerHtml = brand
      ? brand.logoUrl
        ? `<img src="${brand.logoUrl}" alt="${escapeHtml(merchantName)}" style="max-height:30px;max-width:240px;" />`
        : `<h1 class="header-title" style="letter-spacing:.12em;text-transform:uppercase;">${escapeHtml(merchantName)}</h1>`
      : `<h1 class="header-title">ink.</h1>`;
    const heroHtml = brand?.heroUrl
      ? `<img src="${brand.heroUrl}" alt="" width="100%" style="width:100%;border-radius:6px;display:block;margin:16px 0 4px;" />`
      : "";
    const campaignCta = campaign ? stampEmailUtm(campaign.cta_url, campaign.id) : "";
    const campaignHtml = campaign
      ? `
            <div style="text-align:left;border-top:1px solid #ececec;margin-top:28px;padding-top:20px;">
              <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#888;margin:0 0 8px;">From ${escapeHtml(merchantName)}</p>
              <h3 style="font-family:'Playfair Display',Georgia,serif;font-size:24px;line-height:1.2;margin:0 0 8px;color:#111;">${escapeHtml(campaign.headline)}</h3>
              ${campaign.body ? `<p style="font-size:14px;line-height:1.55;color:#555;margin:0 0 12px;">${escapeHtml(campaign.body)}</p>` : ""}
              ${Array.isArray(campaign.images) && campaign.images.length
                ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 12px;"><tr>
                    ${campaign.images.slice(0, 3).map((u) => `<td style="padding-right:6px;width:33%;"><a href="${campaignCta}"><img src="${u}" alt="" width="100%" style="width:100%;border-radius:4px;display:block;" /></a></td>`).join("")}
                  </tr></table>`
                : ""}
              ${campaign.code ? `<p style="font-family:'Courier New',monospace;font-size:14px;letter-spacing:.08em;border:1px dashed #999;display:inline-block;padding:8px 12px;margin:0 0 12px;color:#111;">${escapeHtml(campaign.code)}</p>` : ""}
              <div><a href="${campaignCta}" style="display:inline-block;background:${brand?.ink || "#111111"};color:#ffffff;text-decoration:none;padding:12px 22px;font-weight:700;font-size:14px;">${escapeHtml(campaign.cta_label || "Take a look")}</a></div>
            </div>`
      : "";

    // Template variables shared by merchant-authored subject + body.
    const tplVars: Record<string, string> = {
      order_no: orderName,
      product: productName || "your order",
      return_url: returnButtonUrl,
      merchant_name: merchantName,
      customer_name: customerName,
      return_window: String(returnWindowDays),
    };

    // Premium HTML Template
    const htmlContent = `
      <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
      <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <title>Your order has arrived — ${orderName}</title>
        <style type="text/css">
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500;600&display=swap');
          
          body {
            width: 100% !important;
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: #f8f8f8;
            font-family: 'Inter', Helvetica, Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
          }
          
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
          }

          .header {
            background-color: #000000;
            padding: 30px 40px;
            text-align: center;
          }

          .header-title {
            color: #ffffff;
            font-family: 'Playfair Display', serif;
            font-size: 24px;
            letter-spacing: 0.5px;
            margin: 0;
          }
          
          .content {
            padding: 40px;
            text-align: center;
          }

          .order-badge {
            display: inline-block;
            background-color: #f0f0f0;
            color: #000000;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 1px;
            margin-bottom: 24px;
            text-transform: uppercase;
          }

          .main-heading {
            font-family: 'Playfair Display', serif;
            font-size: 32px;
            color: #000000;
            margin: 0 0 16px 0;
            line-height: 1.2;
          }

          .sub-heading {
            font-size: 16px;
            color: #555555;
            line-height: 1.6;
            margin: 0 0 32px 0;
            max-width: 480px;
            margin-left: auto;
            margin-right: auto;
          }

          .product-image {
            width: 100%;
            max-width: 300px;
            height: auto;
            border-radius: 8px;
            margin-bottom: 32px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          }

          .cta-button {
            display: inline-block;
            background-color: #000000;
            color: #ffffff;
            text-decoration: none;
            padding: 16px 40px;
            border-radius: 2px;
            font-weight: 500;
            font-size: 14px;
            letter-spacing: 1px;
            text-transform: uppercase;
            transition: opacity 0.2s;
          }

          .info-grid {
            margin-top: 48px;
            border-top: 1px solid #eeeeee;
            padding-top: 32px;
            text-align: left;
          }

          .info-item {
            margin-bottom: 16px;
          }

          .info-label {
            font-size: 12px;
            color: #888888;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 4px;
          }

          .info-value {
            font-size: 14px;
            color: #000000;
            font-weight: 500;
          }

          .footer {
            background-color: #f8f8f8;
            padding: 30px 40px;
            text-align: center;
            font-size: 12px;
            color: #999999;
          }
          
          /* Mobile styles */
          @media only screen and (max-width: 600px) {
            .email-container { width: 100% !important; }
            .content { padding: 30px 20px !important; }
            .main-heading { font-size: 28px !important; }
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <!-- Header -->
          <div class="header"${brand ? ` style="background:${brand.ink};"` : ""}>
            ${headerHtml}
          </div>

          <!-- Main Content -->
          <div class="content">
            <div class="order-badge">Order ${orderName}</div>
            
            <h2 class="main-heading">Your order has arrived</h2>
            <p class="sub-heading">
              Hi ${customerName}, your order from <strong>${merchantName}</strong> has arrived. Delivery confirmed.
            </p>
            ${heroHtml}

            ${productImageUrl ? `
              <img src="${productImageUrl}" alt="Product" class="product-image" />
            ` : ''}

            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center">
                   <a href="${returnButtonUrl}" class="cta-button" style="color: #ffffff !important;">
                     Start Return
                   </a>
                </td>
              </tr>
            </table>

            <div style="margin-top: 24px; text-align: center;">
              <p style="font-size: 14px; color: #666; margin-bottom: 8px;">Or copy this link:</p>
              <a href="${proofUrl}" style="color: #999; text-decoration: underline; font-size: 13px; word-break: break-all;">
                ${proofUrl}
              </a>
            </div>
            ${campaignHtml}

            <!-- Photos Section (if needed) -->
            ${photoUrls.length > 0 ? `
              <div style="margin-top: 40px; text-align: left;">
                <p style="font-size: 13px; font-weight: 600; color: #000; margin-bottom: 12px;">PACKED FOR SHIPMENT</p>
                <div style="white-space: nowrap; overflow-x: auto; padding-bottom: 10px;">
                  ${photoUrls.slice(0, 3).map(url => `
                    <div style="display: inline-block; width: 80px; height: 80px; margin-right: 8px; border-radius: 4px; background-color: #eee; overflow: hidden; vertical-align: top;">
                        <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;" alt="Packing photo" />
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
            
            <!-- Details Grid -->
            <div class="info-grid">
               <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                 <tr>
                    <td valign="top" width="50%" style="padding-bottom: 20px;">
                        <div class="info-label">Merchant</div>
                        <div class="info-value">${merchantName}</div>
                    </td>
                    <td valign="top" width="50%" style="padding-bottom: 20px;">
                        <div class="info-label">Return Window</div>
                        <div class="info-value">${returnWindowDays} Days</div>
                    </td>
                 </tr>
                 <tr>
                    <td valign="top" width="50%">
                        <div class="info-label">Status</div>
                        <div class="info-value">Confirmed on arrival</div>
                    </td>
                    <td valign="top" width="50%">
                        <div class="info-label">Date</div>
                        <div class="info-value">${new Date().toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </td>
                 </tr>
               </table>
            </div>

          </div>

          <!-- Footer -->
          <div class="footer">
            <p style="margin: 0 0 10px 0;">Delivered with ink.</p>
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} ink. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Merchant-authored overrides. Subject-only, body-only, and both-set all
    // work. When only body is set, we wrap it in a minimal branded frame so a
    // plain-text merchant template still ships as a readable email — no need to
    // author full HTML in the Outreach panel.
    const finalSubject = subjectOverride && subjectOverride.trim()
      ? fillTemplate(subjectOverride, tplVars)
      : `Your ${merchantName} order ${orderName} is here`;

    const filledBody = bodyOverride && bodyOverride.trim()
      ? fillTemplate(bodyOverride, tplVars)
      : "";
    // HTML-safe versions: the body + merchant name may carry buyer-controlled
    // markup (via {customer_name}/{product} or the shop domain), so escape
    // before they land in a tag. Newlines → <br> AFTER escaping so the breaks
    // survive. The plain-text part (finalText) stays raw — no HTML context.
    const htmlSafeBody = escapeHtml(filledBody).replace(/\n/g, "<br>");
    const htmlSafeMerchant = escapeHtml(merchantName);
    const finalHtml = filledBody
      ? `<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;background:#f5f4ef;padding:32px;line-height:1.55;">
           <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e4dd;padding:32px;">
             <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6b6864;margin-bottom:16px;">ink. &middot; ${htmlSafeMerchant}</div>
             ${htmlSafeBody}
             <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eeece5;">
               <a href="${returnButtonUrl}" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:14px 24px;font-weight:700;letter-spacing:0.02em;">Open your order &rarr;</a>
             </div>
           </div>
         </div>`
      : htmlContent;
    const finalText = filledBody
      ? filledBody + `\n\nOpen your order: ${returnButtonUrl}`
      : `Your ${merchantName} order ${orderName} has arrived. Delivery confirmed. Your receipt + returns: ${returnButtonUrl}`;

    // One retry on transient transport failures (undici "fetch failed",
    // ECONNRESET, SendGrid 5xx). The first live send for order #1012
    // (2026-07-02) failed exactly this way and succeeded on the manual
    // retry — the delivered email is the product's front door; it doesn't
    // get to lose a coin flip.
    const message = {
      to,
      from: { email: senderEmail, name: senderName },
      ...(replyTo ? { replyTo } : {}),
      subject: finalSubject,
      text: finalText,
      html: finalHtml,
    };
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await sendgrid.send(message);
        console.log(`✅ Return Passport email sent to ${to} (from ${senderEmail})${attempt > 1 ? " (on retry)" : ""}`);
        return true;
      } catch (error: any) {
        console.error(`❌ Email send attempt ${attempt}/2 failed:`, error.response?.body || error.message);
        if (attempt === 2) return false;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
    return false;
  },

  /**
   * Legacy method - redirects to Return Passport email
   * Kept for backward compatibility
   */
  async sendVerificationEmail(payload: EmailPayload): Promise<boolean> {
    return this.sendReturnPassportEmail({
      ...payload,
      photoUrls: [],
      returnWindowDays: 30,
    });
  },
};
