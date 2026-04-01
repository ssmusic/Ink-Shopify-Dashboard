import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const p = {
    order_id: "7756436701470",
    order_number: "1046",
    nfc_token: "nfc_7756436701470_1775018068811",
    nfc_uid: "53:12:62:6a:a2:00:01",
    customer_email: "Taimooralideveloper@gmail.com",
    customer_phone: "+15555555555",
    
    // v1.1
    photo_urls: ["https://example.com/photo.jpg"],
    photo_hashes: ["hash123"],
    shipping_address_gps: { lat: 10, lng: 10 },
    warehouse_gps: { lat: 21.99, lng: 71.17 },
    merchant: "taimoor1-2.myshopify.com",
    
    // v1.5
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
    
    // Extra edge cases
    media_items: [{ media_url: "https://example.com/photo.jpg", media_type: "image", media_id: "media_123" }],
    media_urls: ["https://example.com/photo.jpg"],
    photos: ["https://example.com/photo.jpg"],
    
    shop_domain: "taimoor1-2.myshopify.com",
    shop_id: "shop_123456"
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify(p)
  });
  console.log(`Kitchen Sink Payload -> ${res.status}: ${await res.text()}`);
}

fuzz();
