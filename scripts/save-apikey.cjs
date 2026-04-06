// Saves the fresh API key from Alan's API into Firestore
const admin = require("firebase-admin");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

const SHOP_DOMAIN = "taimoor1-2.myshopify.com";
const NEW_API_KEY  = "ink_live_a078062f42ef76b7b33147eaa94ae9b956e7aaf6f5d37f30";
const SHOP_ID      = "shop_a66c803d28e0f57f";

async function run() {
  console.log("Saving to Firestore...");

  // Write by shop domain as doc ID (the lookup key the app uses)
  await db.collection("merchants").doc(SHOP_DOMAIN).set({
    shopDomain:  SHOP_DOMAIN,
    shop_id:     SHOP_ID,
    ink_api_key: NEW_API_KEY,
    updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
    createdAt:   admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log("✅ Saved merchants/" + SHOP_DOMAIN);

  // Verify
  const doc = await db.collection("merchants").doc(SHOP_DOMAIN).get();
  const data = doc.data();
  console.log("Verified doc:");
  console.log("  shopDomain:", data.shopDomain);
  console.log("  shop_id:   ", data.shop_id);
  console.log("  api_key:   ", (data.ink_api_key || "").slice(0, 20) + "...");

  process.exit(0);
}

run().catch(e => { console.error("Error:", e.message); process.exit(1); });
