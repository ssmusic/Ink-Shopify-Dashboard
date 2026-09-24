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

const { default: InkHome, loader: loadInkHome } = await import("../routes/app.ink.$section");
const { default: InkSettings, action: saveInkSettings } = await import("../routes/app.ink.settings");
const { default: InkKpis } = await import("../components/InkKpis");
const { default: OrderTimeline, DeliveryWindowBar } = await import("../components/OrderTimeline");
const { timelineFrom } = await import("../services/ink-timeline.server");
const { dashboardFrom } = await import("../services/ink-delivery.server");
const { default: InkRecentOrders, RecordWords } = await import("../components/InkRecentOrders");
const { default: InkRecordInspection, RecordEventRow } = await import("../components/InkRecordInspection");
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
  it('keeps distance inside order details and shows no invented shipping price', () => {
    const t = text(render(InkHome, { stage: 'ready', recentOrders: ROWS }));
    for (const part of ['Orders', '#1010', 'Made Up', '$58.00', '1 open']) expect(t).toContain(part);
    expect(t).not.toContain('719 m');
    expect(text(openRow(ROWS[0].id))).toContain('719 m from the delivery address');
    for (const gone of ['Outside 300', 'flagged', 'Shipping Free', 'Your mark', 'Upload your own', 'PLACEHOLDER']) expect(t).not.toContain(gone);
  });

  it('opens an order with its address, products and Advanced disclosure', () => {
    const html = openRow(ROWS[0].id);
    const t = text(html);
    for (const part of ['Recipient', 'Order email: buyer@example.com', '1 Test St', 'Products', 'Bar Tape', 'Order total $58.00', 'Advanced', 'Get the record']) expect(t).toContain(part);
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toMatch(/href="https?:\/\//);
    expect(t).not.toContain('$29');
    expect(html).toContain('Polaris-Button--variantTertiary');
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
    expect(text(render(InkHome, { stage: 'ready', recentOrders: [] }))).toContain('No orders are available from the past 60 days.');
    const searched = text(render(InkHome, { stage: 'ready', recentOrders: [], search: 'missing', sort: 'newest' }));
    expect(searched).toContain('No orders match this search.');
    expect(searched).toContain('Clear search');
    expect(searched).not.toContain('No orders are available');
    const failed = text(render(InkHome, { stage: 'ready', recentOrders: [], ordersError: true }));
    expect(failed).toContain('Orders could not be loaded');
    expect(failed).not.toContain('No orders are available');
    expect(text(openRow(ROWS[0].id))).not.toContain('Back to orders');
  });

  it('shows a bounded setup state and a refresh action', () => {
    const t = text(render(InkHome, { stage: 'provisioning', recentOrders: [] }));
    expect(t).toContain('Setting up your store');
    expect(t).toContain('Refresh');
  });

  it('names the tab Dashboard and draws the pill nav with links, Dashboard first', () => {
    // Sam, 2026-09-24: "i remember enjoying your nav over the codex one" — the
    // black pill bar again, with Codex's five destinations in Codex's order.
    const html = render(InkHome, { section: 'insights', stage: 'ready', kpis: null, delivery: null });
    expect(text(html)).toContain('Dashboard');
    expect(text(html)).not.toContain('Insights');
    expect(html).not.toContain('Polaris-Tabs');
    expect(html).toContain('role="tablist"');
    const order = ['insights', 'orders', 'records', 'settings', 'help'].map((id) => html.indexOf(`data-pill="${id}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toMatch(/aria-selected="true"[^>]*data-pill="insights"|data-pill="insights"[^>]*aria-selected="true"/);
    expect(html).toContain('href="/app/ink/settings"');
    expect(html).toContain('href="/app/ink/help"');
  });

  it('has exactly three KPI labels, no subtitles or unsupported integrity claims', () => {
    const html = renderToString(<AppProvider i18n={translations}><InkKpis kpis={{recorded:12, opened:7, openRate:58, locationShared:2, capped:false}} /></AppProvider>);
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
    expect(text(html)).toContain('while it remains in the recent-order list');
    expect(text(html)).not.toContain('You can download it again from Records');
    expect(text(html)).toContain('Download PDF');
    expect(text(html)).not.toMatch(/attach as a file|Did you win/);
  });

  it('does not offer file formats when access is unavailable', () => {
    const t = text(render(() => <InkRecentOrders orders={[{...ROWS[0],door:{offerLine:null,downloadable:false,pending:false}}]} defaultExpandedId={ROWS[0].id} />, {}));
    expect(t).toContain('Record access is unavailable');
    expect(t).not.toMatch(/Export the record|PDF report|Download PDF|Get the record/);
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

  it('shows the full merchant inspection before purchase without offering downloads', () => {
    const t = text(render(() => <InkRecentOrders orders={[{
      // A whole read of a record still for sale (main's record shape, #137).
      ...ROWS[0], record: { ...RECORD, locked: false, whole: true, forSale: { price_cents: 2900, currency: 'USD' } },
      door: { offerLine: "Get the record ($29 USD)", downloadable: false },
    }]} defaultExpandedId={ROWS[0].id} />, {}));
    expect(t).toContain('Checked in this browser');
    expect(t).toContain('Event history');
    expect(t).toContain('Get the record');
    expect(t).not.toMatch(/The complete record|Download PDF|Download CSV/);
  });

  it('shows record evidence as reported, without claiming browser verification', () => {
    const t = text(renderToString(<AppProvider i18n={translations}><RecordWords record={RECORD} /></AppProvider>));
    for (const part of ['Evidence levels reported by the record', 'Recorded and signed', 'First open signed', 'Nearest open', 'Opened 719 m from the delivery address.', '719 m from the delivery address']) expect(t).toContain(part);
    expect(t).not.toMatch(/flagged|Confirmed at the door|Checked in this browser|outside|default range/);
    // Sam, 2026-09-24: "we cant confirm at door" — no level, row or word says a
    // delivery was verified, confirmed or seen at the door.
    expect(t).not.toMatch(/Verified by ink|Seen at the door|at the door|device-verified/i);
  });

  it('keeps the preview short while the full purchased event inspector loads on demand', () => {
    const unlocked = { ...RECORD, locked: false, whole: true, events: [{ seq: 1, event_id: 'event_12345678', type: 'TAP_RECORDED', at: '2026-09-20T00:00:00Z', check: 'verified', legacy: false }] };
    const t = text(renderToString(<AppProvider i18n={translations}><RecordWords record={unlocked} /></AppProvider>));
    expect(t).toContain('Evidence levels reported by the record');
    expect(t).not.toContain('event_12345678');
    expect(t).not.toContain('Checked in this browser');
  });

  it('shows record history with a repeat download and an honest missing-purchase path', () => {
    const html = render(InkHome, { section: 'records', stage: 'ready', recordHistory: [{ proofId: PROOF, orderName: '#1010', createdAt: '2026-09-20T00:00:00Z', state: 'minted', door: { offerLine: null, pending: false, downloadable: true }, record: { ...RECORD, locked: false } }], historyError: false, historyPage: 1, historyHasNext: false, historyHasPrevious: false });
    const t = text(html);
    expect(t).toContain('Your record library');
    expect(html).toContain('Download PDF for #1010');
    expect(html).toContain('Download CSV for #1010');
    expect(html).toContain('Download JSON for #1010');
    expect(t).toContain('View record details');
    expect(t).toContain('Files are not emailed');
    expect(t).toContain('If a past purchase is missing');
  });

  it('keeps multiple purchased records downloadable and pending purchases out of the library', () => {
    const history = [1,2,3].map((n) => ({ proofId: `proof_${String(n).repeat(24)}`, orderName: `#100${n}`, createdAt: '2026-09-20T00:00:00Z', state: 'minted', door: { offerLine: 'Get the record ($29 USD)', downloadable: true }, record: { ...RECORD, locked: false } }));
    const html = render(InkHome, { section:'records', stage:'ready', recordHistory:[...history, {proofId:PROOF,orderName:'#1004',createdAt:null,state:'paid_pending_record',door:{offerLine:null,downloadable:false,pending:true,paidPendingRecord:true},record:null}], historyError:false, historyHasNext:true, historyHasPrevious:false });
    for (const n of [1,2,3]) expect(html).toContain(`Download PDF for #100${n}`);
    expect(html).not.toContain('Download PDF for #1004');
    expect(text(html)).not.toContain('Get the record');
    expect(text(html)).toContain('Needs attention');
    expect(text(html)).toContain('Check record access');
  });

  it('renders real rates without requiring a browser or combining sample denominators', () => {
    const delivery = dashboardFrom({rows:[{delivered_at:'2026-09-20T00:00:00Z'},{}],taps:[]});
    const html = render(InkHome,{section:'insights',stage:'ready',kpis:{recorded:12,opened:7,locationShared:2,openRate:58,capped:true},delivery});
    for (const part of ['58%', '7 of 12 orders', '50%', '1 of 2 orders', '17%', '2 of 12 orders']) expect(text(html)).toContain(part);
    const empty = text(render(InkHome,{section:'insights',stage:'ready',kpis:{recorded:0,opened:0,locationShared:0,openRate:null,capped:false},delivery:null}));
    expect(empty).not.toMatch(/NaN|Infinity|0%/);
  });

  it('uses an accessible blue distance diagram and exact measurements without a range verdict', () => {
    const html = renderToString(<AppProvider i18n={translations}><OrderTimeline data={timelineFrom({enrolled_at:'2026-09-01T00:00:00Z'}, {address:{lat:34,lng:-118}, opens:[{at:'2026-09-02T00:00:00Z',outcome:'success',gps_verdict:'flagged',distance_m:719,accuracy_m:35,lat:34.005,lng:-118.004}]}, RECORD)!} addressLabel="1 Test St, Brooklyn, NY" /></AppProvider>);
    const t = text(html);
    for (const part of ['Order activity','1 Test St','100 m','300 m','Opened 719 m from the delivery address.','Location accuracy 35 m','34.0050, -118.0040']) expect(t).toContain(part);
    expect(html).toContain('role="img"');
    expect(html).toContain('var(--p-color-text-info)');
    for (const gone of ['default range','outside the 300','within the 100','THE ORDER','OpenStreetMap']) expect(t).not.toContain(gone);
  });

  it('shows purchased event evidence without another disclosure and never labels supplied signatures verified', () => {
    const event = { id: 'event_12345678', type: 'TAP_RECORDED', at: '2026-09-20T00:00:00Z', sequence: 1, legacy: false, keyId: 'key_001', payloadHash: 'a'.repeat(64), previousEventId: null, previousHash: null, signature: 'b'.repeat(128), signedBytes: '{}', unverifiable: false, location: {lat:34.005, lng:-118.004} };
    const html = renderToString(<AppProvider i18n={translations}><RecordEventRow event={event} check={{id:event.id,hash:'matches',link:'first'}} /></AppProvider>);
    const t = text(html);
    for (const part of [event.id, event.payloadHash, event.signature, 'key_001', 'Signature supplied, not checked', 'Hash matches', 'Link first', '34.0050, -118.0040']) expect(t).toContain(part);
    expect(t).not.toContain('Signature verified');
    expect(html).not.toContain('Polaris-Collapsible');
  });

  it('puts record downloads before evidence and shows each open only once', () => {
    const timeline = timelineFrom({enrolled_at:'2026-09-01T00:00:00Z'}, {address:{lat:34,lng:-118}, opens:[{at:'2026-09-02T00:00:00Z',outcome:'success',gps_verdict:'flagged',distance_m:719,accuracy_m:35,lat:34.005,lng:-118.004}]}, RECORD);
    const t = text(render(() => <InkRecentOrders orders={[{...ROWS[0],record:{...RECORD,locked:false},timeline,door:{offerLine:null,downloadable:true}}]} defaultExpandedId={ROWS[0].id} />, {}));
    expect(t.indexOf('Download PDF')).toBeLessThan(t.indexOf('What this record contains'));
    expect(t.indexOf('What this record contains')).toBeLessThan(t.indexOf('Checked in this browser'));
    expect(t.match(/Every open/g)?.length).toBe(1);
    expect(t).not.toContain('Inspect full record');
    expect(t).toContain('No email is sent');
  });

  it('never guesses arrival against a promised window', () => {
    const t = text(renderToString(<AppProvider i18n={translations}><DeliveryWindowBar w={{deliveredAt:'2026-09-01T00:00:00Z',deliveredNote:"From Shopify's fulfillment",windowEnd:'2026-09-03T00:00:00Z',firstOpenAt:'2026-09-01T05:00:00Z',hoursToOpen:5,openPositionPct:10,withinExpectedWindow:true}} /></AppProvider>));
    expect(t).toContain('Recording window ends');
    expect(t).toContain("From Shopify's fulfillment");
    expect(t).toContain('5 hours after delivery');
    expect(t).not.toMatch(/promised|expected|within|Yes/);
  });

  it('removes destination choices without claiming automatic forwarding is already live', () => {
    const html = render(InkSettings, {flashForward:'carrier',canSave:true,ritualistUrl:'https://apps.shopify.com/example-listing',privacy:[]});
    for (const part of ['Tracking link destination','Shopify order page','Carrier tracking page','Save destination','Destination saved','original destination']) expect(text(html)).not.toContain(part);
    expect(text(html)).toContain('View The Ritualist');
    expect(html).not.toContain('name="flash_forward"');
    expect(html).not.toContain('disabled=""');
  });

  it('shows no dead upgrade button and no invented default destination', () => {
    const html = render(InkSettings, {flashForward:null,canSave:true,ritualistUrl:'',privacy:[]});
    expect(text(html)).not.toContain('View The Ritualist');
    expect(html).not.toContain('checked=""');
  });

  it('authenticates and rejects retired destination forms without writing the shared dial', async () => {
    const { authenticate } = await import('../shopify.server');
    const { patchMerchant } = await import('../services/ink-api.server');
    const { updateMerchant } = await import('../services/merchant.server');
    vi.mocked(patchMerchant).mockClear();
    vi.mocked(updateMerchant).mockClear();
    vi.mocked(authenticate.admin).mockResolvedValueOnce({ session: { shop: 'sample.myshopify.com' } } as never);
    const args = { request: new Request('https://app.test/app/ink/settings', {method:'POST',body:new URLSearchParams({flash_forward:'carrier'})}) } as never;
    // A retired form gets the plain 405 Response; only intent=privacy_export answers data.
    const response = (await saveInkSettings(args)) as Response;
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
    expect(patchMerchant).not.toHaveBeenCalled();
    expect(updateMerchant).not.toHaveBeenCalled();
    vi.mocked(authenticate.admin).mockRejectedValueOnce(new Response(null,{status:401}));
    await expect(saveInkSettings(args)).rejects.toMatchObject({status:401});
  });

  it('hands the merchant each customer data request as a download, and says when it was downloaded', () => {
    const t = text(render(InkSettings, {flashForward:null,canSave:true,ritualistUrl:'',privacy:[
      {id:'1',topic:'customers/data_request',requestId:'88',receivedAt:'2026-09-23T00:00:00Z',dueAt:'2026-10-23T00:00:00Z',state:'pending',downloadedAt:null},
      {id:'2',topic:'customers/data_request',requestId:'89',receivedAt:'2026-09-20T00:00:00Z',dueAt:'2026-10-20T00:00:00Z',state:'downloaded',downloadedAt:'2026-09-21T00:00:00Z'},
      {id:'3',topic:'customers/data_request',requestId:'90',receivedAt:'2026-09-19T00:00:00Z',dueAt:'2026-10-19T00:00:00Z',state:'response_required_after_redaction',downloadedAt:null},
    ]}));
    expect(t).toContain('Data request 88. Received Sep 23, 2026. Due Oct 23, 2026.');
    expect(t.match(/Download \(JSON\)/g)?.length).toBe(3);
    expect(t).toContain('Downloaded Sep 21, 2026.');
    expect(t).toContain('This customer was deleted before the data was downloaded.');
    // The old receipt-only wording promised a response somebody else would arrange.
    expect(t).not.toContain('awaiting completion');
  });

  it('answers a data request download through the settings action, and still refuses every retired form', async () => {
    const { authenticate } = await import('../shopify.server');
    vi.mocked(authenticate.admin).mockResolvedValueOnce({ session: { shop: 'sample.myshopify.com' } } as never);
    const privacy = await import('../services/ink-privacy.server');
    const spy = vi.spyOn(privacy, 'exportPrivacyRequest').mockResolvedValueOnce({ ok: true, download: { kind: 'ink.customer_data_export' }, filename: 'ink-customer-data-88.json' });
    const response = await saveInkSettings({ request: new Request('https://app.test/app/ink/settings', {method:'POST',body:new URLSearchParams({intent:'privacy_export',id:'a'.repeat(64)})}) } as never);
    expect(spy).toHaveBeenCalledWith('sample.myshopify.com', 'a'.repeat(64));
    const body = (response as { data: unknown }).data ?? response;
    expect(JSON.stringify(body)).toContain('ink-customer-data-88.json');
    spy.mockRestore();
  });
});

describe("help and store connection", () => {
  it("keeps Help authenticated but independent of ink setup and backend availability", async () => {
    const { authenticate } = await import("../shopify.server");
    const { readInkMerchant } = await import("../services/ink-merchant.server");
    vi.mocked(authenticate.admin).mockResolvedValueOnce({ admin: {}, session: { shop: "sample.myshopify.com" } } as never);
    vi.mocked(readInkMerchant).mockClear();
    const result = await loadInkHome({ request: new Request("https://app.test/app/ink/help"), params: { section: "help" } } as never);
    expect(result.data).toEqual({ section: "help", stage: null });
    expect(result.init?.headers).toEqual({ "Cache-Control": "private, no-store" });
    expect(readInkMerchant).not.toHaveBeenCalled();
    vi.mocked(authenticate.admin).mockRejectedValueOnce(new Response(null, { status: 401 }));
    await expect(loadInkHome({ request: new Request("https://app.test/app/ink/help"), params: { section: "help" } } as never)).rejects.toMatchObject({ status: 401 });
  });

  it("explains downloads and record limits with working navigation", () => {
    const html = render(InkHome, { section: "help", stage: null });
    const t = text(html);
    for (const part of ["Review an order", "Buy a record", "Download again", "does not email", "Check payment status", "Check record access", "Contact support"]) expect(t).toContain(part);
    expect(html).toContain('href="/app/ink/records"');
    expect(html).toContain('href="mailto:info@in.ink"');
    expect(t).not.toContain("Recent orders");
    expect(html).not.toContain('disabled=""');
  });

  it("separates Shopify access from ink availability without claiming sync or a second login", () => {
    const html = render(InkSettings, { flashForward: null, canSave: false, ritualistUrl: "", privacy: [], connection: {
      shop: "sample.myshopify.com", name: "Sample goods", logoUrl: null,
      shopify: "connected", ink: "unavailable", checkedAt: "2026-09-23T20:00:00Z",
    } });
    const t = text(html);
    for (const part of ["Sample goods", "sample.myshopify.com", "Connected", "Could not connect", "Check connection", "Account access is managed in Shopify", "They do not confirm that every order"]) expect(t).toContain(part);
    expect(html).not.toMatch(/type="password"|Sync complete|All orders synced/);
    expect(t).toContain("SG");
  });

  it("never labels unchecked preview or incomplete setup as connected", () => {
    for (const ink of ["not_checked", "setup"]) {
      const t = text(render(InkSettings, { flashForward: null, canSave: false, ritualistUrl: "", privacy: [], connection: {
        shop: "sample.myshopify.com", name: "Sample store", logoUrl: null,
        shopify: "not_checked", ink, checkedAt: null,
      } }));
      expect(t).not.toContain("Connected");
      expect(t).toContain(ink === "setup" ? "Setup incomplete" : "Not checked");
    }
  });
});

// THE RITUALIST'S ROW OPENS ONTO INK'S PANEL (2026-09-24 — Sam: "we are making
// the ritualist as good as ink"). Until then this pinned the row's old body:
// the "View Full Record" button, the studio sentence ("Open history, location,
// and the signed delivery record live in your Ritualist studio.") and no
// footer. The history, the location and the record now sit in the row itself,
// so the sentence is gone; the button stays, sentence case, still a button;
// and the Ritualist's record is included, so the row never offers it.
describe("the Ritualist's Shipments row opens onto ink's panel, the record included", () => {
  it("keeps its full-record button, draws ink's panel, and never offers the record or names a price", () => {
    const row = {
      ...ROWS[0],
      door: { offerLine: null, pending: false, paidPendingRecord: false, resumeUrl: null, downloadable: true, inHistory: false, purchase: null },
    };
    const html = renderToString(
      <AppProvider i18n={translations}>
        {(() => {
          const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <OrderExpandedRow row={row as never} onCollapse={() => {}} onViewFull={() => {}} /> }]);
          return <Stub initialEntries={["/"]} />;
        })()}
      </AppProvider>,
    );
    const t = text(html);
    expect(t).toContain("View full record");
    expect(html).not.toContain("href=");
    for (const part of ["Products", "Recipient", "Advanced", "Export the record", "Download PDF", "Download CSV"]) expect(t).toContain(part);
    for (const gone of ["Get the record", "$29", "Ritualist studio", "View Full Record", "CUSTOMER", "DELIVERY"]) expect(t).not.toContain(gone);
  });
});

// WHAT THE RESTORE KEEPS UNDER CODEX'S SCREENS (2026-09-23). Sam chose Codex's
// screens as they were at 4022900; underneath them stay the money rule
// (services/ink-billing.server.test.ts), the start-up fix
// (services/ink-security.test.ts), #137's signature checks — below — and, only
// once a record is bought, main's packet texts and "Did you win?".
describe("under Codex's screens: the server's signature check, and a bought record's extras", () => {
  const EVENT = {
    id: "event_aaaaaaaaaaaa", type: "TAP_RECORDED", at: "2026-09-06T21:04:00Z", sequence: 3, legacy: false,
    keyId: "key_001", payloadHash: "9d68", previousEventId: "event_delivered", previousHash: "4fb4",
    signature: "c".repeat(88), signedBytes: null, unverifiable: false, location: null,
  };
  const eventRow = (signature: string | null) =>
    renderToString(
      <AppProvider i18n={translations}>
        <RecordEventRow event={EVENT} check={undefined} signature={signature} />
      </AppProvider>,
    );
  it("says each event's signature as the server's check found it — Codex's words only when no check ran", () => {
    expect(text(eventRow("verified"))).toContain("Signature verified");
    expect(text(eventRow("verified"))).not.toContain("Signature supplied, not checked");
    expect(text(eventRow("does not verify"))).toContain("Signature does not verify");
    expect(text(eventRow(null))).toContain("Signature supplied, not checked");
  });
  const inspect = (checks: unknown) =>
    renderToString(
      <AppProvider i18n={translations}>
        {(() => {
          const record = { ...RECORD, locked: false, whole: true, checks } as never;
          const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecordInspection proofId={PROOF} record={record} /> }]);
          return <Stub initialEntries={["/"]} />;
        })()}
      </AppProvider>,
    );
  it("says signatures were not verified here only while the server's check has not run", () => {
    expect(text(inspect(null))).toContain("Signatures are supplied by ink and have not been independently verified here.");
    const checked = text(inspect({ sound: true, headline: "Every signature verifies.", lines: [] }));
    expect(checked).not.toContain("independently verified");
    expect(checked).toContain("Hash and link checks do not confirm physical delivery.");
  });
  const PACKET = { accessActivityLog: "Opened 3 times.", shippingDocumentation: "Delivered Sep 6.", uncategorizedText: "Recorded by ink." };
  const bought = [{
    ...ROWS[0],
    door: { offerLine: null, downloadable: true, purchase: { id: "p_1", packet_url: "https://api.in.ink/p/x", outcome: "open" as const } },
    packet: PACKET,
  }];
  const renderRows = (orders: unknown[]) =>
    renderToString(
      <AppProvider i18n={translations}>
        {(() => {
          const Stub = createRoutesStub([{ id: "screen", path: "/", Component: () => <InkRecentOrders orders={orders as never} defaultExpandedId={ROWS[0].id} /> }]);
          return <Stub initialEntries={["/"]} />;
        })()}
      </AppProvider>,
    );
  it("shows a bought record's texts for Shopify's dispute form, each with Copy, and \"Did you win?\" — never before purchase", () => {
    const after = text(renderRows(bought));
    for (const w of ["Did you win?", "The record", "Access activity log", "Shipping documentation", "Additional information", "Copy", "Opened 3 times."]) expect(after).toContain(w);
    const before = text(renderRows(ROWS));
    for (const w of ["Did you win?", "Access activity log", "Copy"]) expect(before).not.toContain(w);
    expect(before).toContain("Get the record");
  });
});
