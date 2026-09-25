// A door the app no longer serves: 404, no body worth reading, no cache.
export function retiredDoor(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
