import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const p = {
    order_id: "99999999" + Math.floor(Math.random() * 1000), // Fresh ID
    nfc_token: "test_177" + Math.floor(Math.random() * 1000),
    order_number: "9999",
    customer_email: "a@a.com",
    nfc_uid: "5312626aa20001", // no colons
    shipping_address: {
      line1: "1",
      line2: "2",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US"
    },
    product_details: [
      { sku: "1", name: "N", quantity: 1, price: 0 }
    ]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(p)
  });
  console.log(`With nfc_uid payload -> ${res.status}: ${await res.text()}`);
}

fuzz();
