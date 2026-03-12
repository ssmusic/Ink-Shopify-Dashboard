import dotenv from "dotenv";
dotenv.config();

const INK_API_URL = process.env.INK_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api";
const INK_ADMIN_SECRET = process.env.INK_ADMIN_SECRET || "ink_admin_aeb5c9d6e822a4e57d95a6a2224aada64230e48d89acad5782057fcb865548a2";

// Make configurable via ENV as requested
const INITIAL_TAGS = parseInt(process.env.INITIAL_STICKER_INVENTORY || "100", 10);

async function main() {
  console.log(`Starting inventory initialization script... Assigning ${INITIAL_TAGS} tags to existing merchants.`);

  try {
    // 1. Fetch all merchants
    const listRes = await fetch(`${INK_API_URL}/admin/merchants`, {
        headers: { "X-Admin-Secret": INK_ADMIN_SECRET }
    });

    if (!listRes.ok) {
        throw new Error(`Failed to fetch merchants: ${await listRes.text()}`);
    }

    const { merchants } = await listRes.json();
    console.log(`Found ${merchants.length} merchants.`);

    // 2. Add inventory to each merchant
    for (const merchant of merchants) {
        console.log(`Processing shop: ${merchant.shop_domain} (${merchant.shop_id})`);
        
        const invRes = await fetch(`${INK_API_URL}/admin/merchants/${merchant.shop_id}/inventory`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Admin-Secret": INK_ADMIN_SECRET
            },
            body: JSON.stringify({
                delta: INITIAL_TAGS,
                quantity: INITIAL_TAGS, // Adding quantity because the API error explicitly demands it despite docs
                reason: "Initial Tag Allocation for Existing Merch"
            })
        });

        if (!invRes.ok) {
             console.error(`  ❌ Failed to allocate inventory to ${merchant.shop_domain}:`, await invRes.text());
        } else {
             const result = await invRes.json();
             console.log(`  ✅ Successfully allocated ${INITIAL_TAGS} tags. New balance: ${result.new_balance}`);
        }
    }
    
    console.log("Complete!");
  } catch (error) {
    console.error("Script failed:", error);
  }
}

main();
