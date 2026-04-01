import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const getP = (addrKeys, prodKeys, extraRoot) => {
    const p = {
      nfc_token: "test_" + Date.now() + Math.random(),
      order_id: "1",
      order_number: "1",
      customer_email: "a@a.com",
      shipping_address: {},
      product_details: [{}]
    };
    for (const [k, v] of Object.entries(addrKeys)) p.shipping_address[k] = v;
    for (const [k, v] of Object.entries(prodKeys)) p.product_details[0][k] = v;
    for (const [k, v] of Object.entries(extraRoot)) p[k] = v;
    return p;
  };

  const tests = [
    {
      name: "Minimal exactly as documented",
      p: getP(
        { line1: "1", line2: "2", city: "C", state: "S", zip: "Z", country: "US" },
        { sku: "S", name: "N", quantity: 1, price: 1 },
        {}
      )
    },
    {
      name: "postal_code instead of zip",
      p: getP(
        { line1: "1", line2: "2", city: "C", state: "S", postal_code: "Z", country: "US" },
        { sku: "S", name: "N", quantity: 1, price: 1 },
        {}
      )
    },
    {
      name: "province instead of state",
      p: getP(
        { line1: "1", line2: "2", city: "C", province: "S", zip: "Z", country: "US" },
        { sku: "S", name: "N", quantity: 1, price: 1 },
        {}
      )
    },
    {
      name: "product title instead of name",
      p: getP(
        { line1: "1", line2: "2", city: "C", state: "S", zip: "Z", country: "US" },
        { sku: "S", title: "N", quantity: 1, price: 1 },
        {}
      )
    },
    {
      name: "productId and variantId in product",
      p: getP(
        { line1: "1", line2: "2", city: "C", state: "S", zip: "Z", country: "US" },
        { id: "1", product_id: "1", variant_id: "1", sku: "S", name: "N", quantity: 1, price: 1 },
        {}
      )
    },
    {
      name: "Adding merchant_id and shop_domain",
      p: getP(
        { line1: "1", line2: "2", city: "C", state: "S", zip: "Z", country: "US" },
        { sku: "S", name: "N", quantity: 1, price: 1 },
        { merchant_id: "test", shop_domain: "test" }
      )
    },
    {
      name: "Using all possible address fields together",
      p: getP(
        { line1: "1", address1: "1", line2: "2", address2: "2", city: "C", state: "S", province: "S", zip: "Z", postal_code: "Z", country: "US" },
        { sku: "S", name: "N", title: "N", quantity: 1, price: 1 },
        {}
      )
    }
  ];

  for (const t of tests) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(t.p)
    });
    console.log(`${t.name} -> ${res.status}: ${await res.text()}`);
  }
}

fuzz();
