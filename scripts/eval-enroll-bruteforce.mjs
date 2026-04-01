import fetch from "node-fetch";

async function fuzzMap() {
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
      country: "United States",
      phone: ""
    },
    product_details: [
      { sku: "SKU-0", name: "Ski Wax", quantity: 1, price: 15.99 }
    ],
    nfc_uid: "53:12:62:6a:a2:00:01"
  };

  const tests = [
    { name: "base", mod: {} },
    { name: "remove_nfc_uid", mod: { nfc_uid: undefined } },
    { name: "add_shop", mod: { shop: "taimoor1-2.myshopify.com" } },
    { name: "add_merchant_id", mod: { merchant_id: "taimoor1-2.myshopify.com" } },
    { name: "zipCode", mod: { shipping_address: { ...base.shipping_address, zipCode: "08053" } } },
    { name: "product_id", mod: { product_details: [{ product_id: "1", sku: "SKU-0", name: "Ski Wax", quantity: 1, price: 15.99 }] } },
    { name: "shipping_phone", mod: { shipping_address: { ...base.shipping_address, phone: "+15555555" } } },
    { name: "customer_phone_real", mod: { customer_phone: "+15555555" } },
    { name: "nfc_uid_clean", mod: { nfc_uid: "5312626aa20001" } },
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
      console.log(`[SUCCESS or DIFF ERROR] ${t.name} -> ${res.status}: ${text}`);
    }
  }
  console.log("Fuzzing complete.");
}

fuzzMap();
