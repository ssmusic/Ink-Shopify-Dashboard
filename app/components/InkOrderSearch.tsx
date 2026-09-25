import { useEffect, useState } from "react";
import {
  BlockStack,
  Button,
  Form,
  Icon,
  InlineGrid,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import {
  ALL_ORDER_DATES,
  ORDER_DATE_OPTIONS,
  ORDER_SORT_OPTIONS,
  orderDay,
  orderSearch,
  orderSort,
  type InkOrderDates,
  type InkOrderRange,
  type InkOrderSort,
} from "../lib/ink-order-search";

export default function InkOrderSearch({
  search,
  sort,
  pending,
  onChange,
  dates = ALL_ORDER_DATES,
  dateBounds = null,
  onDates,
}: {
  search: string;
  sort: InkOrderSort;
  pending: boolean;
  onChange: (search: string, sort: InkOrderSort) => void;
  /** The ledger's dates (lib/ink-order-search.ts). With onDates, the dates
   *  control shows: the presets, and custom dates From and To. */
  dates?: InkOrderDates;
  /** The first day a custom pick may reach (orderDateBounds). */
  dateBounds?: { min: string } | null;
  onDates?: (dates: InkOrderDates) => void;
}) {
  const [draft, setDraft] = useState(search);
  useEffect(() => setDraft(search), [search]);
  // A choice of custom dates opens From and To; the list changes on Apply.
  const [range, setRange] = useState<InkOrderRange>(dates.range);
  const [from, setFrom] = useState(dates.from ?? "");
  const [to, setTo] = useState(dates.to ?? "");
  useEffect(() => {
    setRange(dates.range);
    setFrom(dates.from ?? "");
    setTo(dates.to ?? "");
  }, [dates.range, dates.from, dates.to]);
  const clear = () => {
    setDraft("");
    onChange("", sort);
  };
  const choose = (value: string) => {
    const next = ORDER_DATE_OPTIONS.find((option) => option.value === value)?.value;
    if (!next || !onDates) return;
    setRange(next);
    // Back to the dates already shown only closes From and To.
    if (next !== "custom" && next !== dates.range) onDates({ range: next, from: null, to: null });
  };
  const ready = Boolean(orderDay(from) && orderDay(to));
  const apply = () => {
    if (ready && onDates) onDates({ range: "custom", from, to });
  };
  const sortSelect = (
    <Select
      label="Sort orders"
      labelHidden
      options={[...ORDER_SORT_OPTIONS]}
      value={sort}
      onChange={(value) => onChange(orderSearch(draft), orderSort(value))}
    />
  );
  return (
    <BlockStack gap="200">
      <Form onSubmit={() => onChange(orderSearch(draft), sort)}>
        <InlineGrid
          columns={onDates ? { xs: 1, md: "minmax(0, 1fr) 410px" } : { xs: 1, sm: "minmax(0, 1fr) 220px" }}
          gap="200"
        >
          <TextField
            label="Search orders"
            labelHidden
            type="search"
            name="q"
            placeholder="Order number, name or email"
            value={draft}
            onChange={setDraft}
            autoComplete="off"
            maxLength={200}
            prefix={<Icon source={SearchIcon} />}
            clearButton={Boolean(draft)}
            onClearButtonClick={clear}
            connectedRight={
              <Button submit loading={pending}>
                Search
              </Button>
            }
          />
          {onDates ? (
            <InlineGrid columns={{ xs: 1, sm: "180px minmax(0, 1fr)" }} gap="200">
              <Select
                label="Order dates"
                labelHidden
                options={[...ORDER_DATE_OPTIONS]}
                value={range}
                onChange={choose}
              />
              {sortSelect}
            </InlineGrid>
          ) : (
            sortSelect
          )}
        </InlineGrid>
      </Form>
      {onDates && range === "custom" && (
        // Its own form: Enter in From or To applies the dates, as it searches above.
        <Form onSubmit={apply}>
          <InlineGrid columns={{ xs: 1, md: "minmax(0, 1fr) minmax(0, 1fr) max-content" }} gap="200" alignItems="end">
            <TextField
              label="From"
              type="date"
              value={from}
              onChange={setFrom}
              autoComplete="off"
              min={dateBounds?.min}
            />
            <TextField
              label="To"
              type="date"
              value={to}
              onChange={setTo}
              autoComplete="off"
              min={orderDay(from) ?? dateBounds?.min}
            />
            <Button submit disabled={!ready} loading={pending}>
              Apply
            </Button>
          </InlineGrid>
        </Form>
      )}
      {search && (
        <InlineStack gap="300" blockAlign="center">
          <Text
            as="p"
            tone="subdued"
            breakWord
          >{`Results for “${search}”`}</Text>
          <Button variant="plain" onClick={clear}>
            Clear search
          </Button>
        </InlineStack>
      )}
    </BlockStack>
  );
}
