// THE CHECKOUT'S FACTS, REDUCED AT ENROL — the way the backend reads an open.
//
// The vectors file is ink-backend's tests/checkout-client.vectors.json, byte
// for byte: a comparison between the checkout and the opens is only a
// comparison when both sides read a user agent and an address the same way.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  browserOf,
  checkoutClientFromWebhook,
  checkoutDetailsEnabled,
  deviceOf,
  ipPrefixOf,
  osOf,
} from "./checkout-client.server";

const vectors = JSON.parse(readFileSync(new URL("./checkout-client.vectors.json", import.meta.url), "utf8")) as {
  user_agents: { ua: string; device: string; browser: string; os: string }[];
  ip_prefixes: { ip: string; prefix: string | null }[];
};

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("the checkout is read the way the backend reads an open (the shared vectors)", () => {
  it("a user agent → the record's device word, a browser and an OS", () => {
    for (const v of vectors.user_agents) {
      expect([deviceOf(v.ua), browserOf(v.ua), osOf(v.ua)], v.ua).toEqual([v.device, v.browser, v.os]);
    }
    for (const empty of ["", "  ", null, undefined, 42]) {
      expect([deviceOf(empty), browserOf(empty), osOf(empty)]).toEqual([null, null, null]);
    }
  });

  it("an address → the /24 or /48 proxy triage keeps for an open, never the address", () => {
    for (const v of vectors.ip_prefixes) expect(ipPrefixOf(v.ip), JSON.stringify(v.ip)).toBe(v.prefix);
    expect(ipPrefixOf(null)).toBeNull();
  });
});

describe("checkoutClientFromWebhook — Shopify's client_details, reduced at once", () => {
  const body = {
    id: 1001,
    browser_ip: "203.0.113.7",
    client_details: {
      accept_language: "en-US,en;q=0.9",
      browser_height: 844,
      browser_ip: "203.0.113.7",
      browser_width: 390,
      session_hash: "d8f3a1c0ffee",
      user_agent: IPHONE_SAFARI,
    },
  };

  it("keeps the prefix, the words, the language as sent and the window size — and nothing raw", () => {
    const cc = checkoutClientFromWebhook(body);
    expect(cc).toEqual({
      ip_prefix: "203.0.113.0/24",
      device: "iPhone",
      browser: "Safari",
      os: "iOS",
      accept_language: "en-US,en;q=0.9",
      browser_width: 390,
      browser_height: 844,
    });
    const text = JSON.stringify(cc);
    for (const raw of ["203.0.113.7", "Mozilla", "AppleWebKit", "d8f3a1c0ffee", "session", "user_agent"]) {
      expect(text.includes(raw), raw).toBe(false);
    }
  });

  it("the top-level browser_ip is read when client_details carries none", () => {
    expect(checkoutClientFromWebhook({ browser_ip: "2600:1700:ab12:3c40::9", client_details: { user_agent: IPHONE_SAFARI } })).toEqual({
      ip_prefix: "2600:1700:ab12::/48",
      device: "iPhone",
      browser: "Safari",
      os: "iOS",
    });
  });

  it("an order Shopify sent without client details (draft, POS, app-made) reduces to nothing", () => {
    for (const b of [{}, { client_details: null, browser_ip: null }, { client_details: [] }, null, "x"]) {
      expect(checkoutClientFromWebhook(b)).toBeNull();
    }
  });

  it("a field the backend would refuse is not sent (bounded language, whole pixels, a real prefix)", () => {
    const cc = checkoutClientFromWebhook({
      browser_ip: "not an ip",
      client_details: { accept_language: "en<script>", browser_width: 390.5, browser_height: "844", user_agent: "" },
    });
    expect(cc).toBeNull();
  });
});

describe("the switch", () => {
  it("is off unless it says exactly true", () => {
    expect(checkoutDetailsEnabled({})).toBe(false);
    expect(checkoutDetailsEnabled({ CHECKOUT_DETAILS_ENABLED: "1" })).toBe(false);
    expect(checkoutDetailsEnabled({ CHECKOUT_DETAILS_ENABLED: "TRUE" })).toBe(false);
    expect(checkoutDetailsEnabled({ CHECKOUT_DETAILS_ENABLED: "true" })).toBe(true);
  });
});
