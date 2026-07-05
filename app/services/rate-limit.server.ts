// Minimal in-memory IP rate limiter for the public API routes (api.enroll,
// api.verify, api.retrieve, api.orders.fetch). Fixed window per key.
//
// Honest scope: per-INSTANCE memory — Cloud Run may run several instances,
// so the effective global limit is (limit × instances). That still kills
// single-source abuse (enumeration, brute force), which is the review/security
// bar here. A shared store (Redis/Firestore counter) is the upgrade path if
// traffic ever justifies it.

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000; // memory backstop — clears oldest windows wholesale

export function allowRequest(key: string, limitPerMinute: number): boolean {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) {
      if (now - b.windowStart > WINDOW_MS) buckets.delete(k);
    }
    if (buckets.size > MAX_KEYS) buckets.clear();
  }
  const b = buckets.get(key);
  if (!b || now - b.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  b.count += 1;
  return b.count <= limitPerMinute;
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}

export function rateLimitResponse(headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": "60", ...headers },
  });
}
