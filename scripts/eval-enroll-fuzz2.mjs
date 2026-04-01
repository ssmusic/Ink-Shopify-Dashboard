import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const payloads = [
    {
      name: "CamelCase keys",
      data: {
        orderId: "7756436701470",
        nfcToken: "nfc_7756436701470_1775018068811",
        orderNumber: "1046",
        customerEmail: "Taimooralideveloper@gmail.com",
        customerPhone: "+15555555555",
        shippingAddress: {
          line1: "United States Cir",
          line2: "Apt 4",
          city: "Marlton",
          state: "New Jersey",
          zip: "08053",
          country: "United States"
        },
        productDetails: [
          { sku: "SKU-0", name: "Ski Wax", quantity: 1, price: 10 }
        ]
      }
    },
    {
      name: "Shopify address format",
      data: {
        order_id: "7756436701470",
        nfc_token: "nfc_7756436701470_1775018068811",
        order_number: "1046",
        customer_email: "T@gmail.com",
        shipping_address: {
          address1: "United States Cir",
          address2: "Apt 4",
          city: "Marlton",
          province: "New Jersey",
          zip: "08053",
          country: "United States"
        },
        product_details: [
          { sku: "SKU-0", title: "Ski Wax", quantity: 1, price: 10 }
        ]
      }
    },
    {
      name: "Order number as integer",
      data: {
        order_id: "7756436701470",
        nfc_token: "nfc_7756436701470_1775018068811",
        order_number: 1046, // Int
        customer_email: "test@example.com",
        shipping_address: { line1: "123", city: "C", state: "S", zip: "1", country: "US" },
        product_details: [{ sku: "1", name: "N", quantity: 1, price: 10 }]
      }
    },
    {
      name: "Price as string",
      data: {
        order_id: "7756436701470",
        nfc_token: "nfc_7756436701470_1775018068811",
        order_number: "1046",
        customer_email: "test@example.com",
        shipping_address: { line1: "123", city: "C", state: "S", zip: "1", country: "US" },
        product_details: [{ sku: "1", name: "N", quantity: 1, price: "10.00" }]
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
