import { Page } from "@shopify/polaris";
import PolarisAppLayout from "../PolarisAppLayout";
import AdvancedSettings from "./AdvancedSettings";

const SettingsAdvanced = () => {
  return (
    <PolarisAppLayout>
      <Page
        title="Advanced settings"
        backAction={{ content: "Settings", url: "/app/settings" }}
      >
        <AdvancedSettings />
      </Page>
    </PolarisAppLayout>
  );
};

export default SettingsAdvanced;
