import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData, useRouteError, type HeadersFunction, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getMerchantReturnState } from "../services/ink-api.server";
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
        question: "What does The Ritualist do?",
        answer:
          "Every order gets its own page — your brand, the order, and live delivery tracking in one place. Your customer gets a link by email or text when the order ships and when it arrives. The page is also where they can start a return.",
      },
      {
        question: "What do I have to set up?",
        answer:
          "Almost nothing. Orders enroll automatically as they're placed. Your page is built from your existing brand and can be tuned any time from The Ritualist studio. Email and text notifications are controlled in Settings.",
      },
      {
        question: "Do I need to change my shipping or carrier?",
        answer:
          "No. The Ritualist sits on top of your existing setup. Your carrier, your warehouse workflow, your returns policy — nothing changes.",
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
          "No. Your policy and your rules stay yours — The Ritualist handles the customer-facing flow and keeps the status visible to you and to them.",
      },
    ],
  },
  {
    title: "Cost",
    items: [
      {
        question: "How much does it cost?",
        answer:
          "Nothing. You're a founding merchant: we're building this with a small group of brands, and you're one of them. Founding merchants aren't billed.",
      },
      {
        question: "Will I be charged later?",
        answer:
          "Not without your say-so. If we introduce paid plans later, Shopify offers them, you approve one inside Shopify, and it appears on your regular Shopify invoice. Nothing starts on its own, and there is no card on file.",
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

// Returns are off for every pilot (the backend's return_enabled — see
// ink-api getMerchantReturnState), so the Returns questions only show when
// they are true for this store. PLAIN OBJECT, never a Response.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { returnsOn } = await getMerchantReturnState(session.shop);
  return { returnsOn };
};

const Help = () => {
  const { returnsOn } = useLoaderData<typeof loader>();
  return (
    <>
      <Page title="Help & Support">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">
                Frequently Asked Questions
              </Text>
              {/* THE SECTION TITLE WAS ONLY EVER A REACT KEY. Every section
                  carried a heading — "Getting started", "The delivery record",
                  "Returns", "Cost" — and none of them reached the page, so the
                  FAQ rendered as five unlabelled boxes and "How much does it
                  cost?" floated with nothing saying it was about cost. A field
                  that reaches the data and not the page is invisible to tsc
                  and to the suite (TECH_BIBLE law 9); only an eye on the
                  rendered screen catches it. */}
              {faqSections.filter((s) => s.title !== "Returns" || returnsOn).map((section) => (
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
    </>
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
