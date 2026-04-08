const https = require("https");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const INK_API_URL = process.env.INK_API_URL || "";
const INK_ADMIN_SECRET = process.env.INK_ADMIN_SECRET || "";
const SHOP_ID = 'shop_a66c803d28e0f57f';

const base = INK_API_URL.replace(/\/$/, "");
const parsed = new URL(`${base}/admin/merchants/${SHOP_ID}/media`);

const options = {
  hostname: parsed.hostname,
  path: parsed.pathname,
  method: "GET",
  headers: {
    "X-Admin-Secret": INK_ADMIN_SECRET,
    "Authorization": "Bearer " + INK_ADMIN_SECRET,
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
req.end();
