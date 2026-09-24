// Feature flags — compile-time, one line to flip.
//
// FEATURE_NFC: the NFC-tag hardware lane (tag inventory, reorders, low-stock
// alerts, warehouse tagging). TABLED 2026-07-05 — the product pivoted to
// email/SMS comms + the order page; NFC returns later as a premium lane.
// Tabled, never deleted: all NFC components/routes stay in the tree, this
// flag just keeps them off merchant surfaces. Flip to true to bring the
// hardware lane back.
export const FEATURE_NFC = false;
//
// FEATURE_NOTIFICATIONS: the Ritualist's own buyer notifications — the email
// channel and the delivery messages ("Out for delivery", "Delivered", the
// open's). NOT SENDING: Sam, 2026-09-24, "we dont have notifacations yet";
// nothing schedules api.jobs.notifications. Off, so no merchant surface
// promises a send that does not happen. The toggles, their stored choices and
// the senders stay in the tree; flip to true when the sends are real.
export const FEATURE_NOTIFICATIONS = false;
// Dev/ops-route gate lives in flags.server.ts (reads process.env — must never
// be bundled client-side, unlike this compile-time flag).
