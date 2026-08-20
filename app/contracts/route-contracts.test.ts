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
// This file lives in app/contracts, NOT app/routes: React Router compiles
// every file under app/routes as a ROUTE MODULE, so a test placed there is
// built as a route and breaks `react-router build`. Which is exactly what it
// did — see the commit message.

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

/** Handler bodies extracted by walking braces, not by guessing where the
 *  closing brace sits in the source. A loader that contains any nested block is
 *  invisible to a `[\s\S]*?\n\}` regex the moment its own closer is indented. */
function handlerBodies(src: string): string[] {
  const out: string[] = [];
  const signature = /export\s+(?:async\s+)?(?:const\s+(?:loader|action)\b|function\s+(?:loader|action)\b)/g;
  let m: RegExpExecArray | null;
  while ((m = signature.exec(src))) {
    // The body's brace, not the parameter object's: `loader({ request })` opens
    // a `{` before the body ever starts. Walk to the first `{` at paren-depth 0.
    let open = -1;
    for (let i = m.index, parens = 0; i < src.length; i++) {
      if (src[i] === "(") parens++;
      else if (src[i] === ")") parens--;
      else if (src[i] === "{" && parens === 0) { open = i; break; }
    }
    if (open === -1) continue;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          out.push(src.slice(open, i + 1));
          signature.lastIndex = i;
          break;
        }
      }
    }
  }
  return out;
}

const rethrowsResponse = (body: string) =>
  /instanceof\s+Response\b[\s\S]{0,400}?\bthrow\s+\w/.test(body);

const SOURCES = (function collect(dir: string): { path: string; src: string }[] {
  const out: { path: string; src: string }[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...collect(full));
    else if (/\.tsx$/.test(name.name) && !/\.test\.tsx$/.test(name.name))
      out.push({ path: full.slice(full.indexOf("app/")), src: readFileSync(full, "utf8") });
  }
  return out;
})(resolve(process.cwd(), "app"));

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

  // 2026-08-20, the SWEEP. #92 fixed app.settings.tsx, the one route the reviewer
  // was told to visit. It was never the only one: app.tagged-shipments._index —
  // the second-most linked destination in the app — caught the same throw and
  // deliberately re-threw it, `if (err instanceof Response) throw err`, on the
  // belief that App Bridge would recover.
  //
  // Measured against react-router's own source rather than assumed. In
  // singleFetchLoaders, `handleQueryResult` returns `isResponse(result) ? result
  // : staticContextToResponse(result)`. A RESOURCE route (no component) makes
  // staticHandler.query return the Response itself, so it goes back untouched,
  // reauthorize headers intact, and App Bridge's patched fetch does see them —
  // bubbling there is correct. A route WITH A COMPONENT takes the other branch:
  // staticContextToResponse turbo-stream-encodes the throw as an ErrorResponse,
  // the headers never reach the browser, and the client renders `error.status`.
  // That is the "200 error page", and it is why this contract is scoped to
  // component routes only.
  it("a route with a component never re-throws a caught Response", () => {
    const offenders = componentRoutes
      .filter((f) => handlerBodies(f.src).some(rethrowsResponse))
      .map((f) => f.path);
    expect(
      offenders,
      "Re-throwing a reauthorize Response from a component route's loader/action renders the '200 error page' on client-side navigation: react-router turbo-stream-encodes the throw and the X-Shopify-API-Request-Failure-Reauthorize headers never reach App Bridge. Degrade to a fallback payload instead. Only resource routes (no component) may bubble a Response.",
    ).toEqual([]);
  });

  it("that re-throw detector fires on the code it was written for", () => {
    // The literal shape removed from app.tagged-shipments._index.tsx.
    const rejected = `
      export const loader = async ({ request }: LoaderFunctionArgs) => {
        const { admin } = await authenticate.admin(request);
        let response;
        try {
          response = await admin.graphql(query);
        } catch (err) {
          if (err instanceof Response) throw err;
          return { orders: [], error: "Failed to fetch orders" };
        }
        return { orders: [] };
      };
      export default function ShipmentsIndex() { return null; }
    `;
    const bodies = handlerBodies(rejected);
    expect(bodies).toHaveLength(1);
    expect(bodies.some(rethrowsResponse)).toBe(true);

    // and it does NOT fire once the re-throw is gone
    expect(handlerBodies(rejected.replace("if (err instanceof Response) throw err;", "")).some(rethrowsResponse)).toBe(false);
  });

  // 2026-08-20, the ACTUAL "200 error page". Polaris's UnstyledLink falls back to
  // a plain <a href> whenever AppProvider has no linkComponent. Inside the
  // embedded iframe that is a FULL DOCUMENT navigation: ?shop=&host=&id_token=
  // are dropped, the request arrives unauthenticated, and the server answers
  // with App Bridge's re-authorize page — status 200, rendered in the frame.
  //
  // Measured in Cloud Run: the back arrow logged `GET /app/settings` with no
  // authentication and no `/app/settings.data` ever. The loader was never
  // reached, which is why #88, #91 and #92 all missed it.
  it("Polaris AppProvider always routes urls through the router", () => {
    // Only POLARIS's AppProvider takes linkComponent. auth.login renders
    // Shopify's same-named AppProvider, which does not — resolve the local
    // alias from the import instead of matching the tag name blindly.
    const offenders: string[] = [];
    let checked = 0;
    for (const f of SOURCES) {
      const imp = f.src.match(
        /import\s*\{([^}]*)\}\s*from\s*["']@shopify\/polaris["']/,
      );
      if (!imp) continue;
      const alias = imp[1]
        .split(",")
        .map((x) => x.trim())
        .find((x) => /^AppProvider(\s+as\s+\w+)?$/.test(x));
      if (!alias) continue;
      const local = alias.includes(" as ") ? alias.split(/\s+as\s+/)[1].trim() : "AppProvider";
      for (const tag of f.src.match(new RegExp(`<${local}\\b[^>]*>`, "g")) ?? []) {
        checked++;
        if (!/linkComponent=/.test(tag)) offenders.push(`${f.path}: ${tag.slice(0, 60)}`);
      }
    }
    expect(checked, "no Polaris AppProvider found — did it move?").toBeGreaterThan(0);
    expect(
      offenders,
      "A Polaris AppProvider without linkComponent makes every `url` prop a plain <a href>. In an embedded app that is a full document navigation, it drops the session params, and the merchant gets the re-authorize page rendered as a '200 error page'. Pass a React Router Link.",
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
