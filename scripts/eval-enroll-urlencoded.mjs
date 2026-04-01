import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const params = new URLSearchParams();
  params.append("order_id", "7756436701470");
  params.append("nfc_token", "nfc_7756436701470_1775018068811");
  params.append("order_number", "1046");
  params.append("customer_email", "Taimooralideveloper@gmail.com");
  params.append("customer_phone", "");
  params.append("shipping_address", JSON.stringify({ line1: "123", city: "C", state: "S", zip: "1", country: "US" }));
  params.append("product_details", JSON.stringify([{ sku: "1", name: "N", quantity: 1, price: 0 }]));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Bearer ${apiKey}` },
    body: params
  });
  console.log(`UrlEncoded Payload -> ${res.status}: ${await res.text()}`);
}

fuzz();
