#!/usr/bin/env node
import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const shop = process.argv[2];

if (!shop) {
  console.error("Usage: node scripts/shopify-signal-discovery.mjs <shop.myshopify.com>");
  console.error("       node scripts/shopify-signal-discovery.mjs --list-shops");
  process.exit(1);
}

if (getApps().length === 0) {
  if (process.env.FIREBASE_PRIVATE_KEY) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
}

const db = getFirestore();

async function listStoredShops() {
  const snap = await db.collection("shopify_sessions").limit(200).get();
  const rows = new Map();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!data.shop) continue;
    const existing = rows.get(data.shop) || {
      shop: data.shop,
      offline: false,
      scopes: new Set(),
      docs: 0,
    };
    existing.docs += 1;
    if (data.isOnline === false) existing.offline = true;
    if (data.scope) {
      String(data.scope)
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean)
        .forEach((scope) => existing.scopes.add(scope));
    }
    rows.set(data.shop, existing);
  }

  console.log("Stored Shopify sessions:");
  for (const row of [...rows.values()].sort((a, b) => a.shop.localeCompare(b.shop))) {
    console.log(
      `${row.shop} | offline=${row.offline ? "yes" : "no"} | session_docs=${row.docs} | scopes=${[...row.scopes].join(",") || "(missing)"}`,
    );
  }
}

async function offlineSessionForShop(shopDomain) {
  const exact = await db
    .collection("shopify_sessions")
    .where("shop", "==", shopDomain)
    .where("isOnline", "==", false)
    .limit(1)
    .get();
  if (!exact.empty) return exact.docs[0].data();

  const fallback = await db
    .collection("shopify_sessions")
    .where("shop", "==", shopDomain)
    .limit(1)
    .get();
  if (!fallback.empty) return fallback.docs[0].data();

  throw new Error(`No Shopify session found for ${shopDomain}`);
}

async function graphql(accessToken, query, variables = {}) {
  const response = await fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: response.status, ok: response.ok && !body.errors, body };
}

const probes = [
  {
    name: "current scopes",
    query: `#graphql
      query CurrentScopes {
        currentAppInstallation {
          accessScopes { handle }
        }
      }
    `,
  },
  {
    name: "current order payload",
    query: `#graphql
      query CurrentOrderPayload {
        orders(first: 1, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              customer { id email phone firstName lastName }
              shippingAddress { name address1 address2 city province zip country phone }
              totalPriceSet { shopMoney { amount currencyCode } }
              lineItems(first: 5) {
                edges {
                  node {
                    title
                    quantity
                    sku
                    originalUnitPriceSet { shopMoney { amount currencyCode } }
                    image { url }
                  }
                }
              }
            }
          }
        }
      }
    `,
  },
  {
    name: "customer profile signals",
    query: `#graphql
      query CustomerProfileSignals {
        orders(first: 1, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              customer {
                id
                numberOfOrders
                amountSpent { amount currencyCode }
                tags
                emailMarketingConsent { marketingState }
                smsMarketingConsent { marketingState }
                defaultAddress { city province country }
              }
            }
          }
        }
      }
    `,
  },
  {
    name: "product catalog signals from order line items",
    query: `#graphql
      query ProductCatalogSignals {
        orders(first: 1, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              lineItems(first: 5) {
                edges {
                  node {
                    title
                    sku
                    variant {
                      id
                      title
                      sku
                      selectedOptions { name value }
                      product {
                        id
                        title
                        handle
                        productType
                        vendor
                        tags
                        onlineStoreUrl
                        category { id name fullName }
                        collections(first: 10) {
                          edges { node { id title handle } }
                        }
                        metafields(first: 10) {
                          edges { node { namespace key value type } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
  },
  {
    name: "discount and acquisition signals",
    query: `#graphql
      query DiscountAndAcquisitionSignals {
        orders(first: 1, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              sourceName
              customerJourneySummary {
                firstVisit { source sourceType utmParameters { source medium campaign content term } }
                lastVisit { source sourceType utmParameters { source medium campaign content term } }
              }
              discountApplications(first: 10) {
                edges {
                  node {
                    allocationMethod
                    targetSelection
                    targetType
                    value {
                      ... on MoneyV2 { amount currencyCode }
                      ... on PricingPercentageValue { percentage }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
  },
];

if (shop === "--list-shops") {
  try {
    await listStoredShops();
  } catch (error) {
    console.error("Could not list stored Shopify sessions.");
    console.error("Provide Firebase credentials/ADC.");
    console.error(error?.message || error);
    process.exit(1);
  }
  process.exit(0);
}

let session = { accessToken: process.env.SHOPIFY_ACCESS_TOKEN, scope: "SHOPIFY_ACCESS_TOKEN env override" };
if (!session.accessToken) {
  try {
    session = await offlineSessionForShop(shop);
  } catch (error) {
    console.error(`Could not load the stored Shopify session for ${shop}.`);
    console.error("Provide Firebase credentials/ADC, or run with SHOPIFY_ACCESS_TOKEN=<token>.");
    console.error(error?.message || error);
    process.exit(1);
  }
}
if (!session.accessToken) throw new Error(`Session for ${shop} has no accessToken`);

console.log(`Shopify signal discovery for ${shop}`);
console.log(`Stored session scope: ${session.scope || "(missing)"}`);

for (const probe of probes) {
  const result = await graphql(session.accessToken, probe.query);
  console.log(`\n## ${probe.name}`);
  console.log(`status=${result.status} ok=${result.ok}`);
  if (result.body.errors) {
    console.log(JSON.stringify(result.body.errors, null, 2));
  } else {
    console.log(JSON.stringify(result.body.data, null, 2));
  }
}
