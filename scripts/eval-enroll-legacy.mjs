import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const p = {
    order_id: "7756436701470",
    nfc_uid: "53:12:62:6a:a2:00:01",
    nfc_token: "nfc_7756436701470_1775018068811",
    photo_urls: ["https://example.com/photo.jpg"],
    photo_hashes: ["hash"],
    shipping_address_gps: { lat: 10, lng: 10 },
    warehouse_gps: { lat: 21.99, lng: 71.17 },
    merchant: "taimoor1-2.myshopify.com"
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(p)
  });
  console.log(`v1.0 Payload -> ${res.status}: ${await res.text()}`);
}

fuzz();
