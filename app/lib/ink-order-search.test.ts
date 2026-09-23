import { describe, expect, it } from "vitest";
import {
  orderSearch,
  orderSort,
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
