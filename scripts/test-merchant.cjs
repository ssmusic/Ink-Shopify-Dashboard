const https = require("https");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const INK_API_URL = process.env.INK_API_URL || "";
const API_KEY = "ink_live_a078062f42ef76b7b33147eaa94ae9b956e7aaf6f5d37f30";

const base = INK_API_URL.replace(/\/$/, "");
const parsed = new URL(`${base}/admin/merchants/shop_a66c803d28e0f57f`);

const options = {
  hostname: parsed.hostname,
  path: parsed.pathname,
  method: "GET",
  headers: {
    "X-Admin-Secret": process.env.INK_ADMIN_SECRET,
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
