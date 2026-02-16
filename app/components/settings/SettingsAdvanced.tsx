import AppLayout from "../AppLayout";
import AdvancedSettings from "./AdvancedSettings";

const SettingsAdvanced = () => {
  return (
    <AppLayout pageTitle="Advanced Settings" backTo="/app/settings" backLabel="Back to Settings">
      {/* Content */}
      <div className="bg-card border border-border rounded-sm p-5 sm:p-8">
        <AdvancedSettings />
      </div>
    </AppLayout>
  );
};

export default SettingsAdvanced;
