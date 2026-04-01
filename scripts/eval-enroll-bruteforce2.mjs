import fetch from "node-fetch";

async function fuzzMap2() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";
  
  const base = {
    order_id: "7756436701470",
    nfc_token: "nfc_7756436701470_" + Date.now(),
    order_number: "1046",
    customer_email: "Taimooralideveloper@gmail.com",
    customer_phone: "",
    shipping_address: {
      line1: "123 Main St",
      line2: "Apt 2",
      city: "Marlton",
      state: "New Jersey",
      zip: "08053",
      country: "United States"
    },
    product_details: [
      { sku: "SKU-0", name: "Ski Wax", quantity: 1, price: 15.99 }
    ],
    nfc_uid: "53:12:62:6a:a2:00:01"
  };

  const tests = [
    { name: "platform", mod: { platform: "shopify" } },
    { name: "carrier", mod: { carrier_name: "USPS", tracking_number: "123" } },
    { name: "camelCarrier", mod: { carrierName: "USPS", trackingNumber: "123" } },
    { name: "warehouse", mod: { warehouse_location: { lat: 0, lng: 0 } } },
    { name: "orderDate", mod: { order_date: new Date().toISOString() } },
    { name: "timestamp", mod: { timestamp: Date.now() } },
    { name: "shop_id", mod: { shop_id: "123" } },
    { name: "merchant", mod: { merchant: "taimoor1-2.myshopify.com" } },
    { name: "merchant_domain", mod: { merchant_domain: "taimoor1-2.myshopify.com" } },
  ];

  for (const t of tests) {
    const p = { ...base, ...t.mod };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(p)
    });
    const text = await res.text();
    if (!text.includes("Missing required fields")) {
      console.log(`[FOUND IT] ${t.name} -> ${res.status}: ${text}`);
    }
  }
  console.log("Fuzzer 2 complete.");
}

fuzzMap2();
