import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError, type HeadersFunction } from "react-router";
import { useState } from "react";
import {
  Page,
  Card,
  BlockStack,
  Box,
  Text,
  Collapsible,
  Layout,
  Button,
} from "@shopify/polaris";
import PolarisAppLayout from "../components/PolarisAppLayout";
import RitualistPillNav from "../components/RitualistPillNav";

// Comms-first FAQ (2026-07-05 pivot). The NFC-era FAQ (stickers, tag
// inventory, "ink. Drop", per-tap pricing) is gone — none of it described
// the shipping product. The fake contact form (it validated, slept 1s, and
// claimed "Message sent" without sending anything) is replaced by a real
// mailto card. Rule: this page promises nothing the installed app doesn't do.

const faqSections = [
  {
    title: "Getting started",
    items: [
      {
        question: "What does the Ritualist do?",
        answer:
          "Every order gets its own page — your brand, the order, and the carrier's tracking in one place.",
      },
      {
        question: "What do I have to set up?",
        answer:
          "Almost nothing. Orders enroll automatically as they're placed. Your page is built from your existing brand and can be tuned any time from The Ritualist Studio.",
      },
      {
        question: "Do I need to change my shipping or carrier?",
        answer:
          "No. The Ritualist sits on top of your existing setup. Your carrier, your warehouse workflow, your returns policy — nothing changes.",
      },
      {
        question: "Do I need any hardware or stickers?",
        answer:
          "No. The Ritualist is software only — eligible orders get their page automatically when they're placed.",
      },
    ],
  },
  {
    title: "Your customer's experience",
    items: [
      {
        question: "What does my customer see?",
        answer:
          "A page in your brand — their order, where it is right now, and what you want them to see next. No app download, no login, no account creation.",
      },
    ],
  },
  {
    title: "The delivery record",
    items: [
      {
        question: "What does the Ritualist record about a delivery?",
        answer:
          // Was "The carrier's delivery confirmation, …" — the record holds the
          // carrier scan (its element's own name); ink never says a delivery
          // was confirmed (lib/order-marks.ts).
          "Available carrier events, timestamps, and browser-reported page opens. If the customer shares location, the record includes where their device reported being. Signatures let you check whether signed data has changed; they do not verify delivery.",
      },
      {
        question: "How does this help with disputes?",
        answer:
          "When a customer files a chargeback or claim, you have a signed record of what the carrier reported and when the page was opened.",
      },
    ],
  },
  {
    title: "Cost",
    items: [
      {
        question: "Will I be charged later?",
        answer:
          "Plans are chosen and approved in Shopify. Your active plan and billing period appear on the Billing page, and charges appear on your Shopify invoice. A plan does not start without your approval.",
      },
    ],
  },
];

const FAQItem = ({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderBottom: "1px solid var(--p-color-border)" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "12px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text as="span" variant="bodySm" fontWeight="medium">
          {question}
        </Text>
        <Text as="span" tone="subdued">
          {open ? "−" : "+"}
        </Text>
      </button>
      <Collapsible open={open} id={question}>
        <div style={{ padding: "0 16px 12px" }}>
          <Text as="p" variant="bodySm" tone="subdued">
            {answer}
          </Text>
        </div>
      </Collapsible>
    </div>
  );
};

const Help = () => {
  return (
    <PolarisAppLayout>
      <Page fullWidth title="Help & support">
        {/* Above both columns, so the pills centre on the page, not on the questions. */}
        <Box paddingBlockEnd="400">
          <RitualistPillNav />
        </Box>
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">
                Frequently asked questions
              </Text>
              {/* THE SECTION TITLE WAS ONLY EVER A REACT KEY. Every section
                  carried a heading — "Getting started", "The delivery record",
                  "Returns", "Cost" — and none of them reached the page, so the
                  FAQ rendered as five unlabelled boxes and "How much does it
                  cost?" floated with nothing saying it was about cost. A field
                  that reaches the data and not the page is invisible to tsc
                  and to the suite (TECH_BIBLE law 9); only an eye on the
                  rendered screen catches it. */}
              {faqSections.map((section) => (
                <BlockStack key={section.title} gap="200">
                  <Text as="h3" variant="headingSm">
                    {section.title}
                  </Text>
                  <Card padding="0">
                    {section.items.map((item, i) => (
                      <FAQItem
                        key={i}
                        question={item.question}
                        answer={item.answer}
                      />
                    ))}
                  </Card>
                </BlockStack>
              ))}
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">
                Contact us
              </Text>
              <Card>
                <BlockStack gap="300">
                  <Text as="p" tone="subdued" variant="bodySm">
                    Questions, problems, or a feature you need? Email us —
                    a person reads every message.
                  </Text>
                  <Button
                    url="mailto:support@in.ink"
                    external
                    variant="primary"
                  >
                    Email support@in.ink
                  </Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    </PolarisAppLayout>
  );
};

export default Help;

// EVERY EMBEDDED ROUTE NEEDS SHOPIFY'S BOUNDARY.
// When a session needs re-auth, @shopify/shopify-app-react-router THROWS a
// Response with status 200 carrying X-Shopify-API-Request-Failure-Reauthorize
// headers, for App Bridge to intercept. Without boundary.error(), React Router
// treats it as a route error response and renders its STATUS — a page whose
// entire body is the text "200". That is Shopify rejection 2.1.1, round two:
// "going to the billing section and navigating back ... shows an 200 error
// page". Billing had this block; /app/settings, its own backAction target, did
// not. `headers` matters too: boundary.headers forwards the reauthorize
// headers App Bridge is waiting for.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
