import fetch from "node-fetch";

async function fuzz() {
  const apiKey = "ink_live_INVALID_KEY_123";
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/enroll";

  const t = {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      order_id: "7756436701470"
    })
  };

  const res = await fetch(url, t);
  console.log(`Bad Key -> ${res.status}: ${await res.text()}`);
}

fuzz();
