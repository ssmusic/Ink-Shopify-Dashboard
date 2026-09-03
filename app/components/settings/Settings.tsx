import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Page, Tabs } from "@shopify/polaris";
import PolarisAppLayout from "../PolarisAppLayout";
import AccountSettings from "./AccountSettings";
import TagsSettings from "./TagsSettings";
import { FEATURE_NFC } from "../../flags";
import BrandingSettings from "./BrandingSettings";
import CommunicationSettings from "./CommunicationSettings";
import DeliveryModeSettings from "./DeliveryModeSettings";

const tabs = [
  { id: "account", content: "Account" },
  { id: "delivery", content: "Delivery" },
  // NFC tag inventory — tabled behind FEATURE_NFC (app/flags.ts)
  ...(FEATURE_NFC ? [{ id: "tags", content: "Inventory" }] : []),
  { id: "branding", content: "Media" },
  { id: "communication", content: "Notifications" },
];

const Settings = ({ initialData }: { initialData?: any }) => {
  const [searchParams] = useSearchParams();
  const initialTab = tabs.findIndex(t => t.id === (searchParams.get("tab") || "account"));
  const [selected, setSelected] = useState(Math.max(initialTab, 0));

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const idx = tabs.findIndex(t => t.id === tabParam);
    if (idx >= 0) setSelected(idx);
  }, [searchParams]);

  const handleTabChange = useCallback((index: number) => setSelected(index), []);

  const renderTabContent = () => {
    switch (tabs[selected]?.id) {
      case "account": return <AccountSettings />;
      case "delivery": return <DeliveryModeSettings />;
      case "tags": return <TagsSettings inventoryData={initialData?.inventoryData} />;
      case "branding": return <BrandingSettings />;
      // shopDomain builds the deep link into THIS store's Shopify notification
      // settings — the merchant shouldn't have to go find it.
      case "communication": return <CommunicationSettings shopDomain={initialData?.shopDomain} />;
      default: return <AccountSettings />;
    }
  };

  return (
    <PolarisAppLayout>
      <Page title="Settings">
        <Tabs tabs={tabs} selected={selected} onSelect={handleTabChange}>
          <div style={{ paddingTop: "16px" }}>
            {renderTabContent()}
          </div>
        </Tabs>
      </Page>
    </PolarisAppLayout>
  );
};

export default Settings;
