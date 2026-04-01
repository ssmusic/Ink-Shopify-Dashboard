import fetch from "node-fetch";

async function fuzzMap3() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";
  
  const base = {
    order_id: "7756436701470",
    nfc_token: "nfc_7756436701470_" + Date.now(),
    order_number: "1046",
    customer_email: "Taimooralideveloper@gmail.com",
    shipping_address: {
      line1: "123 Main St",
      line2: "Apt 2",
      city: "Marlton",
      state: "New Jersey",
      zip: "08053",
      country: "United States"
    },
    product_details: [
      { sku: "SKU-0", name: "Ski Wax", quantity: 1, price: 15.99 }
    ]
  };

  const tests = [
    { name: "nfcUid", mod: { ...base, nfcUid: "53:12:62:6a:a2:00:01" } },
    { name: "nfc_UID", mod: { ...base, nfc_UID: "53:12:62:6a:a2:00:01" } },
    { name: "nfc_tag", mod: { ...base, nfc_tag: "53:12:62:6a:a2:00:01" } },
    { name: "uid", mod: { ...base, uid: "53:12:62:6a:a2:00:01" } },
    { name: "nfc_id", mod: { ...base, nfc_id: "53:12:62:6a:a2:00:01" } },
    { name: "NFC_uid", mod: { ...base, NFC_uid: "53:12:62:6a:a2:00:01" } },
    { name: "nfc_uuid", mod: { ...base, nfc_uuid: "53:12:62:6a:a2:00:01" } }
  ];

  for (const t of tests) {
    const p = { ...t.mod };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(p)
    });
    const text = await res.text();
    if (!text.includes("Missing required fields")) {
      console.log(`[FOUND IT] ${t.name} -> ${res.status}: ${text}`);
    }
  }
  console.log("Fuzzer 3 complete.");
}

fuzzMap3();
