import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const payloadContent = {
    order_id: "7756436701470",
    nfc_token: "nfc_7756436701470_1775018068811",
    order_number: "1046",
    customer_email: "Taimooralideveloper@gmail.com",
    customer_phone: "",
    shipping_address: {
      line1: "123",
      line2: "",
      city: "C",
      state: "S",
      zip: "1",
      country: "US"
    },
    product_details: [
      { sku: "1", name: "N", quantity: 1, price: 0 }
    ]
  };

  const p1 = payloadContent;
  const p2 = { data: payloadContent };

  for (const p of [p1, p2]) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(p)
    });
    console.log(`Wrapped ${!!p.data} -> ${res.status}: ${await res.text()}`);
  }
}

fuzz();
