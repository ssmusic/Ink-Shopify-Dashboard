import { useState } from "react";
import { z } from "zod";
import AppLayout from "../components/AppLayout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { useToast } from "../hooks/use-toast";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  email: z.string().trim().email("Please enter a valid email").max(255, "Email must be less than 255 characters"),
  category: z.string().min(1, "Please select a category"),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(2000, "Message must be less than 2000 characters"),
});

type ContactFormData = z.infer<typeof contactSchema>;

const faqItems = [
  {
    question: "How do I add NFC tags to my products?",
    answer: "Navigate to Settings > Tags to configure your NFC tag settings. You can order pre-programmed tags or use our encoding tool to program your own tags with your product information.",
  },
  {
    question: "What happens when a customer scans a tag?",
    answer: "When a customer scans an NFC tag, they're taken to a verification page that confirms the product's authenticity. You'll receive a notification and the scan will appear in your dashboard activity feed.",
  },
  {
    question: "How do I view my verification analytics?",
    answer: "Your dashboard shows an overview of verification statistics. For detailed analytics, you can view the weekly verification chart and global scan map to see where your products are being verified.",
  },
  {
    question: "Can I customize the verification experience?",
    answer: "Yes! Go to Settings > Branding to customize colors, logos, and messaging. You can also configure what information is displayed to customers during verification.",
  },
  {
    question: "How do I integrate with my existing systems?",
    answer: "We offer webhooks and API access for integration with your existing systems. Visit Settings > Webhooks to configure real-time notifications for verification events.",
  },
  {
    question: "What if a tag is reported as counterfeit?",
    answer: "Flagged verifications appear in your Pending Verification queue. You can review the details, including location and scan history, to determine if action is needed.",
  },
];

const Help = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    category: "",
    message: "",
  });

  const handleChange = (field: keyof ContactFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ContactFormData, string>> = {};
      result.error.issues.forEach((err) => {
        const field = err.path[0] as keyof ContactFormData;
        fieldErrors[field] = err.message;
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
    <AppLayout pageTitle="Help & Support" pageSubtitle="Get in touch with our team">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* FAQ Section */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">Frequently Asked Questions</h2>
          <div className="bg-card border border-border rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <Accordion type="single" collapsible className="w-full">
              {faqItems.map((item, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="border-border px-5">
                  <AccordionTrigger className="text-left text-[14px] font-medium hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-[13px] text-muted-foreground leading-relaxed">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>

        {/* Contact Form Section */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">Contact Us</h2>
          <div className="bg-card border border-border rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-5 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
              {/* Name */}
              <div>
                <Label htmlFor="name" className="text-[13px] font-semibold text-foreground mb-2 block">
                  Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="Your name"
                  className={errors.name ? "border-destructive" : ""}
                />
                {errors.name && (
                  <p className="text-sm text-destructive mt-1">{errors.name}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <Label htmlFor="email" className="text-[13px] font-semibold text-foreground mb-2 block">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="you@example.com"
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && (
                  <p className="text-sm text-destructive mt-1">{errors.email}</p>
                )}
              </div>

              {/* Category */}
              <div>
                <Label htmlFor="category" className="text-[13px] font-semibold text-foreground mb-2 block">
                  Category
                </Label>
                <Select value={formData.category} onValueChange={(value) => handleChange("category", value)}>
                  <SelectTrigger id="category" className={errors.category ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select a topic" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Inquiry</SelectItem>
                    <SelectItem value="technical">Technical Support</SelectItem>
                    <SelectItem value="billing">Billing & Subscription</SelectItem>
                    <SelectItem value="verification">Verification Issues</SelectItem>
                    <SelectItem value="integration">Integration Help</SelectItem>
                    <SelectItem value="feedback">Feedback & Suggestions</SelectItem>
                  </SelectContent>
                </Select>
                {errors.category && (
                  <p className="text-sm text-destructive mt-1">{errors.category}</p>
                )}
              </div>

              {/* Message */}
              <div>
                <Label htmlFor="message" className="text-[13px] font-semibold text-foreground mb-2 block">
                  Message
                </Label>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => handleChange("message", e.target.value)}
                  placeholder="Describe your issue or question..."
                  rows={5}
                  className={errors.message ? "border-destructive" : ""}
                />
                {errors.message && (
                  <p className="text-sm text-destructive mt-1">{errors.message}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.message.length}/2000 characters
                </p>
              </div>

              {/* Submit */}
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto rounded">
                  {isSubmitting ? "Sending..." : "Send Message"}
                </Button>
              </div>
            </form>
          </div>

          {/* Additional Help */}
          <div className="mt-6 text-sm text-muted-foreground">
            <p>
              Need immediate assistance? Email us at{" "}
              <a href="mailto:support@in.ink" className="text-foreground underline underline-offset-2">
                support@in.ink
              </a>
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Help;
