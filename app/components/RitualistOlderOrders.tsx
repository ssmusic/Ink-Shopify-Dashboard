// LOAD MORE — the Ritualist's orders past Shopify's 60 days, from ink's own
// records, as ink's Orders has them (routes/app.ink.$section.tsx OlderOrders,
// embed #182; Sam, 2026-09-24: "the orders cap out at 10 - whats that about?"
// · "should be called Load More", and of the Ritualist: "ink has more
// polish"). Shopify shares an app only the last 60 days of orders; "Load
// more" continues from ink's records, twenty at a time, through the Orders
// loader's `?older=`. Each page is its own read, so Refresh brings every
// page up to date, and a page whose re-read fails keeps the rows it had.
// The older orders continue the list itself, with no line between them
// (Sam: "get rid of this slop"); the end reads "No more orders."
//
// The same machine as ink's, drawn the Ritualist's way: its rows open onto
// its own panel (OrderExpandedRow), Advanced closed, the record included.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";
import { BlockStack, Box, Button, Divider, Text } from "@shopify/polaris";
import InkRecentOrders, { type InkStreamedOrderRow } from "./InkRecentOrders";
import OrderExpandedRow from "./OrderExpandedRow";

/** A page of older orders, as the loader's `?older=` answers it: null when
 *  ink's records could not be read. Named, not inferred — the loader's
 *  inferred answers fold this one into the orders screen's. */
export type OlderRows = {
  rows: (InkStreamedOrderRow & { createdAt: string | null })[];
  next: string | null;
} | null;

/** Shopify's window: with no order in it, older orders start from its edge. */
const SHOPIFY_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
/** Empty stretches of ink's records read past before the screen asks again. */
const OLDER_EMPTY_HOPS = 3;
const ORDERS_PATH = "/app/tagged-shipments";

type ShownOrder = { proofId: string | null; createdAt?: string | null };

export default function RitualistOlderOrders({ shown }: { shown: ShownOrder[] }) {
  const [pages, setPages] = useState<{ cursor: string; hop: number }[]>([]);
  const skip = shown.map((o) => o.proofId).filter((id): id is string => Boolean(id));
  const start = () => {
    const times = shown.map((o) => Date.parse(o.createdAt ?? "")).filter(Number.isFinite);
    const from = times.length ? Math.min(...times) : Date.now() - SHOPIFY_WINDOW_MS;
    setPages([{ cursor: new Date(from).toISOString(), hop: 0 }]);
  };
  const more = useCallback(
    (cursor: string, hop: number) =>
      setPages((was) => (was.some((p) => p.cursor === cursor) ? was : [...was, { cursor, hop }])),
    [],
  );
  if (!pages.length) return <LoadMoreFoot onPress={start} />;
  return (
    <>
      {pages.map((page, i) => (
        <OlderPage key={page.cursor} cursor={page.cursor} hop={page.hop} last={i === pages.length - 1} skip={skip} onMore={more} />
      ))}
    </>
  );
}

/** The list's foot: Load more, or what stands in its place. */
function LoadMoreFoot({ onPress, reading = false, children }: { onPress?: () => void; reading?: boolean; children?: ReactNode }) {
  return (
    <>
      <Divider />
      <Box padding="300">
        <BlockStack gap="200" inlineAlign="center">
          {children ?? (
            <Button variant="plain" onClick={onPress} loading={reading} disabled={reading}>
              {/* PLACEHOLDER: distinguish saved records from Shopify pagination. */}
              Load older records
            </Button>
          )}
        </BlockStack>
      </Box>
    </>
  );
}

function OlderPage({
  cursor,
  hop,
  last,
  skip,
  onMore,
}: {
  cursor: string;
  hop: number;
  last: boolean;
  skip: string[];
  onMore: (cursor: string, hop: number) => void;
}) {
  const fetcher = useFetcher<{ older?: OlderRows }>();
  const { load } = fetcher;
  // `?index`: Orders is the INDEX route under a layout with no loader. A
  // fetcher's GET without it asks the layout, gets no older rows, and "Load
  // more" spins forever (corvara, 2026-09-25).
  const href = `${ORDERS_PATH}?index&older=${encodeURIComponent(cursor)}`;
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (asked.current === href) return;
    asked.current = href;
    load(href);
  }, [href, load]);
  const got = fetcher.data;
  // undefined: not read yet · null: the read failed.
  const page = got ? got.older : undefined;
  const [good, setGood] = useState<NonNullable<OlderRows> | null>(null);
  useEffect(() => {
    if (page) setGood(page);
  }, [page]);
  const shown = page || good;
  const failed = page === null && !good;
  // Shopify's rows already show their own orders.
  const rows = shown ? shown.rows.filter((r) => !(r.proofId && skip.includes(r.proofId))) : [];
  const next = shown?.next ?? null;
  const readOn = last && Boolean(shown) && rows.length === 0 && next !== null && hop < OLDER_EMPTY_HOPS;
  useEffect(() => {
    if (readOn && next) onMore(next, hop + 1);
  }, [readOn, next, hop, onMore]);
  const reading = (!shown && !failed) || readOn;
  return (
    <>
      {rows.length > 0 && (
        <InkRecentOrders orders={rows} headings={false} renderPanel={(row) => <OrderExpandedRow row={row} />} />
      )}
      {last &&
        (reading ? (
          <LoadMoreFoot reading />
        ) : failed ? (
          <LoadMoreFoot>
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              Older orders could not be loaded.
            </Text>
            <Button variant="plain" onClick={() => load(href)}>
              Try again
            </Button>
          </LoadMoreFoot>
        ) : next ? (
          <LoadMoreFoot onPress={() => onMore(next, 0)} />
        ) : (
          <LoadMoreFoot>
            <Text as="p" variant="bodySm" tone="subdued" alignment="center">
              No more orders.
            </Text>
          </LoadMoreFoot>
        ))}
    </>
  );
}
