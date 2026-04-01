import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const p = {
    orderId: "7756436701470" + Date.now(),
    nfcToken: "nfc_7756436701470_" + Date.now(),
    orderNumber: "1046",
    customerEmail: "Taimooralideveloper@gmail.com",
    shippingAddress: {
      line1: "123 Main St",
      line2: "Apt 2",
      city: "Marlton",
      state: "New Jersey",
      zip: "08053",
      country: "United States"
    },
    productDetails: [
      { sku: "SKU-0", name: "Ski Wax", quantity: 1, price: 15.99 }
    ]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(p)
  });
  console.log(`CAMEL CASE payload -> ${res.status}: ${await res.text()}`);
}

fuzz();
