import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const payloads = [
    {
      name: "Only order_id and nfc_token",
      data: {
        order_id: "7756436701470",
        nfc_token: "nfc_7756436701470_1775018068811"
      }
    },
    {
      name: "v1.1 exactly",
      data: {
        order_id: "7756436701470",
        nfc_token: "nfc_7756436701470_1775018068811",
        shipping_address: "123 Main St, Marlton, NJ 08053", // v1.1 string
        order_details: {
          line_items: [{ title: "Wax", quantity: 1, price: "10.00" }],
          total_price: "10.00"
        }
      }
    }
  ];

  for (const p of payloads) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(p.data)
    });
    console.log(`${p.name} -> ${res.status}: ${await res.text()}`);
  }
}

fuzz();
