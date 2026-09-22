// THE MARK, CAPTURED OFF THE STOREFRONT — the Worker's door, called from the
// install.
//
// ink's onboarding has no brand book, no Instagram, no mint: the brand's mark
// is read off its own homepage by the Worker's free capture
// (`/admin/brand-mark`, the-ritualist worker-recovered/src/brand-mark-door.js;
// 33 of 52 register storefronts today, ~50 with inline-SVG capture). The
// Worker rehosts the winner through its mirror and, asked with
// `write: "merchant"`, writes `brand_logo_url` onto the backend merchant doc,
// where the flash paints it first. This file is only the call.
//
// FAIL-SOFT, ALWAYS. This runs inside the install's self-provision, which is
// non-blocking by law (app.tsx): a Worker that is down, slow, unconfigured or
// refusing costs the mark and never the install, the api key or the app's
// first render. Nothing here throws; the answer says what happened so the
// onboarding screen can offer "try again" or the shop name in type.
//
// Env (the ink-app Cloud Run service; both unset on the Ritualist's, which
// never calls this): INK_WORKER_URL — the Worker's origin, no trailing slash;
// INK_WORKER_ADMIN_PW — the operator password every /admin/* door checks as
// X-Admin-Password.

export interface BrandMarkCapture {
  /** True only when the Worker answered 2xx. */
  ok: boolean;
  /** HTTP status, 0 when the call never completed, -1 when never made. */
  status: number;
  /** The rehosted mark, when the Worker named one. */
  logoUrl: string | null;
  /** One sentence for the log and the onboarding screen. */
  note: string;
}

const CAPTURE_TIMEOUT_MS = 45_000;

export function brandMarkDoorUrl(): string | null {
  const base = (process.env.INK_WORKER_URL || "").trim().replace(/\/+$/, "");
  return base ? `${base}/admin/brand-mark` : null;
}

/** Where the Worker put the mark, under either spelling the door may answer
 *  with: the merchant write's own field, or the book-shaped `logo`. */
export function logoUrlFromCaptureBody(body: any): string | null {
  const direct = body?.brand_logo_url;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const hosted = body?.logo?.primary_url;
  if (typeof hosted === "string" && hosted.trim()) return hosted.trim();
  return null;
}

export async function captureBrandMark({
  site,
  shopId,
  fetchImpl = fetch,
}: {
  /** The shop's primary domain URL (`shop { primaryDomain { url } }`). */
  site: string;
  /** The backend merchant id (`shop_…`), from createMerchant's answer. */
  shopId: string;
  fetchImpl?: typeof fetch;
}): Promise<BrandMarkCapture> {
  const url = brandMarkDoorUrl();
  const password = process.env.INK_WORKER_ADMIN_PW || "";
  if (!url || !password) {
    return {
      ok: false,
      status: -1,
      logoUrl: null,
      note: "brand-mark capture is not configured (INK_WORKER_URL / INK_WORKER_ADMIN_PW unset)",
    };
  }
  if (!site || !shopId) {
    return { ok: false, status: -1, logoUrl: null, note: "brand-mark capture needs a site and a shop_id" };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CAPTURE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Password": password,
      },
      body: JSON.stringify({ site, shop_id: shopId, write: "merchant" }),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => null);
    const logoUrl = logoUrlFromCaptureBody(body);
    if (!res.ok) {
      const why = typeof body?.error === "string" ? body.error : `HTTP ${res.status}`;
      return { ok: false, status: res.status, logoUrl, note: `the Worker refused the capture: ${why}` };
    }
    return {
      ok: true,
      status: res.status,
      logoUrl,
      note: logoUrl ? `mark captured: ${logoUrl}` : "the Worker answered but named no mark",
    };
  } catch (err: any) {
    const why = err?.name === "AbortError" ? `timed out after ${CAPTURE_TIMEOUT_MS / 1000}s` : String(err?.message ?? err);
    return { ok: false, status: 0, logoUrl: null, note: `brand-mark capture failed: ${why}` };
  } finally {
    clearTimeout(timer);
  }
}
