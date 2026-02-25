import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import bcrypt from "bcryptjs";
import sgMail from "@sendgrid/mail";

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const COLLECTION = "warehouse_users";
const SALT_ROUNDS = 12;

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// ─── GET: list all users for this shop ───────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const snapshot = await firestore
    .collection(COLLECTION)
    .where("shopDomain", "==", shopDomain)
    .get();

  // Sort client-side to avoid requiring a Firestore composite index
  const users = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        email: data.email,
        role: data.role,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    })
    .sort((a, b) => {
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return json({ users });
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

    // Check for duplicate email within this shop
    const existing = await firestore
      .collection(COLLECTION)
      .where("shopDomain", "==", shopDomain)
      .where("email", "==", email.toLowerCase())
      .get();

    if (!existing.empty) {
      return json({ error: "A user with this email already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const docRef = await firestore.collection(COLLECTION).add({
      name,
      email: email.toLowerCase(),
      passwordHash,
      shopDomain,
      role: "operator",
      createdAt: new Date(),
    });

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
      // Non-fatal — user is still created
    }

    return json({ success: true, userId: docRef.id });
  }

  // ── Update ──
  if (intent === "update") {
    const { userId, name, password } = body;

    if (!userId) {
      return json({ error: "userId is required" }, { status: 400 });
    }

    // Verify the user belongs to this shop
    const docRef = firestore.collection(COLLECTION).doc(userId);
    const doc = await docRef.get();

    if (!doc.exists || doc.data()?.shopDomain !== shopDomain) {
      return json({ error: "User not found" }, { status: 404 });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (password) updates.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await docRef.update(updates);
    return json({ success: true });
  }

  // ── Delete ──
  if (intent === "delete") {
    const { userId } = body;

    if (!userId) {
      return json({ error: "userId is required" }, { status: 400 });
    }

    const docRef = firestore.collection(COLLECTION).doc(userId);
    const doc = await docRef.get();

    if (!doc.exists || doc.data()?.shopDomain !== shopDomain) {
      return json({ error: "User not found" }, { status: 404 });
    }

    await docRef.delete();
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};
