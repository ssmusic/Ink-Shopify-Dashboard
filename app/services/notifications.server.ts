import sendgrid from "@sendgrid/mail";
import twilio from "twilio";
import { EmailService } from "./email.server";

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

const twilioClient = TWILIO_SID && TWILIO_TOKEN ? twilio(TWILIO_SID, TWILIO_TOKEN) : null;

/**
 * Normalize a phone number to E.164 (Twilio rejects anything else).
 * Returns null for anything we can't confidently coerce — callers must bail
 * rather than send to a malformed number.
 */
function normalizeE164(p?: string | null): string | null {
  if (!p) return null;
  const d = p.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d;
  const only = d.replace(/\D/g, "");
  if (only.length === 10) return `+1${only}`;
  if (only.length === 11 && only.startsWith("1")) return `+${only}`;
  return null;
}

export type NotificationType =
  | "outForDelivery" 
  | "delivered" 
  | "deliveryConfirmed" 
  | "hours4" 
  | "hours24" 
  | "hours48" 
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
  /**
   * Whether the customer has AFFIRMATIVELY opted in to SMS (Shopify
   * smsMarketingConsent === SUBSCRIBED). SMS is default-deny: it is sent only
   * when this is explicitly true. A phone number being present is NOT consent
   * (Twilio toll-free reason 30475 / TCPA).
   */
  smsConsent?: boolean;
}

export const NotificationService = {
  async dispatch(payload: NotificationPayload, settings: any) {
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

    // 2. Dispatch SMS — HARD default-deny consent gate. We only text customers
    // who have affirmatively opted in to SMS (Shopify smsMarketingConsent ===
    // SUBSCRIBED, surfaced as payload.smsConsent). A phone number being present
    // is NOT consent (Twilio toll-free reason 30475 / TCPA).
    if (channels?.sms && payload.smsConsent === true && toPhone) {
      smsSent = await this.sendSms(payload);
    } else if (channels?.sms && payload.smsConsent !== true) {
      console.log(`[NotificationService] SMS skipped for ${payload.orderName} — customer has not opted in to SMS (no consent).`);
    } else if (channels?.sms && !toPhone) {
      console.warn(`[NotificationService] SMS channel enabled but no phone number provided for order ${payload.orderName}`);
    }

    // 3. Dispatch Email if channel is enabled
    if (channels?.email && toEmail) {
      emailSent = await this.sendEmail(payload);
    }

    return emailSent || smsSent;
  },

  isNotificationEnabled(type: NotificationType, settings: any): boolean {
    if (!settings) return false;
    const { delivery, reminders, returnReminders } = settings;
    
    switch (type) {
      case "outForDelivery": return !!delivery?.outForDelivery;
      case "delivered": return !!delivery?.delivered;
      case "deliveryConfirmed": return !!delivery?.deliveryConfirmed;
      case "hours4": return !!reminders?.hours4;
      case "hours24": return !!reminders?.hours24;
      case "hours48": return !!reminders?.hours48;
      case "return7d": return !!returnReminders?.days7;
      case "return48h": return !!returnReminders?.hours48;
      default: return false;
    }
  },

  async sendSms(payload: NotificationPayload): Promise<boolean> {
    if (!twilioClient) {
      console.warn("⚠️ Twilio credentials missing. SMS service disabled.");
      return false;
    }

    // Normalize the recipient to E.164. Bail on anything we can't coerce —
    // Twilio would reject it anyway. Never log the phone number.
    const toNumber = normalizeE164(payload.toPhone);
    if (!toNumber) {
      console.warn("⚠️ SMS skipped: recipient phone is missing or not a valid number.");
      return false;
    }

    // Strip a known-bad legacy link before sending. The old `in.ink/verify/...`
    // URL is broken (wrong host + not the real token); if we see it, drop the
    // URL so the body falls back to the no-link copy rather than SMS a dead link.
    if (payload.verifyUrl && /in\.ink\/verify\//.test(payload.verifyUrl)) {
      payload = { ...payload, verifyUrl: undefined };
    }

    // Format message based on type
    let messageBody = "";
    
    switch (payload.type) {
      case "outForDelivery":
        messageBody = `Hi ${payload.customerName}, your order ${payload.orderName} from ${payload.merchantName} is out for delivery today. Get ready to tap your ink. sticker!`;
        break;
      case "delivered":
        messageBody = payload.verifyUrl
          ? `Your ${payload.merchantName} order ${payload.orderName} was delivered. Your receipt + returns: ${payload.verifyUrl}`
          : `Your package ${payload.orderName} has arrived! Tap the ink. sticker on the box to verify delivery and unlock your return window.`;
        break;
      case "deliveryConfirmed":
        messageBody = `Verified! Your ink. delivery for ${payload.orderName} is confirmed. ${payload.verifyUrl ? `View your passport: ${payload.verifyUrl}` : ""}`;
        break;
      case "hours4":
        messageBody = `Hi ${payload.customerName}, we noticed your package ${payload.orderName} arrived earlier today. Please tap the ink. sticker to verify it!`;
        break;
      case "hours24":
        messageBody = `Reminder: Tap the ink. sticker on your recent delivery (${payload.orderName}) to verify it and unlock your ${payload.returnWindowDays || 30}-day return window.`;
        break;
      case "hours48":
        messageBody = `Final reminder from ${payload.merchantName}: Please tap the ink. sticker on your order ${payload.orderName} to properly register your delivery.`;
        break;
      case "return7d":
        messageBody = `Hi ${payload.customerName}, you have 7 days left to return order ${payload.orderName}. Need to start a return? Click here: ${payload.verifyUrl}`;
        break;
      case "return48h":
        messageBody = `Warning: Your return window for ${payload.merchantName} order ${payload.orderName} closes in 48 hours. Manage it here: ${payload.verifyUrl}`;
        break;
    }

    // Production A2P / toll-free pools send via a Messaging Service; otherwise
    // fall back to a single normalized from-number. Guard the from-number too —
    // if neither a Messaging Service nor a valid from-number is configured, we
    // can't send.
    const fromNumber = normalizeE164(TWILIO_PHONE);
    if (!TWILIO_MESSAGING_SERVICE_SID && !fromNumber) {
      console.warn("⚠️ SMS skipped: no TWILIO_MESSAGING_SERVICE_SID and no valid TWILIO_PHONE_NUMBER configured.");
      return false;
    }

    const createParams: any = {
      body: messageBody,
      to: toNumber,
    };
    if (TWILIO_MESSAGING_SERVICE_SID) {
      createParams.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
    } else {
      createParams.from = fromNumber;
    }

    try {
      await twilioClient.messages.create(createParams);
      console.log(`✅ SMS (${payload.type}) sent via Twilio.`);
      return true;
    } catch (error: any) {
      // Surface Twilio's code + message (e.g. 21608 trial-unverified recipient,
      // 21211 bad to-number, 21610 unsubscribed). Never log phone/creds.
      console.error(`❌ Twilio SMS failed [code ${error?.code ?? "?"}]: ${error?.message ?? error}`);
      return false;
    }
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
        body = `Hi ${payload.customerName},\n\nYour order is out for delivery today. Get ready to tap your ink. sticker!`;
        break;
      case "delivered":
        subject = subjectPrefix + "Delivered - Tap Your Sticker!";
        body = `Your package has arrived!\n\nTap the ink. sticker on the box with your phone to verify delivery and unlock your return window.`;
        break;
      case "hours4":
      case "hours24":
      case "hours48":
        subject = subjectPrefix + "Friendly Reminder to Tap Your Sticker";
        body = `Hi ${payload.customerName},\n\nWe noticed your package arrived recently. Please tap the ink. sticker to verify it and unlock returns.`;
        break;
      case "return7d":
        subject = subjectPrefix + "7 Days Left to Return";
        body = `Hi ${payload.customerName},\n\nYou have 7 days left to return your order. Need to start a return? Click here: ${payload.verifyUrl}`;
        break;
      case "return48h":
        subject = subjectPrefix + "Return Window Closing Soon";
        body = `Warning: Your return window closes in 48 hours. Manage it here: ${payload.verifyUrl}`;
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
