import { Card, Text } from "@shopify/polaris";
// WebhooksSettings removed from render (kept in tree, unreferenced): it was
// pure mock theater — a fake secret, a fake "Test webhook" that slept 1.5s
// and claimed success, a fabricated activity log. Real webhook registration
// is automatic (app.tsx registerWebhooks); there is nothing for a merchant
// to configure here.
//
// VerificationSettings removed from render (kept in tree, unreferenced), for
// the same reason and one more (2026-09-24). Its thresholds saved nothing —
// its "Settings saved" toast sent no request — and they judged a delivery by
// its distance: "auto-verified" within 100 m, a phone check between 100 and
// 300 m, "Flag for review" beyond. ink judges no distance and never says a
// delivery was verified (Sam, 2026-09-24; lib/order-marks.ts).

const AdvancedSettings = () => (
  <Card>
    {/* ⚠️ PLACEHOLDER COPY — Sam's words. */}
    <Text as="p" tone="subdued">
      There is nothing to configure here.
    </Text>
  </Card>
);

export default AdvancedSettings;
