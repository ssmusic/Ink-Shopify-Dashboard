// THE BLOCK ON THE ORDER STATUS PAGE — outcome tests.
//
// This module is the only buyer-facing code in the repo that typecheck and
// build never see (plain JS, outside tsconfig's include, bundled only by
// `shopify app deploy`). What it decides is which address a buyer taps out of
// a shipping email — so the guard and the silence both get pinned here.
//
// The bugs these exist to catch:
//  · a plausible-but-wrong host reaching a buyer (the Clare-V law; #1016's
//    sm-test-hhawzn52.in.ink)
//  · a downgrade to http, or an off-brand host smuggled through the gate
//  · another app's metafield, or a metafield on another owner, read as ours
//  · the block painting a surface when it has no link — a heading and a dead
//    button is worse than nothing on a page a buyer reached from an email
//  · a signal shape change silently blanking the block
//  · the block reaching for the network on a page it must never slow
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import block, {
  DOOR_KEY,
  isOrderDoorBase,
  doorBaseFromAppMetafields,
  orderDigitsFromName,
  linkForOrder,
} from "./order-page-block.js";

/** One appMetafields entry in the shape the runtime delivers. */
function entry(value, { key = DOOR_KEY, type = "shop" } = {}) {
  return { target: { type, id: "gid://shopify/Shop/1" }, metafield: { key, value } };
}

/** A signal, the way the runtime hands appMetafields over. */
function signal(value) {
  return { value, subscribe: () => {} };
}

describe("the door gate", () => {
  it("passes the door the embed's writer produces", () => {
    expect(isOrderDoorBase("https://stevemadden.in.ink/o/")).toBe(true);
    expect(isOrderDoorBase("https://betsey-johnson.in.ink/o/")).toBe(true);
    expect(isOrderDoorBase("  https://stevemadden.in.ink/o/  ")).toBe(true);
  });

  it("refuses every address that is not one of ours", () => {
    for (const bad of [
      "http://stevemadden.in.ink/o/", //          downgraded scheme
      "https://evil.example.com/o/", //           foreign host
      "https://in.ink/o/", //                     no brand label
      "https://a.b.in.ink/o/", //                 a label under a label
      "https://stevemadden.in.ink.evil.com/o/", // lookalike suffix
      "https://StevEMadden.in.ink/o/", //         uppercase host
      "https://user@stevemadden.in.ink/o/", //    userinfo
      "https://stevemadden.in.ink:8443/o/", //    a port
      "https://stevemadden.in.ink/o", //          not the door path
      "https://stevemadden.in.ink/r/nfc_x", //    a page, not a door base
      "https://stevemadden.in.ink/o/?x=1", //     a query
      "javascript:alert(1)", //                   not a URL at all
      "",
      null,
      undefined,
    ]) {
      expect(isOrderDoorBase(bad), `gate let through: ${String(bad)}`).toBe(false);
    }
  });
});

describe("reading the shop's door", () => {
  it("takes the door out of a signal and out of a bare array alike", () => {
    const door = "https://stevemadden.in.ink/o/";
    expect(doorBaseFromAppMetafields(signal([entry(door)]))).toBe(door);
    expect(doorBaseFromAppMetafields([entry(door)])).toBe(door);
  });

  it("is null when the runtime hands over nothing it can read", () => {
    for (const empty of [undefined, null, [], signal([]), signal(undefined), {}]) {
      expect(doorBaseFromAppMetafields(empty)).toBeNull();
    }
  });

  it("ignores another key, and a door on any owner but the shop", () => {
    const door = "https://stevemadden.in.ink/o/";
    expect(doorBaseFromAppMetafields([entry(door, { key: "page_url" })])).toBeNull();
    expect(doorBaseFromAppMetafields([entry(door, { type: "customer" })])).toBeNull();
    // An entry whose target the runtime did not name is still ours to read.
    expect(
      doorBaseFromAppMetafields([{ metafield: { key: DOOR_KEY, value: door } }]),
    ).toBe(door);
  });

  it("refuses a bad value rather than passing it on", () => {
    expect(doorBaseFromAppMetafields([entry("https://evil.example.com/o/")])).toBeNull();
    expect(doorBaseFromAppMetafields([entry("")])).toBeNull();
  });
});

describe("the order number", () => {
  it("is digits only — the door compares on digits alone", () => {
    expect(orderDigitsFromName("#1023")).toBe("1023");
    expect(orderDigitsFromName("1023")).toBe("1023");
    expect(orderDigitsFromName("SM #1023")).toBe("1023");
  });

  it("is empty when there is no name to read", () => {
    for (const none of ["", "  ", "#", null, undefined]) {
      expect(orderDigitsFromName(none)).toBe("");
    }
  });
});

describe("the link", () => {
  it("is the brand's door with this order's digits on the end", () => {
    expect(
      linkForOrder({
        appMetafields: signal([entry("https://stevemadden.in.ink/o/")]),
        orderName: "#1027",
      }),
    ).toBe("https://stevemadden.in.ink/o/1027");
  });

  it("is null when either half is missing — never a half-built address", () => {
    const door = signal([entry("https://stevemadden.in.ink/o/")]);
    expect(linkForOrder({ appMetafields: door, orderName: "" })).toBeNull();
    expect(linkForOrder({ appMetafields: signal([]), orderName: "#1027" })).toBeNull();
    expect(linkForOrder({})).toBeNull();
    expect(linkForOrder()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The render itself. The runtime gives this module two globals and a DOM; the
// fakes below are the smallest thing that answers what it actually calls.
// ---------------------------------------------------------------------------

function fakeDom() {
  const make = (tag) => ({
    tag,
    attrs: {},
    children: [],
    textContent: "",
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    append(...kids) {
      this.children.push(...kids);
    },
  });
  const body = { ...make("body"), replaceChildren() { this.children = []; } };
  return { body, createElement: make };
}

/** Run the extension's default export against fake globals; hand back the body. */
async function renderWith({ appMetafields, order }) {
  const dom = fakeDom();
  const priorDocument = globalThis.document;
  const priorShopify = globalThis.shopify;
  globalThis.document = dom;
  globalThis.shopify = { appMetafields, order };
  try {
    await block();
  } finally {
    globalThis.document = priorDocument;
    globalThis.shopify = priorShopify;
  }
  return dom.body;
}

/** Every href anywhere in the rendered tree. */
function hrefs(node) {
  const found = node.attrs && node.attrs.href ? [node.attrs.href] : [];
  for (const kid of node.children || []) found.push(...hrefs(kid));
  return found;
}

describe("what the buyer sees", () => {
  const door = signal([entry("https://stevemadden.in.ink/o/")]);
  const order = signal({ name: "#1027" });

  it("renders one link, to this order's door", async () => {
    const body = await renderWith({ appMetafields: door, order });
    expect(body.children).toHaveLength(1);
    expect(hrefs(body)).toEqual(["https://stevemadden.in.ink/o/1027"]);
  });

  it("renders NOTHING when the shop has no door", async () => {
    const body = await renderWith({ appMetafields: signal([]), order });
    expect(body.children).toEqual([]);
  });

  it("renders NOTHING when the door is not one of ours", async () => {
    const body = await renderWith({
      appMetafields: signal([entry("https://evil.example.com/o/")]),
      order,
    });
    expect(body.children).toEqual([]);
  });

  it("renders NOTHING when the order has no number yet", async () => {
    const body = await renderWith({ appMetafields: door, order: signal(undefined) });
    expect(body.children).toEqual([]);
  });

  it("renders NOTHING when the runtime hands over neither signal", async () => {
    const body = await renderWith({ appMetafields: undefined, order: undefined });
    expect(body.children).toEqual([]);
  });

  it("re-renders when a signal fills after first paint", async () => {
    // The runtime may deliver appMetafields empty and fill it a beat later.
    // Nothing at first paint must not mean nothing forever.
    const listeners = [];
    const late = { value: [], subscribe: (fn) => listeners.push(fn) };
    const dom = fakeDom();
    const priorDocument = globalThis.document;
    const priorShopify = globalThis.shopify;
    globalThis.document = dom;
    globalThis.shopify = { appMetafields: late, order };
    try {
      await block();
      expect(dom.body.children).toEqual([]);
      late.value = [entry("https://stevemadden.in.ink/o/")];
      expect(listeners).not.toHaveLength(0);
      for (const fn of listeners) fn();
      expect(hrefs(dom.body)).toEqual(["https://stevemadden.in.ink/o/1027"]);
    } finally {
      globalThis.document = priorDocument;
      globalThis.shopify = priorShopify;
    }
  });
});

describe("what the block must never do", () => {
  const SRC = readFileSync(fileURLToPath(new URL("./order-page-block.js", import.meta.url)), "utf8");

  it("never touches the network — the order status page is not ours to slow", () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest|sendBeacon|import\s*\(/);
  });

  it("carries no hardcoded brand host — the door is always read, never guessed", () => {
    // Comments name real hosts as evidence; code must not.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/[a-z0-9-]+\.in\.ink/);
  });
});
