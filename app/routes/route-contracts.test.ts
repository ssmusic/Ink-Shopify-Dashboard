// THE CONTRACTS A ROUTE MUST KEEP, CHECKED MECHANICALLY.
//
// Every escape that reached a Shopify reviewer shares one shape: it typechecks,
// the suite is green, the diff reads fine, and it only exists once a route
// actually renders. All eight existing tests live in app/services — server
// logic — so nothing in CI has ever touched a route.
//
// 2026-08-20, rejection 2.1.1 round two: "going to the billing section and
// navigating back ... shows an 200 error page". /app/billing's backAction
// points at /app/settings, whose loader returned Remix v2's `json(payload)`.
// This is React Router 7: a route WITH A COMPONENT returns its data directly
// and the framework serialises it. Hand single-fetch a raw Response and it
// cannot encode it; the failure reaches boundary.error(), which renders the
// Response's STATUS — a page whose entire body is the text "200".
//
// tsc cannot see it. A service test cannot see it. A grep can, so it is a test.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = resolve(process.cwd(), "app/routes");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...routeFiles(full));
    else if (/\.tsx?$/.test(name.name) && !/\.test\.tsx?$/.test(name.name)) out.push(full);
  }
  return out;
}

const FILES = routeFiles(ROUTES).map((path) => ({
  path: path.slice(path.indexOf("app/")),
  src: readFileSync(path, "utf8"),
}));

/** A route that renders UI. Resource routes (no component) are exempt —
 *  returning a Response is exactly what they are for. */
const componentRoutes = FILES.filter((f) => /export\s+default\s+function|export\s+default\s+\w+/.test(f.src));

describe("route contracts", () => {
  it("finds routes to check", () => {
    expect(FILES.length).toBeGreaterThan(20);
    expect(componentRoutes.length).toBeGreaterThan(5);
  });

  it("no route imports @remix-run/node — this is React Router 7", () => {
    const offenders = FILES.filter((f) => /@remix-run\/node/.test(f.src)).map((f) => f.path);
    expect(
      offenders,
      "Remix helpers in a React Router 7 app produce Responses the framework cannot serialise. Use react-router's redirect, and return plain objects from loaders.",
    ).toEqual([]);
  });

  it("a route with a component never returns a Response from its loader", () => {
    const offenders: string[] = [];
    for (const f of componentRoutes) {
      // Only inspect loader/action bodies, not component render code.
      const loader = f.src.match(/export\s+(?:async\s+)?(?:const\s+loader|function\s+loader)[\s\S]*?\n\}/);
      if (!loader) continue;
      if (/return\s+json\(|return\s+new Response\(/.test(loader[0])) offenders.push(f.path);
    }
    expect(
      offenders,
      "React Router 7 serialises component-route loader data itself. Returning a Response makes single-fetch fail and boundary.error() render the status code — the literal '200 error page' Shopify rejected.",
    ).toEqual([]);
  });

  it("catches the exact code that was rejected", () => {
    const rejected = `
      import { json } from "@remix-run/node";
      export async function loader() {
        return json({ ok: true });
      }
      export default function Page() { return null; }
    `;
    expect(/@remix-run\/node/.test(rejected)).toBe(true);
    const loader = rejected.match(/export\s+(?:async\s+)?(?:const\s+loader|function\s+loader)[\s\S]*?\n\s*\}/);
    expect(loader).not.toBeNull();
    expect(/return\s+json\(/.test(loader![0])).toBe(true);
  });
});
