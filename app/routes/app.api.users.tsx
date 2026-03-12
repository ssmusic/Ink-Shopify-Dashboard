import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { adminCreateUser, getShopIdByDomain, getMerchantUsers, deleteMerchantUser } from "../services/ink-api.server";
import sgMail from "@sendgrid/mail";

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

// ─── GET: list all users for this shop ───────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    try {
        // Users were created with merchant_id = shopDomain (not shop_id),
        // so we query using the domain string directly.
        const data = await getMerchantUsers(shopDomain);
        
        const users = (data.users || []).map((u: any) => ({
            id: u.user_id,
            name: u.name,
            email: u.email,
            role: "operator",
            createdAt: u.created_at || null
        })).sort((a: any, b: any) => {
            if (!a.createdAt) return 1;
            if (!b.createdAt) return -1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        return json({ users });
    } catch (e: any) {
        console.error("[Users Loader] Proxy error:", e);
        return json({ users: [], error: e.message });
    }
  } catch (err: any) {
    if (err instanceof Response) {
      console.warn("[Users Loader] Auth redirect caught — returning empty user list");
      return json({ users: [] });
    }
    console.error("[Users Loader] Unexpected error:", err);
    return json({ users: [], error: "Failed to load users" });
  }
};


// ─── POST: create / update / delete ──────────────────────────────────────────
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const body = await request.json();
  const { intent } = body;

  // ── Create ──
  if (intent === "create") {
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return json({ error: "Name, email and password are required" }, { status: 400 });
    }

    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }

    let inkUserId = "";

    try {
      // Create User in INK Backend via Admin Proxy
      const data = await adminCreateUser(shopDomain, name, email, password);
      inkUserId = data.user_id;
      console.log(`[UserManagement] Successfully created user in INK Backend: ${inkUserId}`);
    } catch (inkError: any) {
      console.error("[UserManagement] Failed to create user in INK:", inkError);
      return json({ error: inkError.message || "Failed to create user in INK System" }, { status: 400 });
    }

    // Send welcome email
    try {
      await sgMail.send({
        to: email,
        from: process.env.SENDGRID_FROM_EMAIL || "noreply@in.ink",
        subject: "You've been added to the INK Warehouse App",
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
            <h2 style="margin-bottom: 8px;">Welcome to INK Warehouse, ${name}!</h2>
            <p style="color: #555;">You've been granted access to the INK Warehouse App. Here are your login credentials:</p>
            <table style="border-collapse: collapse; width: 100%; margin: 24px 0;">
              <tr>
                <td style="padding: 10px; font-weight: bold; background: #f4f4f5; border: 1px solid #e4e4e7;">User ID (Email)</td>
                <td style="padding: 10px; border: 1px solid #e4e4e7;">${email.toLowerCase()}</td>
              </tr>
              <tr>
                <td style="padding: 10px; font-weight: bold; background: #f4f4f5; border: 1px solid #e4e4e7;">Password</td>
                <td style="padding: 10px; border: 1px solid #e4e4e7;">${password}</td>
              </tr>
            </table>
            <a href="https://warehouse-bee05.web.app/login"
               style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
              Login to Warehouse App →
            </a>
            <p style="margin-top: 24px; font-size: 12px; color: #999;">
              Please change your password after your first login. Do not share your credentials.
            </p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("[UserManagement] Failed to send welcome email:", emailErr);
    }

    return json({ success: true, userId: inkUserId });
  }

  // ── Update ──
  if (intent === "update") {
     // NOTE: The INK API specs provided do not document an update endpoint right now.
     // Returning 501 Not Implemented until the INK backend supports it.
     return json({ error: "Updating users is currently not supported by the INK API." }, { status: 501 });
  }

  // ── Delete ──
  if (intent === "delete") {
    const { userId } = body;

    if (!userId) {
      return json({ error: "userId is required" }, { status: 400 });
    }

    try {
        await deleteMerchantUser(userId);
        return json({ success: true });
    } catch (e: any) {
        console.error("[UserManagement] Failed to delete user:", e);
        return json({ error: e.message || "Failed to delete user" }, { status: 500 });
    }
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};
