import { useState, useCallback } from "react";
import {
  BlockStack,
  Card,
  Text,
  TextField,
  InlineStack,
  Checkbox,
  Divider,
  Layout,
} from "@shopify/polaris";
import { toast } from "../../hooks/use-toast";

const inventoryData = {
  current: 1200,
  usedThisPeriod: 1800,
};

const TagsSettings = () => {
  const [autoRefillEnabled, setAutoRefillEnabled] = useState(true);
  const [refillQuantity, setRefillQuantity] = useState("500");
  const [lowInventoryThreshold, setLowInventoryThreshold] = useState(true);
  const [thresholdPercent, setThresholdPercent] = useState("20");

  const handleAutoRefillToggle = useCallback((checked: boolean) => {
    setAutoRefillEnabled(checked);
    toast({
      description: checked ? "Auto-refill enabled" : "Auto-refill disabled",
      duration: 1500,
    });
  }, []);

  return (
    <Layout>
      <Layout.AnnotatedSection
        title="Current Inventory"
        description="Your NFC tag stock levels and usage this period."
      >
        <InlineStack gap="400" wrap={false}>
          <div style={{ flex: 1 }}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" tone="subdued" variant="bodySm">In Stock</Text>
                <Text as="p" variant="headingLg">{inventoryData.current.toLocaleString()}</Text>
                <Text as="p" tone="subdued" variant="bodySm">tags remaining</Text>
              </BlockStack>
            </Card>
          </div>
          <div style={{ flex: 1 }}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" tone="subdued" variant="bodySm">Used This Month</Text>
                <Text as="p" variant="headingLg">{inventoryData.usedThisPeriod.toLocaleString()}</Text>
                <Text as="p" tone="subdued" variant="bodySm">tags shipped</Text>
              </BlockStack>
            </Card>
          </div>
        </InlineStack>
      </Layout.AnnotatedSection>

      <Layout.AnnotatedSection
        title="Auto-Refill"
        description="Automatically reorder tags when inventory drops below a threshold."
      >
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="start">
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm">Auto-Refill Settings</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Automatically reorder tags based on inventory levels
                </Text>
              </BlockStack>
              <Checkbox
                label=""
                checked={autoRefillEnabled}
                onChange={handleAutoRefillToggle}
              />
            </InlineStack>

            {autoRefillEnabled && (
              <>
                <Divider />
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="medium">Refill Quantity</Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Number of tags to order per refill
                    </Text>
                  </BlockStack>
                  <div style={{ width: "100px" }}>
                    <TextField
                      label=""
                      labelHidden
                      type="number"
                      value={refillQuantity}
                      onChange={setRefillQuantity}
                      autoComplete="off"
                    />
                  </div>
                </InlineStack>

                <Divider />
                <Text as="p" variant="bodySm" fontWeight="medium">Trigger Conditions</Text>

                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="start">
                    <Checkbox
                      label=""
                      checked={lowInventoryThreshold}
                      onChange={(v) => {
                        setLowInventoryThreshold(v);
                        toast({
                          description: v
                            ? "Low inventory threshold enabled"
                            : "Low inventory threshold disabled",
                          duration: 1500,
                        });
                      }}
                    />
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" fontWeight="medium">
                        Low Inventory Threshold
                      </Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        Trigger refill when inventory drops below a percentage
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  <div style={{ width: "80px" }}>
                    <TextField
                      label=""
                      labelHidden
                      type="number"
                      value={thresholdPercent}
                      onChange={setThresholdPercent}
                      suffix="%"
                      disabled={!lowInventoryThreshold}
                      autoComplete="off"
                    />
                  </div>
                </InlineStack>

                <Divider />
                <Text as="p" tone="subdued" variant="bodySm">
                  <Text as="span" fontWeight="medium">Current Configuration: </Text>
                  {refillQuantity} tags will be ordered when inventory falls below{" "}
                  {thresholdPercent}%.
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Processing time varies but usually takes about 3 weeks.
                </Text>
              </>
            )}
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>
    </Layout>
  );
};

export default TagsSettings;
