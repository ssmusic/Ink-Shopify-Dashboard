// Adds inventory to taimoor1-2.myshopify.com via Alan's admin API.
// Current balance: -26. Adding +126 to reach 100.
const https = require("https");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const INK_API_URL    = process.env.INK_API_URL || "";
const INK_ADMIN_SECRET = process.env.INK_ADMIN_SECRET || "";

const SHOP_ID = "shop_a66c803d28e0f57f";
const DELTA   = 126;   // -26 + 126 = 100 stickers
const REASON  = "pilot_inventory_top_up";

const base = INK_API_URL.replace(/\/$/, "");
const fullUrl = `${base}/admin/merchants/${SHOP_ID}/inventory`;
const parsed = new URL(fullUrl);

console.log("Calling:", fullUrl);
console.log("Delta:  ", DELTA, "(will bring balance to ~100)");

const body = JSON.stringify({ quantity: DELTA, reason: REASON });

const options = {
  hostname: parsed.hostname,
  path: parsed.pathname,
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
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
req.write(body);
req.end();
