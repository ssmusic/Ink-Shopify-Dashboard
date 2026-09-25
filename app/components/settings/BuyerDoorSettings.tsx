import { useEffect, useState } from "react";
import { Layout } from "@shopify/polaris";
import BuyerDoorCard from "../BuyerDoorCard";
import { BUYER_DOOR_HEADING, type BuyerDoorAnswer, type BuyerDoorChoice } from "../../lib/buyer-door-choice";

// WHERE THE TRACKING LINK GOES — the Ritualist's Settings › Delivery section
// (2026-09-25). The description beside it is PLACEHOLDER. The same card ink draws (../BuyerDoorCard), fed by
// /app/api/settings/buyer-door with the App Bridge session token, the way the
// tab's other sections fetch (DeliveryModeSettings).

async function sessionFetch(path: string, init: RequestInit = {}): Promise<BuyerDoorAnswer> {
  let token = "";
  try {
    // @ts-ignore App Bridge on window
    token = (await window.shopify?.idToken()) || "";
  } catch {
    token = "";
  }
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    const res = await fetch(`${window.location.origin}${path}`, { ...init, headers });
    const body = (await res.json().catch(() => null)) as BuyerDoorAnswer | null;
    return body && typeof body === "object" && "ok" in body
      ? body
      : { ok: false, error: `This setting could not be reached (${res.status}).` }; // PLACEHOLDER
  } catch {
    return { ok: false, error: "This setting could not be reached. Try again." }; // PLACEHOLDER
  }
}

export default function BuyerDoorSettings() {
  const [answer, setAnswer] = useState<BuyerDoorAnswer | null>(null);
  const [result, setResult] = useState<BuyerDoorAnswer | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void sessionFetch("/app/api/settings/buyer-door").then(setAnswer);
  }, []);

  async function save(choice: BuyerDoorChoice) {
    setSaving(true);
    setResult(null);
    const out = await sessionFetch("/app/api/settings/buyer-door", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice }),
    });
    if (out.ok) setAnswer(out);
    setResult(out);
    setSaving(false);
  }

  return (
    <Layout.AnnotatedSection title={BUYER_DOOR_HEADING} description="What your customer sees before they reach the tracking.">
      <BuyerDoorCard answer={answer} result={result} saving={saving} onSave={(c) => void save(c)} hideHeading />
    </Layout.AnnotatedSection>
  );
}
