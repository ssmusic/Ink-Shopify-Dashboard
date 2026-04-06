// CommonJS version for compatibility
const https = require("https");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const SHOP = "taimoor1-2.myshopify.com";
const INK_API_URL = process.env.INK_API_URL || "";
const INK_ADMIN_SECRET = process.env.INK_ADMIN_SECRET || "";

// For /admin/* paths: INK_API_URL already ends in /api, so just append /admin/merchants
// Result: https://us-central1-inink-c76d3.cloudfunctions.net/api/admin/merchants
const fullUrl = INK_API_URL.replace(/\/$/, "") + "/admin/merchants";
const parsed = new URL(fullUrl);

console.log("Calling:", fullUrl);
console.log("Secret prefix:", INK_ADMIN_SECRET.slice(0, 12));

const body = JSON.stringify({ shop_domain: SHOP, shop_name: SHOP, owner_email: "admin@" + SHOP });

const options = {
  hostname: parsed.hostname,
  path: parsed.pathname,
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Authorization": "Bearer " + INK_ADMIN_SECRET,
    "X-Admin-Secret": INK_ADMIN_SECRET,
  },
};

const req = https.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => data += chunk);
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Response:", data);
  });
});

req.on("error", (e) => console.error("Request error:", e.message));
req.write(body);
req.end();
