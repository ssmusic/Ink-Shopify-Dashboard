# Shopify Signal Audit - 2026-07-08

This is the current discovery map for Ink Pages & Plays. Code still wins over
this document.

## Product Question

Before Ink can show high-ROI Plays, we need to know what buyer/order facts the
Shopify app can reliably read, what the embed actually sends to Ink, and what
the backend persists on the proof.

Rule: no known data, no Play.

## Current Installed Scopes

Source: `shopify.app.toml`

Current scopes include:

- `read_orders`, `write_orders`
- `read_customers`
- `read_fulfillments`, `write_fulfillments`
- `read_assigned_fulfillment_orders`, `write_assigned_fulfillment_orders`
- `read_files`, `write_files`
- `read_metaobjects`, `write_metaobjects`
- `read_online_store_pages`, `write_online_store_pages`
- `write_shipping`, `write_themes`

Current scopes do not explicitly include:

- `read_products`
- `read_discounts`
- `read_all_orders`

Do not touch scopes without founder approval. Scope changes can force merchant
re-consent.

## What Auto-Enroll Sends Today

Source: `app/routes/webhooks.orders_create.ts`

The `orders/create` path currently queries and sends:

- customer email, phone, first name, last name
- shipping address name, city, province/state, zip, country
- order total and currency
- line item title, quantity, SKU, price, image URL
- order proof metafield
- fulfillment tracking company and number

It does not currently send:

- Shopify product ID
- variant ID
- product type
- standard product category
- product tags
- collections
- product or variant metafields
- customer order count
- customer amount spent
- customer tags
- email/SMS marketing consent
- customer journey source/UTM
- discounts / discount applications

## Backend Capacity

Source: `ink-backend/ink-firebase/functions/routes/api/enroll.js`

The backend already accepts:

- `customer_profile`
- `acquisition`
- richer `order_details`

The backend persists:

- `customer_id`
- `customer_order_count`
- `customer_ltv`
- `customer_currency`
- `customer_tags`
- `customer_tier`
- `marketing_consent.email`
- `marketing_consent.sms`
- `acquisition_source`
- `order_details`

So the immediate bottleneck is the Shopify embed query/payload, not a brand-new
backend model.

## Resolver-Safe Signal Classes

Safe now:

- ordered product title/SKU/price/image
- order total
- shipping city/state/country when present
- returning status from Ink's own proof ledger
- customer tier as currently stamped by backend

Safe after embed enrichment:

- customer order count
- customer amount spent
- customer tags
- marketing consent
- product ID / variant ID
- product type/category/vendor
- product tags
- collections
- product metafields
- acquisition/source/UTM when Shopify returns it
- discounts applied to the order

Unsafe unless merchant-provided as explicit labels:

- gender
- nightlife/clubwear interest
- music taste
- event affinity
- income/lifestyle persona

Buildable version of the "NYC event" example:

- ships to NYC
- returning/VIP buyer
- bought product from merchant-labeled `night out` collection/tag/metafield
- marketing channel allowed when needed
- approved NYC event/partner offer exists
- offer window is active

Not buildable:

- "female in NYC who probably likes Daft Punk"

## Discovery Script

List candidate shops with stored sessions:

```bash
npm run signal:discover -- --list-shops
```

Run:

```bash
npm run signal:discover -- <shop.myshopify.com>
```

If local Firestore credentials are unavailable, run with a token:

```bash
SHOPIFY_ACCESS_TOKEN=<offline-token> npm run signal:discover -- <shop.myshopify.com>
```

The script reads the stored offline Shopify session from Firestore and probes:

- current app scopes
- current order payload
- customer profile fields
- catalog fields reachable from order line items
- discount and acquisition fields

Use the output to classify each field as:

- works under current scopes
- GraphQL field does not exist
- requires new scope/re-consent
- requires protected customer data approval
- useful but not resolver-safe

Do not use stale multi-month sandbox shops as the signal truth source. A shop
such as `taimoor1-2.myshopify.com` can prove GraphQL schema/access mechanics,
but it cannot answer the product question because its orders are old, synthetic,
and polluted by historical tests.

Preferred discovery source:

- fresh dev store or current pilot store
- current app install
- 5-10 deliberately created orders
- known customer history cases: guest, first-time, returning, VIP/tagged
- known products: clean product type, category, tags, collections, metafields
- known discounts
- known marketing consent states
- at least one order with shipping city/state we can use for location checks
