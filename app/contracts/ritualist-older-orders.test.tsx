// LOAD MORE ON THE RITUALIST'S ORDERS (Sam, 2026-09-24, bringing ink's polish
// over). Pinned:
//   · the loader's `?older=` answers a page of ink's records, streamed with the
//     Ritualist's own row reader, and never throws — a failed read is `older: null`;
//   · "Load more" stands at the foot of the whole list only: newest first, no
//     search, the default dates, the last page.
// Made-up shop and orders: this repository is public.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../firestore.server", () => ({ default: {}, firestore: {}, app: {} }));
vi.mock("../shopify.server", () => ({
  authenticate: { admin: vi.fn(async () => ({ admin: { graphql: vi.fn() }, session: { shop: "example.myshopify.com" } })) },
}));
vi.mock("../services/ink-record.server", async (orig) => ({ ...(await orig<object>()), readJwks: vi.fn(async () => ({ keys: [] })) }));
vi.mock("../services/ink-links.server", async (orig) => ({
  ...(await orig<object>()),
  readShopZone: vi.fn(async () => "UTC"),
  readRecentOrderPage: vi.fn(async () => ({ rows: [], pageInfo: null })),
}));
vi.mock("../services/ritualist-rows.server", async (orig) => ({
  ...(await orig<object>()),
  ritualistApiKey: vi.fn(async () => "ink_key_example"),
  ritualistRowRecord: vi.fn(async () => ({ record: null, door: null, packet: null, timeline: null })),
}));
const readOlderOrders = vi.fn();
vi.mock("../services/ink-older-orders.server", () => ({ readOlderOrders: (...a: unknown[]) => readOlderOrders(...a) }));

const route = await import("../routes/app.tagged-shipments._index");
const Orders = route.default;

const realError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes("useLayoutEffect does nothing on the server")) return;
    realError(...args);
  };
});
afterAll(() => {
  console.error = realError;
});

const at = (url: string) => ({ request: new Request(url), params: {}, context: {} }) as never;
const OLDER = {
  id: "ink-record-proof_000000000000000000a10001",
  name: "#1001",
  proofId: "proof_000000000000000000a10001",
  createdAt: "2026-06-01T12:00:00.000Z",
  detail: { id: "1001", orderNumber: "#1001", customerName: "Made Up", date: "Jun 1, 2026", total: "10.00", items: [] },
};

describe("the loader's ?older= page", () => {
  it("answers ink's records as streamed rows, with the next cursor", async () => {
    readOlderOrders.mockResolvedValueOnce({ rows: [OLDER], next: "2026-05-01T00:00:00.000Z" });
    const data = (await route.loader(at("https://app.in.ink/app/tagged-shipments?older=2026-07-01T00%3A00%3A00.000Z"))) as any;
    expect(data.orders).toEqual([]);
    expect(data.older.next).toBe("2026-05-01T00:00:00.000Z");
    expect(data.older.rows.map((r: { name: string; createdAt: string }) => [r.name, r.createdAt])).toEqual([["#1001", "2026-06-01T12:00:00.000Z"]]);
    expect(readOlderOrders.mock.calls[0].slice(0, 2)).toEqual(["ink_key_example", "2026-07-01T00:00:00.000Z"]);
  });

  it("never throws: a failed read is older: null", async () => {
    readOlderOrders.mockRejectedValueOnce(new Error("down"));
    const data = (await route.loader(at("https://app.in.ink/app/tagged-shipments?older=2026-07-01T00%3A00%3A00.000Z"))) as any;
    expect(data.older).toBeNull();
  });
});

describe("Load more, at the foot of the whole list only", () => {
  const draw = (screen: Record<string, unknown>, search = "") => {
    const Stub = createRoutesStub([{ id: "screen", path: "/app/tagged-shipments", Component: () => (<AppProvider i18n={translations}><Orders /></AppProvider>) }]);
    return renderToString(
      <Stub
        initialEntries={[`/app/tagged-shipments${search}`]}
        hydrationData={{ loaderData: { screen: { orders: [], pageInfo: null, ordersError: false, search: "", sort: "newest", ...screen } } }}
      />,
    );
  };

  it("offers it on the whole list, newest first", () => {
    expect(draw({})).toContain("Load more");
  });

  it("not under a search, another sort, a failed read, or a page with more after it", () => {
    expect(draw({ search: "1042" }, "?q=1042")).not.toContain("Load more");
    expect(draw({ sort: "oldest" })).not.toContain("Load more");
    expect(draw({ ordersError: true })).not.toContain("Load more");
    expect(draw({ pageInfo: { hasNextPage: true, hasPreviousPage: false, startCursor: "a", endCursor: "b" } })).not.toContain("Load more");
  });
});
