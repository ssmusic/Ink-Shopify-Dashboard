// A PERSON TYPING THE APP'S ADDRESS, NOT SHOPIFY'S ADMIN OPENING IT.
//
// Opened from the admin, every document request for /app carries its store
// (`shop`, `host`, `id_token`) and every data request carries a session token.
// A browser tab pointed at app.in.ink/app carries none of them, and the
// library answers with its App Bridge bounce — a 200 page that only means
// something inside the admin's iframe. Outside it, React Router shows
// "Unhandled Thrown Response!" over the digits "200": the page App Store
// review rejected in round two (2.1.1), reached from the landing's own
// buttons until 2026-09-24.
//
// `Sec-Fetch-Dest` is what tells the tab from the frame: a load inside the
// admin's iframe says `iframe`, a fetch says `empty`, a tab says `document`.
// Anything carrying a store or a token, and any browser that sends no
// Sec-Fetch-Dest at all, keeps the library's own path exactly as before.
export function isDirectVisitWithoutAStore(request: Request): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.get("sec-fetch-dest") !== "document") return false;
  if (request.headers.get("authorization")) return false;
  const params = new URL(request.url).searchParams;
  return !params.get("shop") && !params.get("host") && !params.get("id_token");
}
