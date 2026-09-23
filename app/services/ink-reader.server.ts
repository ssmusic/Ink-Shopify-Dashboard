import { isInk } from "./app-flavor.server";
const DEFAULT_API = "https://us-central1-inink-c76d3.cloudfunctions.net/api";
export const PROOF_ID = /^proof_[0-9a-f]{24}$/;

export function merchantUrl(path: string) {
  const base = new URL(
    (process.env.INK_API_URL || DEFAULT_API).replace(/\/$/, "") + "/",
  );
  if (base.protocol !== "https:" || base.username || base.password)
    throw new Error("Secure backend URL required");
  return new URL(path.replace(/^\//, ""), base).toString();
}

/** No public fallback, redirects, admin credentials, error bodies or logs. */
export async function merchantRead(
  apiKey: string | null | undefined,
  path: string,
  fetchImpl: typeof fetch = fetch,
): Promise<any | null> {
  if (!apiKey) return null;
  try {
    const response = await fetchImpl(merchantUrl(path), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
      redirect: "error",
      cache: "no-store",
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** Preserve the paid transport; bound ink mutations and keep credentials on HTTPS. */
export const flavorFetch: typeof fetch = async (input, init) => {
  if (!isInk()) return globalThis.fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Secure backend URL required");
  return globalThis.fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(6000),
    redirect: "error",
    cache: "no-store",
  });
};
