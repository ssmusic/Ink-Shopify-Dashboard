// INK'S TWO SCREENS RENDER — server-side, with the loader data each stage
// produces, inside the same Polaris provider the layout gives them.
//
// tsc proves the props exist; only a render proves the tree stands. Each
// stage of the onboarding screen and both settings states are rendered to
// HTML and read back for the words a merchant would see, so a broken prop
// combination or a hook outside its router fails here rather than in a
// merchant's admin.

import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("../services/ink-install.server", () => ({ captureInkMark: vi.fn(), readShopIdentity: vi.fn() }));
vi.mock("../services/ink-merchant.server", () => ({
  readInkMerchant: vi.fn(),
  markOf: vi.fn(),
  brandNameOf: vi.fn(),
  stageOf: vi.fn(),
  flashForwardOf: vi.fn(),
  FLASH_FORWARDS: ["order_status", "carrier"],
}));
vi.mock("../services/merchant.server", () => ({ updateMerchant: vi.fn() }));
vi.mock("../services/ink-api.server", () => ({ patchMerchant: vi.fn(), mintMagicToken: vi.fn() }));

const { default: InkHome } = await import("../routes/app.ink._index");
const { default: InkSettings } = await import("../routes/app.ink.settings");
const { default: InkKpis } = await import("../components/InkKpis");
const { default: OrderTimeline, DeliveryWindowBar } = await import("../components/OrderTimeline");
const { timelineFrom } = await import("../services/ink-timeline.server");
const { dashboardFrom } = await import("../services/ink-delivery.server");
const { default: InkRecentOrders, RecordWords } = await import("../components/InkRecentOrders");
const { default: OrderExpandedRow } = await import("../components/OrderExpandedRow");

/** Render one route component with its loader data, the way the layout does. */
function render(Component: React.ComponentType, loaderData: Record<string, unknown>): string {
  const Stub = createRoutesStub([
    {
      id: "screen",
      path: "/",
      Component: () => (
        <AppProvider i18n={translations}>
          <Component />
        </AppProvider>
      ),
    },
  ]);
  // The onboarding loader's recent orders default to none, so each stage's
  // fixture names only what it is about.
  return renderToString(<Stub initialEntries={["/"]} hydrationData={{ loaderData: { screen: { recentOrders: [], ...loaderData } } }} />);
}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// React warns that RouterProvider's useLayoutEffect does nothing on the
// server — true, and beside the point of a string render.
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

// A record as the backend's public read answers it (GET /verify/:id, Corvara #1010, 2026-09-23).
const RECORD = {
  locked: true,
  summary: { order_number: "#1010", buyer_initials: "SM", opens: 1, first_open_at: "2026-08-20T18:52:44.174Z" },
  elements: [
    { element: "order", label: "Order", status: "attested", value: { order_number: "#1010", enrolled_at: "2026-08-20T18:50:54.195Z" } },
    { element: "buyer", label: "Buyer", status: "attested", value: { tier: "new" } },
    { element: "delivery_date", label: "Delivery date", status: "missing", value: null },
    { element: "delivery_place", label: "Delivery place", status: "attested", value: { geocoded: true, verified_at_door: false } },
    { element: "carrier_scan", label: "Carrier scan", status: "missing", value: null },
    { element: "the_open", label: "The open", status: "verified", value: { first_open_at: "2026-08-20T18:52:44.174Z", first_open_signed: true, opens: 1, signed_opens: 1, non_human_opens: 0, location: { verdict: "flagged", distance_m: 719, accuracy_m: 35, signed: false } } },
  ],
};
const PROOF = "proof_aec827b527fb30457c1da890";
const detail = (over: Record<string, unknown> = {}) => ({
  id: "2", orderNumber: "#1010", customerName: "Made Up", customerEmail: "buyer@example.com",
  customerAddress: { address1: "1 Test St", city: "Brooklyn", provinceCode: "NY", zip: "11201" },
  date: "Aug 20, 2026", total: "58.00", subtotal: "58.00", currency: "USD", status: "enrolled",
  items: [{ title: "Bar Tape", quantity: 2, price: "29.00", sku: "BT-1" }], metafields: {}, ...over,
});
const ROWS = [
  { id: "gid://shopify/Order/2", name: "#1010", proofId: PROOF, detail: detail(), record: RECORD, door: { offerLine: "Get the record ($29 USD)", purchase: null } },
  { id: "gid://shopify/Order/1", name: "#1011", proofId: null, detail: detail({ id: "1", orderNumber: "#1011", customerName: "Name unavailable", customerEmail: "", items: [] }), record: null, door: { offerLine: null, purchase: null } },
];
const openRow = (id: string) =>
  renderToString(
    <AppProvider i18n={translations}>
      {(() => {
        const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecentOrders orders={ROWS} defaultExpandedId={id} /> }]);
        return <Stub initialEntries={["/"]} />;
      })()}
    </AppProvider>,
  );

describe('ink screens: facts, working controls and Polaris', () => {
  it('shows recent orders with neutral distances and no invented shipping price', () => {
    const t = text(render(InkHome, { stage: 'ready', recentOrders: ROWS }));
    for (const part of ['Orders', '#1010', 'Made Up', '$58.00', '1 open', '719 m from the delivery address']) expect(t).toContain(part);
    for (const gone of ['Outside 300', 'flagged', 'Shipping Free', 'Your mark', 'Upload your own', 'PLACEHOLDER']) expect(t).not.toContain(gone);
  });

  it('opens an order with its address, products and Advanced disclosure', () => {
    const html = openRow(ROWS[0].id);
    const t = text(html);
    for (const part of ['Recipient', 'Order email: buyer@example.com', '1 Test St', 'Products', 'Bar Tape', 'Order total $58.00', 'Advanced', 'Get the record ($29 USD)']) expect(t).toContain(part);
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toMatch(/href="https?:\/\//);
    for (const gone of ['THE RECORD', 'CUSTOMER', 'attach as a file', 'Checked in this browser', 'Shipping Free']) expect(t).not.toContain(gone);
  });

  it('does not call the shipping recipient the buyer or invent missing contact and product details', () => {
    const t = text(openRow(ROWS[1].id));
    expect(t).toContain('Recipient unavailable');
    expect(t).toContain('Order email: Unavailable');
    expect(t).toContain('Product details are unavailable');
    expect(t).not.toContain('Customer');
  });

  it('keeps missing records and failed reads distinct from empty orders', () => {
    expect(text(openRow(ROWS[1].id))).toContain('No record is linked to this order.');
    expect(text(render(InkHome, { stage: 'ready', recentOrders: [] }))).toContain('No recent orders.');
    const failed = text(render(InkHome, { stage: 'ready', recentOrders: [], ordersError: true }));
    expect(failed).toContain('Orders could not be loaded');
    expect(failed).not.toContain('No recent orders');
  });

  it('shows a bounded setup state and a refresh action', () => {
    const t = text(render(InkHome, { stage: 'provisioning', recentOrders: [] }));
    expect(t).toContain('Setting up your store');
    expect(t).toContain('Refresh');
  });

  it('names the tab Dashboard and uses Polaris tabs with links', () => {
    const html = render(InkHome, { section: 'insights', stage: 'ready', kpis: null, delivery: null });
    expect(text(html)).toContain('Dashboard');
    expect(text(html)).not.toContain('Insights');
    expect(html).toContain('Polaris-Tabs');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('href="/app/ink/settings"');
  });

  it('has exactly three KPI labels, no subtitles or unsupported integrity claims', () => {
    const html = renderToString(<AppProvider i18n={translations}><InkKpis kpis={{recorded:12, opened:7, locationShared:2, capped:false}} /></AppProvider>);
    const t = text(html);
    expect((html.match(/<h2/g) || []).length).toBe(3);
    for (const part of ['Orders', 'Open', 'Location shared', '12', '7', '2']) expect(t).toContain(part);
    for (const gone of ['Orders recorded', 'Opened', 'Signed', '100%', 'Disputed', '58 in every 100']) expect(t).not.toContain(gone);
  });

  it('does not turn unavailable Dashboard data into zero or an empty state', () => {
    const t = text(render(InkHome, { section:'insights', stage:'ready', kpis:null, delivery:null }));
    expect(t).toContain('Dashboard unavailable');
    expect(t).not.toMatch(/No orders|Nothing shipped/);
  });

  it('shows supported delivery measures with their real denominators', () => {
    const delivery = dashboardFrom({ rows: [
      { enrolled_at:'2026-09-01T00:00:00Z', delivered_at:'2026-09-02T06:00:00Z', tap_count:1, location_source:'gps', verified_at_door:true, last_tracking_status:'DELIVERED' },
      { delivered_at:'2026-09-02T06:00:00Z' }
    ], taps:[], capped:true });
    const t = text(render(InkHome, { section:'insights', stage:'ready', kpis:null, delivery }));
    for (const part of ['Delivery and opens', 'Time to delivery', 'Median 30 h from recording to delivery', '1 of 2 delivered orders', 'Delivery status', 'Opens without a tracking update', 'Movement times are unavailable', 'up to 2,000']) expect(t).toContain(part);
    for (const gone of ['Getting there', 'While they waited', 'What the carrier said', 'Did it arrive', 'Time in transit']) expect(t).not.toContain(gone);
  });

  it('offers a real JSON download only when the record is available', () => {
    const html = render(() => <InkRecentOrders orders={[{...ROWS[0], door:{offerLine:null, downloadable:true}}]} defaultExpandedId={ROWS[0].id} />, {});
    expect(text(html)).toContain('Download record');
    expect(text(html)).toContain('JSON file');
    expect(text(html)).not.toMatch(/PDF|attach as a file|Did you win/);
  });

  it('describes an approved charge as waiting for record access, without a second approval action', () => {
    const html = render(() => <InkRecentOrders orders={[{
      ...ROWS[0],
      door: { offerLine: null, pending: true, paidPendingRecord: true, resumeUrl: null, downloadable: false },
    }]} defaultExpandedId={ROWS[0].id} />, {});
    const t = text(html);
    expect(t).toContain('Shopify approved the charge, but the record is not available yet.');
    expect(t).toContain('Check record access');
    expect(t).not.toContain('Check payment status');
    expect(t).not.toContain('Continue Shopify approval');
    expect(t).not.toContain('Get the record ($29 USD)');
    expect(t).not.toContain('Payment is pending');
  });

  it('shows record evidence as reported, without claiming browser verification', () => {
    const t = text(renderToString(<AppProvider i18n={translations}><RecordWords record={RECORD} /></AppProvider>));
    for (const part of ['Evidence levels reported by the record', 'Recorded and signed', 'Device verified', 'First open signed', 'Seen at the door', '719 m from the delivery address']) expect(t).toContain(part);
    expect(t).not.toMatch(/flagged|Confirmed at the door|Checked in this browser|outside|default range/);
  });

  it('shows purchased event metadata without claiming independent verification', () => {
    const unlocked = { ...RECORD, locked: false, eventCount: 1, events: [{ id: 'event_12345678', type: 'TAP_RECORDED', at: '2026-09-20T00:00:00Z', sequence: 1, signed: true, hash: true, legacy: false }] };
    const t = text(renderToString(<AppProvider i18n={translations}><RecordWords record={unlocked} /></AppProvider>));
    expect(t).toContain('Recorded events');
    expect(t).toContain('Tap recorded');
    expect(t).toContain('Signature supplied');
    expect(t).toContain('this screen does not verify them independently');
    expect(t).not.toContain('Signature verified');
  });

  it('shows record history with a repeat download and an honest missing-purchase path', () => {
    const html = render(InkHome, { section: 'records', stage: 'ready', recordHistory: [{ proofId: PROOF, orderName: '#1010', createdAt: '2026-09-20T00:00:00Z', state: 'minted', door: { offerLine: null, pending: false, downloadable: true }, record: { ...RECORD, locked: false } }], historyError: false, historyPage: 1, historyHasNext: false, historyHasPrevious: false });
    const t = text(html);
    expect(t).toContain('Record purchases');
    expect(t).toContain('Download record');
    expect(t).toContain('View record details');
    expect(t).toContain('Ink does not email the file');
    expect(t).toContain('If a past purchase is missing');
  });

  it('uses an accessible blue distance diagram and exact measurements without a range verdict', () => {
    const html = renderToString(<AppProvider i18n={translations}><OrderTimeline data={timelineFrom({enrolled_at:'2026-09-01T00:00:00Z'}, {address:{lat:34,lng:-118}, opens:[{at:'2026-09-02T00:00:00Z',outcome:'success',gps_verdict:'flagged',distance_m:719,accuracy_m:35,lat:34.005,lng:-118.004}]}, RECORD)!} addressLabel="1 Test St, Brooklyn, NY" /></AppProvider>);
    const t = text(html);
    for (const part of ['Order activity','1 Test St','100 m','300 m','Opened 719 m from the delivery address.','Location accuracy 35 m']) expect(t).toContain(part);
    expect(html).toContain('role="img"');
    expect(html).toContain('var(--p-color-text-info)');
    for (const gone of ['default range','outside the 300','within the 100','THE ORDER','34.005','-118.004','OpenStreetMap']) expect(t).not.toContain(gone);
  });

  it('never guesses arrival against a promised window', () => {
    const t = text(renderToString(<AppProvider i18n={translations}><DeliveryWindowBar w={{deliveredAt:'2026-09-01T00:00:00Z',windowEnd:'2026-09-03T00:00:00Z',firstOpenAt:'2026-09-01T05:00:00Z',hoursToOpen:5,openPositionPct:10,withinExpectedWindow:true}} /></AppProvider>));
    expect(t).toContain('Recording window ends');
    expect(t).toContain('5 hours after delivery');
    expect(t).not.toMatch(/promised|expected|within|Yes/);
  });

  it('saves a destination and does not promise a prompt-free or sign-in-free journey', () => {
    const html = render(InkSettings, {flashForward:'carrier',canSave:true,ritualistUrl:'https://apps.shopify.com/example-listing',privacy:[]});
    expect(html).toMatch(/value="carrier"[^>]*checked|checked[^>]*value="carrier"/);
    for (const part of ['Shopify order page','Carrier tracking page','Save destination','may first ask','may ask the customer to sign in','View The Ritualist']) expect(text(html)).toContain(part);
    expect(html).not.toContain('disabled=""');
  });

  it('shows no dead upgrade button and no invented default destination', () => {
    const html = render(InkSettings, {flashForward:null,canSave:true,ritualistUrl:'',privacy:[]});
    expect(text(html)).toContain('current setting is unavailable');
    expect(text(html)).not.toContain('View The Ritualist');
    expect(html).not.toContain('checked=""');
  });

  it('shows outstanding privacy requests as awaiting completion', () => {
    const t = text(render(InkSettings, {flashForward:null,canSave:true,ritualistUrl:'',privacy:[{id:'1',topic:'customers/data_request',requestId:'88',dueAt:'2026-10-23T00:00:00Z'}]}));
    expect(t).toContain('awaiting completion');
    expect(t).toContain('Data request 88');
    expect(t).toContain('Contact support');
  });
});

describe("the Ritualist's order panel is unchanged by ink's footer", () => {
  it("renders its three props exactly as before: the full-record button, the studio sentence, no footer", () => {
    const order = {
      id: "7", orderNumber: "#1007", customerName: "Made Up", customerEmail: "buyer@example.com",
      customerAddress: { address1: "1 Test St", city: "Brooklyn", provinceCode: "NY", zip: "11201" },
      date: "Sep 21, 2026", total: "58.00", subtotal: "58.00", currency: "USD", status: "enrolled",
      items: [{ title: "Bar Tape", quantity: 2, price: "29.00", sku: "BT-1" }], metafields: {},
    };
    const html = renderToString(
      <AppProvider i18n={translations}>
        <OrderExpandedRow order={order} onCollapse={() => {}} onViewFull={() => {}} />
      </AppProvider>,
    );
    const t = text(html);
    expect(t).toContain("View Full Record");
    expect(html).not.toContain("href=");
    expect(t).toContain("Open history, location, and the signed delivery record live in your Ritualist studio.");
    expect(t).not.toContain("Get the record");
  });
});
