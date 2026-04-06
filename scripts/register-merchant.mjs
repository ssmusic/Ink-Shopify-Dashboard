/**
 * Script: register-merchant.mjs
 * Re-registers taimoor1-2.myshopify.com with Alan's backend API
 * and updates the Firestore merchants collection with the fresh API key.
 *
 * Run: node scripts/register-merchant.mjs
 */

import fetch from "node-fetch";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

// ── Config ──────────────────────────────────────────────────────────────────
const SHOP_DOMAIN    = "taimoor1-2.myshopify.com";
const INK_API_URL    = process.env.INK_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api";
const INK_ADMIN_SECRET = process.env.INK_ADMIN_SECRET;

if (!INK_ADMIN_SECRET) {
  console.error("❌ INK_ADMIN_SECRET is not set in .env");
  process.exit(1);
}

// ── Firebase init ───────────────────────────────────────────────────────────
initializeApp({
  credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

// ── Helpers ─────────────────────────────────────────────────────────────────
function getAlanUrl(path) {
  const base = INK_API_URL.endsWith("/") ? INK_API_URL.slice(0, -1) : INK_API_URL;
  if (path.startsWith("/api/") && base.endsWith("/api")) {
    return `${base.slice(0, -4)}${path}`;
  }
  return `${base}${path}`;
}

async function run() {
  console.log("══════════════════════════════════════════════════");
  console.log("🔧 Registering merchant:", SHOP_DOMAIN);
  console.log("══════════════════════════════════════════════════");

  // ── Step 1: Call Alan's Admin API to create/get the merchant ──────────────
  const registerUrl = getAlanUrl("/admin/merchants");
  console.log("\n📡 Calling:", registerUrl);

  const payload = {
    shop_domain: SHOP_DOMAIN,
    name:        SHOP_DOMAIN,
    email:       `admin@${SHOP_DOMAIN}`,
  };
  console.log("   Payload:", JSON.stringify(payload));

  const res = await fetch(registerUrl, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${INK_ADMIN_SECRET}`,
      "X-Admin-Secret": INK_ADMIN_SECRET,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  console.log(`\n📥 Alan API response [${res.status}]:`, responseText);

  let inkData;
  try {
    inkData = JSON.parse(responseText);
  } catch {
    console.error("❌ Could not parse response as JSON");
    process.exit(1);
  }

  // ── Step 2: Extract the API key from the response ─────────────────────────
  const apiKey = inkData?.api_key || inkData?.data?.api_key || inkData?.merchant?.api_key;

  if (!apiKey) {
    console.error("❌ No api_key found in response. Full response:", JSON.stringify(inkData, null, 2));
    console.log("\n💡 The merchant may already exist. Checking if there is an existing key...");

    // Try GET to fetch the existing merchant
    const merchantId = inkData?.id || inkData?.merchant_id || inkData?.data?.id;
    if (merchantId) {
      const getUrl = getAlanUrl(`/admin/merchants/${merchantId}`);
      const getRes = await fetch(getUrl, {
        headers: { "Authorization": `Bearer ${INK_ADMIN_SECRET}`, "X-Admin-Secret": INK_ADMIN_SECRET }
      });
      const getData = await getRes.json();
      console.log("📥 Existing merchant data:", JSON.stringify(getData, null, 2));
    }
    process.exit(1);
  }

  console.log("\n✅ Got API key from Alan:", apiKey.slice(0, 15) + "...");

  // ── Step 3: Update Firestore ───────────────────────────────────────────────
  console.log("\n💾 Updating Firestore merchants collection...");

  // Try by document ID first
  const docRef = db.collection("merchants").doc(SHOP_DOMAIN);
  await docRef.set({
    shopDomain:  SHOP_DOMAIN,
    ink_api_key: apiKey,
    updatedAt:   new Date(),
    createdAt:   new Date(),
  }, { merge: true });

  console.log("✅ Firestore updated at merchants/", SHOP_DOMAIN);

  // ── Step 4: Verify ────────────────────────────────────────────────────────
  const saved = await docRef.get();
  console.log("\n🔍 Verification — Firestore doc:", JSON.stringify(saved.data(), null, 2));

  console.log("\n══════════════════════════════════════════════════");
  console.log("✅ Done! Merchant registered and Firestore updated.");
  console.log("   API Key prefix:", apiKey.slice(0, 15) + "...");
  console.log("══════════════════════════════════════════════════");
}

run().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
