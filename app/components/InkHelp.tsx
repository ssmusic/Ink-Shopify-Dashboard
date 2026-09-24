import {
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Link,
  Text,
} from "@shopify/polaris";

function Topic({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card padding={{ xs: "400", sm: "500" }}>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        {children}
      </BlockStack>
    </Card>
  );
}

export default function InkHelp() {
  return (
    <Box maxWidth="800px" width="100%">
      <BlockStack gap="400">
        <Topic title="Review an order">
          <Text as="p">
            Open an order to see its recipient, delivery updates and tracking
            link opens. Advanced shows the available record details and export
            options.
          </Text>
          <Text as="p">
            An open records a visit to the tracking page. A shared location
            shows where the device was. Neither alone confirms that a person
            received the parcel.
          </Text>
          <Text as="p" tone="subdued">
            Distance is a measurement from the delivery address. The map rings
            are distance guides.
          </Text>
          <InlineStack>
            <Button url="/app/ink">View orders</Button>
          </InlineStack>
        </Topic>
        <Topic title="Buy a record">
          <Text as="p">
            Choose Get the record on an order. Shopify shows the one-time price
            and currency for approval before charging your store.
          </Text>
          <Text as="p">
            Once the record is available, you can download a PDF report, CSV
            data and a JSON file with the signed event data. The files contain
            the data available for that order.
          </Text>
          <Text as="p" tone="subdued">
            A purchase does not add new evidence or guarantee the outcome of a
            dispute. Signatures are supplied by ink; this app checks event
            hashes and links.
          </Text>
        </Topic>
        <Topic title="Download again">
          <Text as="p">
            Records lists purchases and approvals started in this app. Available
            records have PDF, CSV and JSON download buttons. Ink does not email
            these files.
          </Text>
          <Text as="p">
            If an approval is still pending, use Check payment status. If
            payment is confirmed, use Check record access. Contact support if
            the record remains unavailable.
          </Text>
          <Text as="p" tone="subdued">
            Downloads remain available while the app and record access are
            available. A missing past purchase can be checked by support.
          </Text>
          <InlineStack>
            <Button url="/app/ink?view=records">View records</Button>
          </InlineStack>
        </Topic>
        <Topic title="Connection and missing data">
          <Text as="p">
            Ink connects during installation and uses your Shopify session.
            Settings shows the connected store and lets you check Shopify and
            ink data access.
          </Text>
          <Text as="p">
            Orders shows Shopify orders from the past 60 days. Older purchases
            made in this app remain in Records. A missing location means no
            usable shared location is available for that open.
          </Text>
          <Text as="p" tone="subdued">
            If a page cannot load, try Refresh. If the problem continues,
            contact support with the store and order number.
          </Text>
          <InlineStack>
            <Button url="/app/ink/settings">View settings</Button>
          </InlineStack>
        </Topic>
        <Topic title="Contact support">
          <Text as="p">
            For billing, missing records or customer privacy requests, email{" "}
            <Link url="mailto:info@in.ink">info@in.ink</Link>.
          </Text>
          <Text as="p">
            {/* PLACEHOLDER */}
            A customer data request you make in Shopify appears in Settings,
            with a download of what ink holds about that customer.
          </Text>
          <Text as="p" tone="subdued">
            Include your store name, the order number if relevant, and what you
            need help with.
          </Text>
        </Topic>
      </BlockStack>
    </Box>
  );
}
