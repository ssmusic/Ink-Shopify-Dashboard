import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const payloads = [
    {
      name: "Superset with EVERYTHING",
      data: {
        order_id: "7756436701470",
        nfc_token: "nfc_7756436701470_1775018068811",
        order_number: "1046",
        customer_email: "Taimooralideveloper@gmail.com",
        customer_phone: "+15555555555",
        shipping_address: {
          line1: "United States Cir",
          line2: "Apt 4",
          city: "Marlton",
          state: "New Jersey",
          zip: "08053",
          country: "United States",
          phone: "+15555555555"
        },
        product_details: [
          { sku: "SKU-0", name: "Ski Wax", quantity: 1, price: 0 }
        ],
        nfc_uid: "53:12:62:6a:a2:00:01",
        warehouse_location: { lat: 21.99, lng: 71.17 },
        shop_domain: "taimoor1-2.myshopify.com",
        merchant_id: "taimoor1-2.myshopify.com",
        shop_id: "taimoor1-2.myshopify.com"
      }
    },
    {
      name: "Stringified price and ids",
      data: {
        order_id: "gid://shopify/Order/7756436701470",
        nfc_token: "nfc_7756436701470_1775018068811",
        order_number: "1046",
        customer_email: "test@example.com",
        shipping_address: { line1: "123", line2: "", city: "C", state: "S", zip: "1", country: "US" },
        product_details: [{ sku: "1", name: "N", quantity: 1, price: "0" }]
      }
    },
    {
      name: "Using shipping_address_gps",
      data: {
        order_id: "7756436701470",
        nfc_token: "nfc_7756436701470_1775018068811",
        order_number: "1046",
        customer_email: "test@example.com",
        shipping_address: { line1: "123", city: "C", state: "S", zip: "1", country: "US" },
        product_details: [{ sku: "1", name: "N", quantity: 1, price: 0 }],
        shipping_address_gps: { lat: 1, lng: 1 }
      }
    }
  ];

  for (const p of payloads) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(p.data)
    });
    console.log(`${p.name} -> ${res.status}: ${await res.text()}`);
  }
}

fuzz();
