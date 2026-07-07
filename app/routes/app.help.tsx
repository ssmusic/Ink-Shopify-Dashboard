import { useState } from "react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Collapsible,
  Layout,
  Button,
} from "@shopify/polaris";
import PolarisAppLayout from "../components/PolarisAppLayout";

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
        question: "What does INK do?",
        answer:
          "Every order gets its own page — your brand, the order, and live delivery tracking in one place. Your customer gets a link by email or text when the order ships and when it arrives. The page is also where they can start a return.",
      },
      {
        question: "What do I have to set up?",
        answer:
          "Almost nothing. Orders enroll automatically as they're placed. Your page is built from your existing brand and can be tuned any time from the INK studio. Email and text notifications are controlled in Settings.",
      },
      {
        question: "Do I need to change my shipping or carrier?",
        answer:
          "No. INK sits on top of your existing setup. Your carrier, your warehouse workflow, your returns policy — nothing changes.",
      },
      {
        question: "Do I need any hardware or stickers?",
        answer:
          "No. INK is software only — every order gets its page automatically the moment it's placed.",
      },
    ],
  },
  {
    title: "Your customer's experience",
    items: [
      {
        question: "What does my customer see?",
        answer:
          "A page in your brand — their order, where it is right now, and what you want them to see next. It opens in the browser from a link in their email or text. No app download, no login, no account creation.",
      },
      {
        question: "What emails and texts go out?",
        answer:
          "Shipping and delivery updates, sent in your name. You control which notifications are on, and the wording, in Settings → Communications.",
      },
    ],
  },
  {
    title: "The delivery record",
    items: [
      {
        question: "What does INK record about a delivery?",
        answer:
          "The carrier's delivery confirmation, timestamps, and — when your customer opens their page and allows location — where the order was opened. The record is cryptographically signed when it's created.",
      },
      {
        question: "How does this help with disputes?",
        answer:
          "When a customer files a chargeback or claim, you have a signed record of the delivery, and pre-shipment photos if you use them — evidence of what was packed and that it arrived.",
      },
    ],
  },
  {
    title: "Returns",
    items: [
      {
        question: "How do returns work?",
        answer:
          "Your customer starts a return from their order page after delivery. They get a QR code — no printer needed — and you see the return's status live on the order.",
      },
      {
        question: "Does this replace my returns policy?",
        answer:
          "No. Your policy and your rules stay yours — INK handles the customer-facing flow and keeps the status visible to you and to them.",
      },
    ],
  },
  {
    title: "Pricing & billing",
    items: [
      {
        question: "How much does it cost?",
        answer:
          "INK pricing is managed in Shopify. Choose and approve your plan there; any usage billing also appears on your Shopify invoice.",
      },
      {
        question: "How am I billed?",
        answer:
          "Through Shopify. Any plan appears on your regular Shopify invoice, you approve it inside Shopify before it starts, and uninstalling ends it automatically.",
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
      <Page title="Help & Support">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">
                Frequently Asked Questions
              </Text>
              {faqSections.map((section) => (
                <Card key={section.title} padding="0">
                  {section.items.map((item, i) => (
                    <FAQItem
                      key={i}
                      question={item.question}
                      answer={item.answer}
                    />
                  ))}
                </Card>
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
