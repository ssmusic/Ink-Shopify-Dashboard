import { useState } from "react";
import { z } from "zod";
import {
  Page,
  Card,
  BlockStack,
  Text,
  TextField,
  Select,
  Button,
  Collapsible,
  InlineStack,
  Layout,
} from "@shopify/polaris";
import PolarisAppLayout from "../components/PolarisAppLayout";
import { useToast } from "../hooks/use-toast";

const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters"),
  email: z
    .string()
    .trim()
    .email("Please enter a valid email")
    .max(255, "Email must be less than 255 characters"),
  category: z.string().min(1, "Please select a category"),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message must be less than 2000 characters"),
});

type ContactFormData = z.infer<typeof contactSchema>;

const faqSections = [
  {
    title: "Getting Started",
    items: [
      {
        question: "How do I get stickers?",
        answer:
          "Order NFC stickers through the Tag Inventory tab in Settings. Stickers are pre-encoded and ship to your warehouse. Apply one to each package before shipping.",
      },
      {
        question: "How does enrollment work?",
        answer:
          "Open the ink. enrollment app, scan the order barcode, photograph the contents, and apply the sticker. The record is created before the package leaves your warehouse.",
      },
      {
        question: "Do I need to change my shipping or carrier?",
        answer:
          "No. ink. sits on top of your existing infrastructure. Your carrier, your warehouse workflow, your returns portal — nothing changes.",
      },
    ],
  },
  {
    title: "Customer Experience",
    items: [
      {
        question: "What does my customer see when they tap?",
        answer:
          "A branded full-screen experience — your logo, your colors, your message. Then a simple delivery confirmation. No app download, no login required.",
      },
      {
        question: "What if my customer doesn't tap?",
        answer:
          "The pre-shipment photos still exist. That record was created at enrollment regardless of whether the customer ever touches the sticker.",
      },
      {
        question: "Does my customer need to download an app?",
        answer:
          "No. The tap opens directly in the phone's browser. No app, no login, no account creation.",
      },
    ],
  },
  {
    title: "Verification & Evidence",
    items: [
      {
        question: "What data is captured on tap?",
        answer:
          "GPS coordinates, timestamp, device model and OS, network type, and distance from the shipping address. All cryptographically signed and stored.",
      },
      {
        question: "How does this help with disputes?",
        answer:
          "When a customer files a chargeback or claim, you have pre-shipment photos proving what was packed, and if they tapped, GPS-verified proof of delivery.",
      },
      {
        question: "What is the verification window?",
        answer:
          "The period after delivery during which you send tap reminders. Default is 72 hours. The sticker itself stays active through the full return window.",
      },
    ],
  },
  {
    title: "Returns & ink. Drop",
    items: [
      {
        question: "What is ink. Drop?",
        answer:
          "ink. Drop is our return system. Customers who tap at delivery unlock an extended return window and the ability to return at any FedEx, UPS, or USPS location with a carrier-native QR code. Coming soon.",
      },
      {
        question: "Do customers who don't tap still get returns?",
        answer:
          "Yes, through your standard return process. The tap unlocks the faster, frictionless return path.",
      },
      {
        question: "What is a Return Passport?",
        answer:
          "A verified return credential generated when a customer walks into a participating retail location. GPS confirms they're in the store. Coming soon.",
      },
    ],
  },
  {
    title: "Pricing & Billing",
    items: [
      {
        question: "How much does it cost?",
        answer:
          "$0.99 per enrollment, $2.99 per verified tap, $0.80 per sticker. No monthly fee, no tiers, no minimums.",
      },
      {
        question: "When am I charged for a tap?",
        answer:
          "Only when a customer successfully taps the sticker and the system captures a verified delivery event. You'll be billed monthly.",
      },
      {
        question: "How do I order more stickers?",
        answer:
          "Through the Tag Inventory tab in Settings. You can set auto-refill thresholds so you never run out.",
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
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<
    Partial<Record<keyof ContactFormData, string>>
  >({});
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    category: "",
    message: "",
  });

  const handleChange = (field: keyof ContactFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async () => {
    setErrors({});
    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ContactFormData, string>> = {};
      result.error.issues.forEach((err) => {
        fieldErrors[err.path[0] as keyof ContactFormData] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast({
      title: "Message sent",
      description: "We'll get back to you within 24 hours.",
    });
    setFormData({ name: "", email: "", category: "", message: "" });
    setIsSubmitting(false);
  };

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
                Contact Us
              </Text>
              <Card>
                <BlockStack gap="400">
                  <TextField
                    label="Name"
                    value={formData.name}
                    onChange={(v) => handleChange("name", v)}
                    error={errors.name}
                    autoComplete="name"
                  />
                  <TextField
                    label="Email"
                    type="email"
                    value={formData.email}
                    onChange={(v) => handleChange("email", v)}
                    error={errors.email}
                    autoComplete="email"
                  />
                  <Select
                    label="Category"
                    value={formData.category}
                    onChange={(v) => handleChange("category", v)}
                    error={errors.category}
                    options={[
                      { label: "Select a topic", value: "" },
                      { label: "General Inquiry", value: "general" },
                      { label: "Technical Support", value: "technical" },
                      { label: "Billing & Subscription", value: "billing" },
                      { label: "Verification Issues", value: "verification" },
                      { label: "Integration Help", value: "integration" },
                      { label: "Feedback & Suggestions", value: "feedback" },
                    ]}
                  />
                  <TextField
                    label="Message"
                    value={formData.message}
                    onChange={(v) => handleChange("message", v)}
                    error={errors.message}
                    multiline={5}
                    autoComplete="off"
                    helpText={`${formData.message.length}/2000 characters`}
                  />
                  <InlineStack align="end">
                    <Button
                      variant="primary"
                      onClick={handleSubmit}
                      loading={isSubmitting}
                    >
                      Send Message
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
              <Text as="p" tone="subdued" variant="bodySm">
                Need immediate assistance? Email us at{" "}
                <a
                  href="mailto:support@in.ink"
                  style={{ color: "inherit", textDecoration: "underline" }}
                >
                  support@in.ink
                </a>
              </Text>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    </PolarisAppLayout>
  );
};

export default Help;
