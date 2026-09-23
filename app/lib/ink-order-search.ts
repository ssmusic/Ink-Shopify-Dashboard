export const ORDER_SORT_OPTIONS = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Order number, high to low", value: "number_desc" },
  { label: "Order number, low to high", value: "number_asc" },
  { label: "Total, high to low", value: "total_desc" },
  { label: "Total, low to high", value: "total_asc" },
] as const;
export type InkOrderSort = (typeof ORDER_SORT_OPTIONS)[number]["value"];
export function orderSort(value: unknown): InkOrderSort {
  return ORDER_SORT_OPTIONS.some((option) => option.value === value)
    ? (value as InkOrderSort)
    : "newest";
}
export function orderSearch(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 200)
    : "";
}

/** A plain-text search, never executable Shopify filter syntax. */
export function shopifyOrderSearch(value: unknown): string | null {
  const text = orderSearch(value);
  if (!text) return null;
  const quote = (term: string) => `"${term.replace(/[\\"]/g, "\\$&")}"`;
  if (/^#?\d+$/.test(text)) return `name:${quote(text.replace(/^#/, ""))}`;
  if (text.includes("@")) return `email:${quote(text)}`;
  return text.split(" ").map(quote).join(" AND ");
}
export function shopifyOrderSort(value: unknown) {
  const sort = orderSort(value);
  return {
    sortKey: sort.startsWith("number_")
      ? "ORDER_NUMBER"
      : sort.startsWith("total_")
        ? "TOTAL_PRICE"
        : "CREATED_AT",
    reverse: sort === "newest" || sort.endsWith("_desc"),
  };
}

/** Preserve embedded Shopify context; discard cursors when a filter changes. */
export function orderSearchParams(
  current: URLSearchParams,
  search: string,
  sort: InkOrderSort,
) {
  const next = new URLSearchParams(current);
  for (const key of ["after", "before", "page", "view"]) next.delete(key);
  const q = orderSearch(search);
  if (q) next.set("q", q);
  else next.delete("q");
  if (sort !== "newest") next.set("sort", orderSort(sort));
  else next.delete("sort");
  return next;
}
