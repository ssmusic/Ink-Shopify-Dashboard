import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const p = {
    // Basic v1.5 Fields
    order_id: "7756436701470",
    nfc_token: "nfc_7756436701470_1775018068811",
    order_number: "1046",
    customer_email: "Taimooralideveloper@gmail.com",
    customer_phone: "+15555555555",
    shipping_address: {
      line1: "123 Main St",
      line2: "Apt 2",
      city: "Marlton",
      state: "New Jersey",
      zip: "08053",
      country: "United States"
    },
    product_details: [
      { sku: "SKU-0", name: "Ski Wax", quantity: 1, price: 10 }
    ],

    // What Alan explicitly called out as missing
    nfc_uid: "53:12:62:6a:a2:00:01" 
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(p)
  });
  console.log(`With nfc_uid payload -> ${res.status}: ${await res.text()}`);
}

fuzz();
