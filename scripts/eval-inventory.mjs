import fetch from "node-fetch";

async function check() {
  const apiKey = "ink_live_033953a33e43a690762318721582cd40284872ca9069d699";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/inventory";

  const res = await fetch(url, {
    method: "GET",
    headers: { "Authorization": `Bearer ${apiKey}` }
  });
  console.log(`Inventory -> ${res.status}: ${await res.text()}`);
}

check();
