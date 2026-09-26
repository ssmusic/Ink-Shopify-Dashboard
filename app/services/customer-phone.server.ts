import { FEATURE_NFC, FEATURE_NOTIFICATIONS } from "../flags";
import { isInk } from "./app-flavor.server";

// Phone is needed only by the tabled hardware / notification lanes. Neither
// the current order page nor its activity record needs a buyer's number.
export function collectsCustomerPhone(): boolean {
  return !isInk() && (FEATURE_NFC || FEATURE_NOTIFICATIONS);
}
