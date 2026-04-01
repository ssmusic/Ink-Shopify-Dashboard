import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const p = {
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
    ],
    // ADDING PHOTOS TO THE PAYLOAD as per Alan's suggestion
    photo_urls: ["https://example.com/photo.jpg"],
    photo_hashes: ["hash123"],
    media_urls: ["https://example.com/photo.jpg"], // just in case
    photos: ["https://example.com/photo.jpg"] // just in case
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(p)
  });
  console.log(`With Photos Payload -> ${res.status}: ${await res.text()}`);
}

fuzz();
