import { json } from "@remix-run/node";
import SettingsAdvanced from "../components/settings/SettingsAdvanced";

export async function loader() {
  return json({});
}

export default function AdvancedSettingsPage() {
  return <SettingsAdvanced />;
}
