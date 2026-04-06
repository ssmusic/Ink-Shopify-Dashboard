import fetch from "node-fetch";
import * as dotenv from "dotenv";
dotenv.config();

const SHOP = "taimoor1-2.myshopify.com";
const INK_API_URL = process.env.INK_API_URL || "";
const INK_ADMIN_SECRET = process.env.INK_ADMIN_SECRET || "";

const base = INK_API_URL.endsWith("/api") ? INK_API_URL.slice(0, -4) : INK_API_URL;
const url = `${base}/admin/merchants`;

console.log("INK_API_URL:", INK_API_URL);
console.log("Has secret:", !!INK_ADMIN_SECRET, "| Prefix:", INK_ADMIN_SECRET.slice(0, 12));
console.log("Calling URL:", url);

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${INK_ADMIN_SECRET}`,
    "X-Admin-Secret": INK_ADMIN_SECRET,
  },
  body: JSON.stringify({ shop_domain: SHOP, name: SHOP, email: `admin@${SHOP}` }),
});

const responseText = await res.text();
console.log("Status:", res.status);
console.log("Response:", responseText);
