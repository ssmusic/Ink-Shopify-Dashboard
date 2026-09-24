// /app/ink — ink's home, which is Orders, and every older ?view= address.
//
// Each section has its own path (routes/app.ink.$section.tsx) so the admin's
// left nav can name and mark it; the app name in that nav leads here. This
// door sends the visitor to the section's path with the rest of the query
// kept — Shopify's own parameters, a search, a page — so bookmarks, the
// billing return and links written before 2026-09-24 still land where they
// meant to. Nothing is read or rendered here: the section's route
// authenticates.
import { redirect, type LoaderFunctionArgs } from "react-router";

const VIEWS: Record<string, string> = {
  insights: "dashboard",
  orders: "orders",
  records: "records",
  help: "help",
};

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const section = VIEWS[url.searchParams.get("view") ?? ""] ?? "orders";
  url.searchParams.delete("view");
  const search = url.searchParams.toString();
  throw redirect(`/app/ink/${section}${search ? `?${search}` : ""}`);
};
