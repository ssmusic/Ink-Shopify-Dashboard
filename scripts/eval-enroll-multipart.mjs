async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const formData = new FormData();
  formData.append("order_id", "7756436701470");
  formData.append("nfc_token", "nfc_7756436701470_1775018068811");
  formData.append("order_number", "1046");
  formData.append("customer_email", "Taimooralideveloper@gmail.com");
  formData.append("customer_phone", "");
  
  formData.append("shipping_address", JSON.stringify({
    line1: "123 Main St",
    line2: "",
    city: "Marlton",
    state: "New Jersey",
    zip: "08053",
    country: "United States"
  }));
  
  formData.append("product_details", JSON.stringify([
    { sku: "SKU-0", name: "Ski Wax", quantity: 1, price: 10 }
  ]));

  const fakeFile = new Blob(["fake photo content"], { type: "image/jpeg" });
  formData.append("photos", fakeFile, "photo.jpg");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body: formData
  });
  console.log(`Multipart Payload -> ${res.status}: ${await res.text()}`);
}

fuzz();
