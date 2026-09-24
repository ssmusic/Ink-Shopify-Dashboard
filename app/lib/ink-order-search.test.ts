import { describe, expect, it } from "vitest";
import {
  ALL_ORDER_DATES,
  ORDER_DATE_OPTIONS,
  dayStart,
  orderDateBounds,
  orderDates,
  orderDatesParams,
  orderDay,
  orderSearch,
  orderSort,
  shopifyOrderDates,
  shopifyOrderSearch,
  shopifyOrderSort,
  orderSearchParams,
} from "./ink-order-search";

describe("merchant order search", () => {
  it("normalizes blank and long input without treating it as filters", () => {
    expect(orderSearch(null)).toBe("");
    expect(orderSearch("  Alex\n  Sample  ")).toBe("Alex Sample");
    expect(orderSearch("x".repeat(250))).toHaveLength(200);
    expect(shopifyOrderSearch(" \n ")).toBeNull();
    expect(shopifyOrderSearch("status:open OR *")).toBe(
      '"status:open" AND "OR" AND "*"',
    );
    expect(shopifyOrderSearch('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
  it("searches an order number or email in the matching Shopify field", () => {
    expect(shopifyOrderSearch("#1026")).toBe('name:"1026"');
    expect(shopifyOrderSearch("1026")).toBe('name:"1026"');
    expect(shopifyOrderSearch("alex@example.com")).toBe(
      'email:"alex@example.com"',
    );
    expect(shopifyOrderSearch("Alex Sample")).toBe('"Alex" AND "Sample"');
  });
  it.each([
    ["newest", "CREATED_AT", true],
    ["oldest", "CREATED_AT", false],
    ["number_desc", "ORDER_NUMBER", true],
    ["number_asc", "ORDER_NUMBER", false],
    ["total_desc", "TOTAL_PRICE", true],
    ["total_asc", "TOTAL_PRICE", false],
  ])("maps %s to Shopify sorting", (sort, sortKey, reverse) => {
    expect(shopifyOrderSort(sort)).toEqual({ sortKey, reverse });
  });
  it("falls back to newest for unknown sorts", () => {
    expect(orderSort("unsupported")).toBe("newest");
    expect(shopifyOrderSort(null)).toEqual({
      sortKey: "CREATED_AT",
      reverse: true,
    });
  });
  it("resets pagination and keeps embedded context when filters change", () => {
    const original = new URLSearchParams(
      "shop=sample.myshopify.com&host=embedded&after=old&before=old&page=2&view=orders&q=previous&sort=oldest",
    );
    const next = orderSearchParams(original, " #1026 ", "total_desc");
    expect(Object.fromEntries(next)).toEqual({
      shop: "sample.myshopify.com",
      host: "embedded",
      q: "#1026",
      sort: "total_desc",
    });
    expect(original.get("after")).toBe("old");
    expect(Object.fromEntries(orderSearchParams(next, "", "newest"))).toEqual({
      shop: "sample.myshopify.com",
      host: "embedded",
    });
  });
});

// Sam, 2026-09-24: "we should have a predictable filter ---- last 60 days and
// all etc and a range of dates".
describe("the ledger's dates", () => {
  const NOW = Date.parse("2026-09-24T15:30:45.123Z");
  const at = (query: string) => orderDates(new URLSearchParams(query));

  it("offers the web app's presets up to Shopify's 60 days, and custom dates", () => {
    expect(ORDER_DATE_OPTIONS.map((o) => o.label)).toEqual(["Last 7 days", "Last 30 days", "Last 60 days", "Custom dates"]);
    expect(ALL_ORDER_DATES).toEqual({ range: "60d", from: null, to: null });
  });

  it("reads the dates a URL asks for, and anything else as the whole window", () => {
    expect(at("")).toEqual(ALL_ORDER_DATES);
    expect(at("dates=7d")).toEqual({ range: "7d", from: null, to: null });
    expect(at("dates=30d&from=2026-09-01")).toEqual({ range: "30d", from: null, to: null });
    expect(at("dates=all")).toEqual(ALL_ORDER_DATES);
    expect(at("dates=custom&from=2026-09-01&to=2026-09-15")).toEqual({ range: "custom", from: "2026-09-01", to: "2026-09-15" });
    // Backwards is the same days; one end is open; no readable day is no filter.
    expect(at("dates=custom&from=2026-09-15&to=2026-09-01")).toEqual({ range: "custom", from: "2026-09-01", to: "2026-09-15" });
    expect(at("dates=custom&from=2026-09-01")).toEqual({ range: "custom", from: "2026-09-01", to: null });
    expect(at("dates=custom&from=2026-02-30&to=nope")).toEqual(ALL_ORDER_DATES);
  });

  it("takes only real calendar days", () => {
    for (const day of ["2026-09-01", "2028-02-29"]) expect(orderDay(day)).toBe(day);
    for (const bad of ["2026-02-30", "2026-9-1", "2026-13-01", "1969-12-31", "01/09/2026", "2026-09-01'", null, 20260901]) expect(orderDay(bad)).toBeNull();
  });

  it("counts a preset back from now, to the second, as the web app does", () => {
    expect(shopifyOrderDates({ range: "7d", from: null, to: null }, NOW)).toBe("created_at:>='2026-09-17T15:30:45Z'");
    expect(shopifyOrderDates({ range: "30d", from: null, to: null }, NOW)).toBe("created_at:>='2026-08-25T15:30:45Z'");
  });

  it("asks Shopify for nothing more when the dates are the whole window", () => {
    expect(shopifyOrderDates(ALL_ORDER_DATES, NOW)).toBeNull();
  });

  it("counts custom dates as whole days in the shop's own zone, the last day included", () => {
    const custom = { range: "custom" as const, from: "2026-09-01", to: "2026-09-15" };
    expect(shopifyOrderDates(custom, NOW, "America/New_York")).toBe(
      "created_at:>='2026-09-01T04:00:00Z' AND created_at:<'2026-09-16T04:00:00Z'",
    );
    expect(shopifyOrderDates(custom, NOW, "Asia/Tokyo")).toBe(
      "created_at:>='2026-08-31T15:00:00Z' AND created_at:<'2026-09-15T15:00:00Z'",
    );
    expect(shopifyOrderDates(custom, NOW)).toBe(
      "created_at:>='2026-09-01T00:00:00Z' AND created_at:<'2026-09-16T00:00:00Z'",
    );
    expect(shopifyOrderDates({ range: "custom", from: null, to: "2026-09-15" }, NOW, "UTC")).toBe("created_at:<'2026-09-16T00:00:00Z'");
    expect(shopifyOrderDates({ range: "custom", from: null, to: null }, NOW)).toBeNull();
  });

  it("finds the day's first instant across a clock change, and falls back to UTC for a zone it does not know", () => {
    // London's clocks go forward at 01:00 on 2026-03-29 and back at 02:00 on 2026-10-25.
    expect(new Date(dayStart("2026-03-29", "Europe/London")).toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(new Date(dayStart("2026-03-30", "Europe/London")).toISOString()).toBe("2026-03-29T23:00:00.000Z");
    expect(new Date(dayStart("2026-10-26", "Europe/London")).toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(new Date(dayStart("2026-09-01", "Not/AZone")).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("lets a custom pick reach back to Shopify's window, a day early", () => {
    expect(orderDateBounds(NOW)).toEqual({ min: "2026-07-25" });
  });

  it("changing the dates keeps the search and the store, and starts the pages over", () => {
    const current = new URLSearchParams("shop=sample.myshopify.com&host=embedded&q=%231026&sort=oldest&after=old&before=old&dates=custom&from=2026-09-01&to=2026-09-02");
    expect(Object.fromEntries(orderDatesParams(current, { range: "7d", from: null, to: null }))).toEqual({
      shop: "sample.myshopify.com", host: "embedded", q: "#1026", sort: "oldest", dates: "7d",
    });
    expect(Object.fromEntries(orderDatesParams(current, { range: "custom", from: "2026-09-10", to: "2026-09-03" }))).toEqual({
      shop: "sample.myshopify.com", host: "embedded", q: "#1026", sort: "oldest", dates: "custom", from: "2026-09-03", to: "2026-09-10",
    });
    expect(Object.fromEntries(orderDatesParams(current, ALL_ORDER_DATES))).toEqual({
      shop: "sample.myshopify.com", host: "embedded", q: "#1026", sort: "oldest",
    });
    expect(Object.fromEntries(orderDatesParams(current, { range: "custom", from: "bad", to: null }))).toEqual({
      shop: "sample.myshopify.com", host: "embedded", q: "#1026", sort: "oldest",
    });
  });

  it("a new search or sort keeps the dates", () => {
    const current = new URLSearchParams("dates=custom&from=2026-09-01&to=2026-09-15&after=old");
    expect(Object.fromEntries(orderSearchParams(current, "Alex", "oldest"))).toEqual({
      dates: "custom", from: "2026-09-01", to: "2026-09-15", q: "Alex", sort: "oldest",
    });
  });
});
