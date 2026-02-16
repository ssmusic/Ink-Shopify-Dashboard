import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import AppLayout from "../AppLayout";
import AccountSettings from "./AccountSettings";
import TagsSettings from "./TagsSettings";
import BrandingSettings from "./BrandingSettings";
import CommunicationSettings from "./CommunicationSettings";
import AdvancedSettings from "./AdvancedSettings";
import { useIsMobile } from "../../hooks/use-mobile";

const tabs = [
  { id: "account", label: "Account" },
  { id: "tags", label: "Tag Inventory" },
  { id: "branding", label: "Media" },
  { id: "communication", label: "Communication" },
  { id: "advanced", label: "Advanced" },
];

const Settings = () => {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "account";
  const [activeTab, setActiveTab] = useState(initialTab);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Update active tab when URL param changes
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && tabs.some(t => t.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleTabClick = (tabId: string) => {
    if (tabId === "advanced" && !isMobile) {
      // On desktop, navigate to the Advanced page
      navigate("/app/settings/advanced");
    } else {
      // On mobile or for other tabs, switch tab content
      setActiveTab(tabId);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "account":
        return <AccountSettings />;
      case "tags":
        return <TagsSettings />;
      case "branding":
        return <BrandingSettings />;
      case "communication":
        return <CommunicationSettings />;
      case "advanced":
        return <AdvancedSettings />;
      default:
        return <AccountSettings />;
    }
  };

  return (
    <AppLayout pageTitle="Settings" backTo="/app" backLabel="Back to Dashboard">

      {/* Tab Navigation - Scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-4 sm:gap-8 border-b border-border mb-6 sm:mb-8 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`pb-3 text-sm sm:text-[15px] font-medium transition-colors border-b-2 -mb-[1px] whitespace-nowrap ${
                activeTab === tab.id
                  ? "text-foreground border-foreground"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="bg-card border border-border rounded-sm p-5 sm:p-8">
        {renderTabContent()}
      </div>
    </AppLayout>
  );
};

export default Settings;
