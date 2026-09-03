import sendgrid from "@sendgrid/mail";
import { EmailService } from "./email.server";


// Tap-reminder events (hours4/24/48) removed 2026-08-07: NFC-era relics
// (Sam: "tap reminders were from when this was nfc tags"), never scheduled,
// never sent. return7d/return48h stay declared — the page shows them as
// coming soon and the scheduler build will light them up.
export type NotificationType =
  | "outForDelivery"
  | "delivered"
  | "deliveryConfirmed"
  | "return7d"
  | "return48h";

export interface NotificationPayload {
  type: NotificationType;
  toEmail?: string;
  toPhone?: string;
  customerName: string;
  orderName: string;
  merchantName: string;
  verifyUrl?: string; // Tap link / Verification link
  returnWindowDays?: number;
}

/** THE GATE the branded rail always had and this rail did not
 *  (state-email.server.ts:60-80 semantics, shared verbatim):
 *   · a test-flagged merchant never reaches a real customer;
 *   · a non-empty SEND_ALLOWLIST excludes everyone not on it;
 *   · an allowlisted recipient is reachable even from a test merchant
 *     (that is how demos send to Sam);
 *   · missing merchant data or missing recipient fails CLOSED.
 *  Without this, a returns_test_mode store with delivery.delivered=true
 *  would have plain-text-emailed a real buyer (audit 2026-08-07). */
export function notificationSendAllowed(
  merchantData: Record<string, any> | null | undefined,
  recipient: string | null | undefined,
): boolean {
  if (!merchantData) return false;
  const to = (recipient || "").trim().toLowerCase();
  if (!to) return false;

  const allowlist = (process.env.SEND_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const allowlisted = allowlist.includes(to);

  if (allowlist.length > 0 && !allowlisted) return false;

  const isTestMerchant = Boolean(merchantData.returns_test_mode || merchantData.is_test);
  if (isTestMerchant && !allowlisted) return false;

  return true;
}

export const NotificationService = {
  async dispatch(
    payload: NotificationPayload,
    settings: any,
    merchantData: Record<string, any> | null | undefined,
  ) {
    const { type, toEmail, toPhone } = payload;

    // 1. Check if specific notification type is enabled in settings
    const isEnabled = this.isNotificationEnabled(type, settings);
    if (!isEnabled) {
      console.log(`[NotificationService] Skipped ${type} - disabled by merchant settings.`);
      return false;
    }

    const { channels } = settings;

    let emailSent = false;
    let smsSent = false;

    // 2. Dispatch SMS if channel is enabled — through the gate
    if (channels?.sms && toPhone) {
      if (notificationSendAllowed(merchantData, toPhone)) {
        smsSent = await this.sendSms(payload);
      } else {
        console.log(`[NotificationService] GATED ${type} SMS for ${payload.orderName} (test merchant / allowlist).`);
      }
    } else if (channels?.sms && !toPhone) {
      console.warn(`[NotificationService] SMS channel enabled but no phone number provided for order ${payload.orderName}`);
    }

    // 3. Dispatch Email if channel is enabled — through the gate
    if (channels?.email && toEmail) {
      if (notificationSendAllowed(merchantData, toEmail)) {
        emailSent = await this.sendEmail(payload);
      } else {
        console.log(`[NotificationService] GATED ${type} email for ${payload.orderName} (test merchant / allowlist).`);
      }
    }

    return emailSent || smsSent;
  },

  isNotificationEnabled(type: NotificationType, settings: any): boolean {
    if (!settings) return false;
    const { delivery, returnReminders } = settings;

    switch (type) {
      case "outForDelivery": return !!delivery?.outForDelivery;
      case "delivered": return !!delivery?.delivered;
      case "deliveryConfirmed": return !!delivery?.deliveryConfirmed;
      case "return7d": return !!returnReminders?.days7;
      case "return48h": return !!returnReminders?.hours48;
      default: return false;
    }
  },

  // SMS DOES NOT EXIST. There is no sending number and no provider (Sam,
  // 2026-09-03: "we dont have twilio so we dont have sms"). The channel stays
  // in the settings document so nothing reading it breaks; asking it to send
  // is answered honestly with false, never with a promise.
  async sendSms(payload: NotificationPayload): Promise<boolean> {
    console.log(`[NotificationService] SMS not configured — ${payload.type} text for ${payload.orderName} not sent.`);
    return false;
  },

  async sendEmail(payload: NotificationPayload): Promise<boolean> {
    if (!payload.toEmail) return false;

    // For Delivery Confirmed, we use the existing Return Passport Email template
    if (payload.type === "deliveryConfirmed" && payload.verifyUrl) {
      return EmailService.sendReturnPassportEmail({
        to: payload.toEmail,
        customerName: payload.customerName,
        orderName: payload.orderName,
        merchantName: payload.merchantName,
        proofUrl: payload.verifyUrl,
        returnWindowDays: payload.returnWindowDays,
      });
    }

    // For other types, we'd normally expand email.server.ts to handle them,
    // but for now we will send a basic text notification.
    const subjectPrefix = `[${payload.merchantName}] Order ${payload.orderName}: `;
    let subject = "";
    let body = "";

    switch (payload.type) {
      case "outForDelivery":
        subject = subjectPrefix + "Out for Delivery";
        body = `Hi ${payload.customerName},\n\nYour order is out for delivery today.`;
        break;
      case "delivered":
        subject = subjectPrefix + "Delivered";
        body = `Your package has arrived.${payload.verifyUrl ? `\n\nYour receipt + returns: ${payload.verifyUrl}` : ""}`;
        break;
      case "return7d":
        subject = subjectPrefix + "7 Days Left to Return";
        body = `Hi ${payload.customerName},\n\nYou have 7 days left to return your order. Need to start a return? Click here: ${payload.verifyUrl}`;
        break;
      case "return48h":
        subject = subjectPrefix + "Return Window Closing Soon";
        body = `Your return window closes in 48 hours. Manage it here: ${payload.verifyUrl}`;
        break;
    }

    // Simplified send via existing Sendgrid setup (if available)
    if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
        try {
           sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
           await sendgrid.send({
              to: payload.toEmail,
              from: process.env.SENDGRID_FROM_EMAIL,
              subject,
              text: body,
           });
           console.log(`✅ Email (${payload.type}) sent to ${payload.toEmail}`);
           return true;
        } catch (error: any) {
           console.error(`❌ SendGrid failed:`, error.message);
           return false;
        }
    }

    return false;
  }
};
