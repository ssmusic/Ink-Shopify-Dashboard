import fetch from 'node-fetch';

const apiKey = "ink_live_7aa..."; // I will use the one from Firestore
const apiUrl = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

async function test() {
  const payload = {
    "order_id": "gid://shopify/Order/7756398067998",
    "nfc_token": "nfc_7756",
    "order_number": "1045",
    "customer_email": "Taimooralideveloper@gmail.com",
    "shipping_address": {
      "line1": "United States Cir",
      "line2": "",
      "city": "Marlton",
      "state": "New Jersey",
      "zip": "08053",
      "country": "United States",
      "phone": ""
    },
    "product_details": [
      {
        "sku": "SKU-0",
        "name": "Selling Plans Ski Wax",
        "quantity": 1,
        "price": 0
      }
    ],
    "warehouse_location": {
      "lat": 21.9909719,
      "lng": 71.1770119
    },
    "nfc_uid": "53:1d:62:6a:a2:00:01"
  };

  // We need to fetch the real API key to test
}

test();
