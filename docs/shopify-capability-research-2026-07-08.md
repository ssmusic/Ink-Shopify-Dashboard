# Shopify Capability Research - 2026-07-08

This is about what Shopify can provide in principle. It is not based on Ink's
current test data.

Primary sources:

- Shopify Admin GraphQL `Order`
- Shopify Admin GraphQL `LineItem`
- Shopify Admin GraphQL `Customer`
- Shopify Admin GraphQL `Product`
- Shopify Admin GraphQL `CustomerJourneySummary`
- Shopify Admin GraphQL `CustomerVisit`
- Shopify Admin GraphQL `UTMParameters`
- Shopify Admin GraphQL discounts
- Shopify API access scopes
- Shopify protected customer data

## Ground Rule

Ink can only build merchant-facing Plays from facts Shopify or the merchant can
prove.

Do not design around inferred identity. Design around purchase, catalog,
consent, location, attribution, and merchant labels.

## Signals Shopify Can Provide

| Signal | Shopify Source | Scope / Approval | Resolver Use |
|---|---|---|---|
| Order id/name/date/status | `Order` | `read_orders`; last 60 days by default | Safe |
| Order line items | `Order.lineItems` / `LineItem` | `read_orders` | Safe |
| Product variant on purchased line | `LineItem.variant` | `read_orders` for line item; product details may need `read_products` | Safe after tested |
| Purchased product object | `LineItem.product` / `Product` | likely `read_products` for full catalog fields | Safe |
| Product title, SKU, quantity, price, image | `LineItem` | `read_orders` | Safe |
| Product type/vendor/tags/category | `Product` | `read_products` | Very useful |
| Product collections | `Product.collections` | `read_products` | Very useful |
| Product metafields | `Product.metafields` | `read_products`; metafield access depends on owner/type | Very useful if merchant-labeled |
| Customer id/name/email/phone | `Order.customer` / `Customer` | `read_customers` plus protected customer data approval for name/email/phone | Use only if required |
| Shipping city/state/country | `Order.shippingAddress` | protected customer data approval for address fields | Useful for geo/local Plays |
| Address line/zip/geolocation | `Order.shippingAddress` | protected customer data approval; address line/zip/geolocation are protected fields | Sensitive; minimize |
| Customer order count | `Customer.numberOfOrders` or `CustomerJourneySummary.customerOrderIndex` | `read_customers` or `read_orders` depending source | Strong returning/VIP signal |
| Customer amount spent | `Customer.amountSpent` | `read_customers` | Strong VIP/LTV signal |
| Customer tags | `Customer.tags` | `read_customers` | Strong merchant-labeled signal |
| Marketing consent | `Customer.emailMarketingConsent`, `Customer.smsMarketingConsent` | `read_customers`; protected customer data rules may apply | Required for marketing sends |
| Attribution source | `Order.customerJourneySummary` / `CustomerVisit` | `read_orders` | Useful source/channel signal |
| UTM campaign/source/medium/content/term | `CustomerVisit.utmParameters` | `read_orders` | Useful if present |
| Discounts applied on order | `Order.discountApplications`, `LineItem.discountAllocations` | `read_orders` | Useful for discount sensitivity |
| Discount code creation | `discountCodeBasicCreate` | `write_discounts` | Possible offer action |
| Discount code lookup/usage | `DiscountCodeBasic` | `read_discounts` | Possible measurement/offer inventory |
| All historical orders | `Order` beyond default window | `read_all_orders` plus permission request | Useful but heavier approval |

## What This Means For Ink

### Safe High-Value Signals

These are the likely spine for Pages & Plays:

- bought product / variant
- product category, type, vendor, tags, collections
- merchant-authored product/customer/order metafields
- customer order index / order count
- customer amount spent
- customer tags
- shipping city/state/country
- marketing source / UTM
- applied discount history
- marketing consent

### Not A Signal Unless Merchant-Labeled

These should not exist as raw Ink claims:

- gender
- music taste
- clubbing interest
- style persona
- income class
- nightlife intent

They become usable only as merchant/catalog labels:

- product collection: `Night Out`
- product tag/metafield: `clubwear`
- customer tag: `VIP`
- UTM campaign: `bowery_drop`
- approved event offer: `Daft Punk / Bowery Ballroom`

## The NYC Event Example, Made Real

Buildable:

```text
Returning customer
Shipping city = New York
Purchased product belongs to collection/tag/metafield = Night Out
Customer can receive marketing
Approved NYC event offer exists
Offer window is active
```

Not buildable:

```text
Female in NYC probably likes Daft Punk
```

## Scope Reality

Minimum discovery stack:

- `read_orders`
- `read_customers`
- `read_products`

Offer/discount stack:

- `read_discounts`
- `write_discounts`

Historical depth:

- `read_all_orders` only if needed; Shopify says orders are limited to the last
  60 days by default and `read_all_orders` needs an access request.

Protected customer data:

- name, email, phone, and address fields require protected customer data access.
- address line, ZIP, and geolocation are explicitly protected customer fields.
- Shopify says unapproved protected fields can be redacted or returned with
  GraphQL errors.

## Research Questions Still Open

These require live GraphQL probing against a clean dev store, not stale test
orders:

1. Can full `LineItem.product` fields be read through `read_orders`, or does
   Shopify require `read_products` for product tags/category/collections?
2. Does `CustomerJourneySummary` reliably populate by the time the order webhook
   fires, or do we need a delayed enrichment job?
3. Which protected fields are already approved for the public app, and which
   are dev-store-only?
4. Can we use customer/order metafields without adding more scopes, or do we
   need explicit metafield owner coverage?
5. Which discount objects are enough for ROI measurement without creating codes
   ourselves?

## Clean Dev Store Probe

The right probe is not old test data. It is a clean store with deliberate cases:

- first-time customer
- returning customer
- VIP/tagged customer
- NYC shipping address
- product with category/type/vendor/tags
- product in collection `Night Out`
- product metafield `occasion=night_out`
- customer with marketing consent subscribed
- customer with marketing consent not subscribed
- order with discount code
- order with UTM source/campaign

Then run a GraphQL capability probe and classify fields:

- available now
- requires `read_products`
- requires `read_discounts` / `write_discounts`
- requires `read_all_orders`
- requires protected customer data approval
- not reliable enough for resolver use

## Now / Next Decision Path

### 1. Define the minimum Ink signal contract

The first product contract should be small:

```text
Order purchased product
Product labels from Shopify catalog
Customer status from Shopify/Ink order history
Shipping region when approved
Marketing consent when marketing content is shown
Approved offer/action
```

Everything else is optional enrichment.

### 2. Choose the minimum scope ask

For Pages & Plays, the likely minimum new ask is:

- `read_products`

Why:

- product category, product type, tags, collections, vendor, and metafields are
  the cleanest way to turn "bought shoes" into "bought Night Out / Clubwear /
  Bridal / Workwear / Running" without inference.

Do not ask for discount scopes yet unless the first Plays need Ink-generated
discount codes.

Delay `read_all_orders` unless we prove last-60-day order history is too thin.

### 3. Treat protected customer data as a separate approval lane

Location-based Plays need address access. Shopify protects name, email, phone,
address line, ZIP, and geolocation. Start with the least sensitive useful
location:

- city
- province/state
- country

Avoid address line, ZIP, and geolocation unless a specific Play requires them.

### 4. Build v1 around merchant labels, not identity guesses

The highest-value v1 label sources are:

- product collections
- product tags
- product category
- product metafields
- customer tags
- UTM campaign/source

This is how Ink gets "Night Out" without guessing a person.

### 5. Productize the first proof sentence

The first merchant-facing sentence should be:

```text
Customers who bought [merchant-labeled product group] and match [known customer/location fact]
will see [eligible page] with [approved offer], because [Shopify evidence].
```

Example:

```text
Returning customers in New York who bought from Night Out
will see the NYC Night Out page with the Bowery RSVP,
because Shopify shows the order ships to New York and the product belongs to
the Night Out collection.
```

### 6. Engineering order

1. Add `read_products` to a development app only.
2. Build the clean dev-store probe cases.
3. Run the signal discovery query.
4. Confirm exactly which catalog fields return.
5. Enrich the `orders/create` payload with product and customer evidence.
6. Persist those facts on the proof.
7. Update resolver proof copy to use only those facts.

No merchant UX work should outrun step 4.
