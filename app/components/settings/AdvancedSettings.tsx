import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
import VerificationSettings from "./VerificationSettings";
import WebhooksSettings from "./WebhooksSettings";

const AdvancedSettings = () => {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-6">
        Configure verification thresholds and integrations.
      </p>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="verification" className="border-border">
          <AccordionTrigger className="text-base font-medium hover:no-underline">
            Verification
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <VerificationSettings />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="webhooks" className="border-border">
          <AccordionTrigger className="text-base font-medium hover:no-underline">
            Webhooks
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <WebhooksSettings />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default AdvancedSettings;
