import fetch from "node-fetch";

async function run() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const payload = {
    order_id: "7756436701470",
    nfc_token: "nfc_7756436701470_1775018068811",
    order_number: "1046",
    customer_email: "Taimooralideveloper@gmail.com",
    // customer_phone: "", // Might be strict validation against empty string
    shipping_address: {
      line1: "United States Cir",
      line2: "",
      city: "Marlton",
      state: "New Jersey",
      zip: "08053",
      country: "United States"
    },
    product_details: [
      {
        sku: "SKU-0",
        name: "Selling Plans Ski Wax",
        quantity: 1,
        price: 0
      }
    ],
    nfc_uid: "53:12:62:6a:a2:00:01",
    warehouse_location: {
      lat: 21.9909959,
      lng: 71.1771389
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    console.log(`Payload with nfc_uid & warehouse_location -> ${res.status}:`, await res.text());
  } catch (err) {
    console.error(err);
  }
}

run();
