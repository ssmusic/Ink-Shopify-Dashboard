/** Keep an external tracking destination exactly as Shopify supplied it.
 * Our own fulfillment mutation triggers another webhook with an ink URL.
 * Omitting that echo prevents it from replacing the stored original URL.
 * This does not choose the buyer's final redirect; that belongs to the
 * backend/redirect service, which still needs automatic forwarding support.
 */
export function originalTrackingDestination(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
      return undefined;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (host === "in.ink" || host.endsWith(".in.ink")) return undefined;
    return value;
  } catch {
    return undefined;
  }
}
