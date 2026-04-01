import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const p = {
    order_id: "7756436701470" + Date.now(),
    nfc_token: "nfc_7756436701470_" + Date.now(),
    order_number: "1046",
    customer_email: "Taimooralideveloper@gmail.com",
    shipping_address: {
      line1: "123 Main St",
      line2: "Apt 2",
      city: "Marlton",
      state: "New Jersey",
      zip: "08053", // string zip?
      country: "United States"
    },
    product_details: [
      { sku: "SKU-0", name: "Ski Wax", quantity: 1, price: "15.99" } // STRING PRICE!
    ]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(p)
  });
  console.log(`STRICT TYPES payload -> ${res.status}: ${await res.text()}`);
}

fuzz();
