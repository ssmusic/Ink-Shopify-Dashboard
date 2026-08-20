import SettingsAdvanced from "../components/settings/SettingsAdvanced";

export async function loader() {
  // Plain object — see app.settings.tsx for why a Response breaks RR7 here.
  return {};
}

export default function AdvancedSettingsPage() {
  return <SettingsAdvanced />;
}
