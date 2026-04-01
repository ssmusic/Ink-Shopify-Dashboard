import fetch from "node-fetch";

async function fuzzMap4() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";
  
  const base = {
    order_id: "7756436701470" + Date.now(),
    nfc_token: "nfc_" + Date.now(),
    order_number: "1046",
    customer_email: "Taimooralideveloper@gmail.com",
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
    ]
  };

  const tests = [
    { name: "int_order_id", mod: { ...base, order_id: 7756436701470, order_number: 1046 } },
    { name: "no_line2", mod: { ...base, shipping_address: { line1: "123 Main St", city: "Marlton", state: "New Jersey", zip: "08053", country: "United States" } } },
    { name: "int_price", mod: { ...base, product_details: [{ sku: "SKU", name: "Wax", quantity: 1, price: 15 }] } },
    { name: "string_quantity", mod: { ...base, product_details: [{ sku: "SKU", name: "Wax", quantity: "1", price: 15.99 }] } },
    { name: "products_instead", mod: { ...base, products: [{ sku: "SKU-0", name: "Ski Wax", quantity: 1, price: 15.99 }], product_details: undefined } },
    { name: "items_instead", mod: { ...base, items: [{ sku: "SKU-0", name: "Ski Wax", quantity: 1, price: 15.99 }], product_details: undefined } },
    { name: "lineItems_instead", mod: { ...base, lineItems: [{ sku: "SKU-0", name: "Ski Wax", quantity: 1, price: 15.99 }], product_details: undefined } },
  ];

  for (const t of tests) {
    const p = { ...t.mod };
    // remove undefined values mapping
    Object.keys(p).forEach(k => p[k] === undefined && delete p[k]);
    
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
  console.log("Fuzzer 4 complete.");
}

fuzzMap4();
