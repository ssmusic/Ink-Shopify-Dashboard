import { config } from "dotenv";
config();
import { getInventoryByShopDomain } from "./app/services/ink-api.server";
async function run() {
    console.log("Testing:", await getInventoryByShopDomain("taimoor1-2.myshopify.com"));
}
run();
