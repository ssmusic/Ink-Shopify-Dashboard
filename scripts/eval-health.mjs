import fetch from "node-fetch";
async function check() {
  const url = "https://us-central1-inink-c76d3.cloudfunctions.net/api/health";
  const res = await fetch(url);
  console.log(`Health -> ${res.status}: ${await res.text()}`);
}
check();
