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
  ORDER_SORT_OPTIONS,
  orderSearch,
  orderSort,
  type InkOrderSort,
} from "../lib/ink-order-search";

export default function InkOrderSearch({
  search,
  sort,
  pending,
  onChange,
}: {
  search: string;
  sort: InkOrderSort;
  pending: boolean;
  onChange: (search: string, sort: InkOrderSort) => void;
}) {
  const [draft, setDraft] = useState(search);
  useEffect(() => setDraft(search), [search]);
  const clear = () => {
    setDraft("");
    onChange("", sort);
  };
  return (
    <BlockStack gap="200">
      <Form onSubmit={() => onChange(orderSearch(draft), sort)}>
        <InlineGrid columns={{ xs: 1, sm: "minmax(0, 1fr) 220px" }} gap="200">
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
          <Select
            label="Sort orders"
            labelHidden
            options={[...ORDER_SORT_OPTIONS]}
            value={sort}
            onChange={(value) => onChange(orderSearch(draft), orderSort(value))}
          />
        </InlineGrid>
      </Form>
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
