# The Ritualist: resubmission, 2026-09-25

The Ritualist's review (ref 104187) paused on 5.6.1, the order-status block. The block is gone (`the-ritualist-17`, released 2026-09-24 16:49Z). The app has changed a great deal since, so this is a fresh submission on the same app record (client `8da1…`, app.in.ink, Cloud Run `shopify-app`). **Every line marked PLACEHOLDER is Sam's to replace.** Nothing here was typed into the Partner Dashboard.

## 1. What the audit found and what was done (2026-09-25)
The audit rendered every Ritualist screen with real data, read-only, at 1280 and 375 wide: Dashboard, Orders, an opened order, Advanced, the three Settings tabs, Billing and Help. The stores were Steve Madden (`sm-test-hhawzn52`), corvara and the review store `app-review-da3c85fa-r84136-a0-primary`. The review store's Shopify reads were stood in as empty, because its token has expired. The screenshots stay on the laptop because they show real buyers.

| # | Finding | Now |
|---|---|---|
| 1 | **The plan dead end, on corvara.** An order's record said "included with a Ritualist plan" and linked to Billing. Billing said "No plan is active" with nothing to press. | **#201 merged.** With no plan, Billing offers "Choose a plan" (Shopify's plan page) once `SHOPIFY_APP_HANDLE` is set. Until then it says plans can't be chosen in the app yet and offers Email support@in.ink (PLACEHOLDER). |
| 2 | **Help overclaimed:** texts, notification settings, returns with a QR code, "founding merchant, not billed", photos, "that it arrived". | **#202 merged:** cuts only, sentence case. |
| 3 | **The tracking-link setting** said the link reaches the shipping-confirmation email. It doesn't: Shopify sends the email 0–1 s after fulfilment and the rewrite lands about 3 s later. | **#203 merged:** it names the admin order page and the order-status page, and points to the one pasted line (PLACEHOLDER). |
| 4 | **The Notifications tab** offered no notifications, and a return window that does nothing where returns are off. | **#204 merged:** one line says the app sends no emails or texts of its own yet. The return window appears only where returns are on (PLACEHOLDER). |
| 5 | **The Dashboard** showed two numbers each for "Open" and "Location shared". A record printed "1993799 m". | **#205 merged:** the funnel steps are named by their condition, the shared count is one count, and the distance reads 1,994 km. Both apps. |
| 6 | **Shopify's self-review, 1.1.1:** two Settings screens fell back to a token saved in the browser. | **#206 merged:** session token only. |
| 7 | `write_themes` is unused. `write_shipping` only registers a carrier service that returns no rates. | **Sam decides.** Removing either is a scope change that makes every merchant consent again. They are left as they are for this submission. |
| 8 | The privacy URL for The Ritualist, **www.in.ink/privacy.html**, is dated July 5, 2026. It never names The Ritualist, says texts go through Twilio, gives no 24-month retention, and does not mention the browser identifier or maps. | **Fixed, #1422 live:** https://www.in.ink/ritualist-privacy.html; /privacy.html is now an index to both apps' policies. |

## 2. Shopify's self-review (the `shopify-app-store-review` skill, requirements fetched live, 2026-09-25)
- **Result:** 30 likely passing, 0 failing, and 1 needing review, 1.2.x billing, below.
- **Skipped:** groups 5.1, 5.2, 5.4, 5.6, 5.7 and 5.8 need an extension, and The Ritualist ships none (no `extensions/`, no `extension_directories`). Groups 5.3, 5.5, 5.9 and 5.10 are opt-in.
- **1.1.1 session tokens:** fixed by #206.
- **2.2.3 App Bridge:** `@shopify/app-bridge-react` 4.x only.
- **2.2.4 GraphQL:** no REST Admin call.
- **2.3.x install:** measured live, below.
- **1.1.10 shipping:** the carrier service returns no rates, so it reorders nothing.
- **⚠️ 1.2.1–1.2.3 billing, needs review.** The Ritualist creates no charge of its own: no `appSubscriptionCreate`, no Managed Pricing link until `SHOPIFY_APP_HANDLE` is set. ink's `appPurchaseOneTimeCreate` is reachable on this flavor only if `RECORD_PURCHASES_ENABLED` is on, and on `shopify-app` it is **false** (measured 2026-09-25). So the listing must match one of two shapes:
  - **(a) Free.** The listing says Free, and nothing charges.
  - **(b) Paid plans.** The plans are set up in Partner Dashboard, then Pricing, then Managed Pricing. Then set `SHOPIFY_APP_HANDLE`, so Billing opens Shopify's plan page and merchants can change plans there (1.2.3). The locked prices are $299, $599 and $999 at 1,000, 2,500 and 4,000 orders.

## 3. The reviewer's walk, measured live from outside (2026-09-25, `shopify-app-00419`)
| Probe | Answer |
|---|---|
| `app.in.ink/` | 200, the landing. Both buttons go to https://www.in.ink/login. |
| `/auth/login`, no shop, and `?shop=not*a*shop` | 302 → `/`. No shop-domain form. |
| `/auth/login?shop=<review store>` | 302 → `admin.shopify.com/store/…/oauth/install?client_id=8da1…` |
| `/app` as a browser tab with no store | 302 → `/`. Never a "200" page. |
| `POST /app.data` with the page's Origin | **405** |
| customers/data_request · customers/redact · shop/redact with a bad HMAC | **401** each |
| `RECORD_PURCHASES_ENABLED` on shopify-app | **false**. Leave it false. |
| `SEND_ALLOWLIST` | one address, so no real buyer receives the app's emails (Help no longer claims any) |
| Screens | no dead control after #201. No "verified", "confirmed" or "dispute packet". No verdict on a distance. |

## 4. The 5.6.1 reply (Submit fixes note) — PLACEHOLDER
> 5.6.1: The customer account / order-status extension has been removed. The Ritualist no longer ships any checkout or customer account extension (released in version the-ritualist-17), and places nothing on the order status page. What a reviewer sees instead: the order's tracking link opens the merchant's order page; in the app, Orders lists each order with its activity and its signed record (Advanced), with the record's PDF and JSON.

## 5. Listing drafts (describe today's app) — every line PLACEHOLDER
- **Name:** The Ritualist
- **Subtitle:** A page for every order, and a signed record of its delivery.
- **Description:** The Ritualist gives every order its own page in your brand. The tracking link opens it, so the customer sees their order and where it is. Each order keeps a signed record: the carrier's scans, when the page was opened, and where, if the customer chose to share their location. In the app you see every order's activity and can download its record as a PDF or JSON.
- **Features:**
  - A branded page for every order, from the tracking link.
  - Every order's activity in one list: recorded, shipped, delivered, opened.
  - A signed delivery record per order, with a PDF and JSON download.
  - Your numbers: orders, opens, shared locations and time to delivery.
- **Search terms:** order tracking, tracking page, delivery record, order status, chargeback evidence
- **Screenshot captions:**
  - Your orders, with each one's activity.
  - An order, opened: what was bought, who it went to, and what happened.
  - The signed record, ready to download.
  - Your Dashboard.
- **Never in the listing:** SMS or texts, returns, "verified" or "confirmed" delivery, a price outside Pricing.

## 6. The shot list and the screencast
**Shots.** Take them on corvara, as installed, at 1600×900. There should be 3 to 6, each with alt text.
1. Orders, the list.
2. An order opened, showing products, recipient, and Order activity.
3. Advanced: the export row and "What this record contains".
4. Dashboard: the top three numbers and the rates.
5. Settings, Delivery.

**Never in frame:**
- A real buyer's name, email or address. corvara's are Sam's own test data; check each one anyway.
- The "$" artifact.
- A price.

**Screencast** (2–3 min, English, YouTube unlisted):
1. Open The Ritualist from Apps: the Dashboard.
2. Orders: search, then open an order.
3. Order activity: each step names its source.
4. Advanced: download the PDF.
5. Open the order's tracking link on a phone: the order page.
6. Settings, all three tabs: tracking link, the email line, account.
7. Billing.
8. Help.

## 7. Protected customer data: the same answers as ink's (Partner Dashboard, The Ritualist, API access, Protected customer data)
| Question | Fact on the shared backend, 2026-09-25 |
|---|---|
| Minimum data, tell merchants, limit to purpose | Name, email and address for the order page and record. Published at www.in.ink/security.html and /dpa.html. |
| Agreements with merchants | The DPA is live at https://www.in.ink/dpa.html |
| Retention periods | The retention scrub is **on**: 24 months, `retentionScrub` deployed 2026-09-25 04:47Z |
| Encrypt backups | Daily backups kept 14 days, plus point-in-time recovery, encrypted by Google. **No scheduled backup exists yet** (list empty at the time of writing); the full export of 2026-09-25 stands in until the first one. |
| Test and production separate | Development stores are stamped test and excluded (#196), with a 90-day line |
| Data loss prevention | Public read of records closed 2026-09-25 (#160). Delete protection is on. Logs mask buyer names and addresses. |
| Limit staff access | One owner holds project access |
| Log access | Firestore data-access audit logs are on (30 days) |
| Incident response | Published on /security.html |
| **Strong passwords** | **No** (Sam). This is the one open answer. The browser session stopped here: questions 4, 8, 10–13, 15 and 16 go to Yes, and 14 stays No. |

**Privacy URL for this listing:** today https://www.in.ink/privacy.html (stale, finding 8).

## 8. The config release: Sam's click on the laptop, never a session's
`shopify.app.toml` carries one change not yet released to Shopify: the `app_subscriptions/update` webhook (#188). Release it from a clean checkout of main. Don't use the embed checkout, because the CLI trips on `.claude/worktrees/*/shopify.web.toml` there. Use a `git archive` copy:
```bash
rm -rf /tmp/ritualist-release && mkdir /tmp/ritualist-release && cd ~/Desktop/INK_7_13/Ink-Shopify-Dashboard && git fetch origin && git archive origin/main shopify.app.toml package.json | tar -x -C /tmp/ritualist-release && cd /tmp/ritualist-release && shopify app deploy --config shopify.app.toml
```
**The CLI must list only the new webhook subscription `app_subscriptions/update`.** Stop, and do not confirm, if it lists any of these:
- a scope change, which forces every merchant to consent again;
- an extension;
- a URL change.

## 9. Done since (2026-09-25, on Sam's word)
- **Config released:** `the-ritualist-18`, the `app_subscriptions/update` webhook only. The live config was pulled and compared first; the scopes are the same 20.
- **Privacy parity with ink, embed #208 (merged):** data requests are saved and downloadable in Settings, deletions are retried until done, and custody events are erased.
- **Privacy pages, the-ritualist #1422 (live):** www.in.ink/ritualist-privacy.html is The Ritualist's policy, and /privacy.html is an index to both apps' policies.
- **Protected-data answers entered on both apps:** every answer Yes except 14, strong staff passwords, which is **No**.

## 10. SAM'S CLICKS, in order
1. **Strong passwords (question 14).** While it is No, Shopify will likely hold the protected-data request, which is ink's experience on 09-25. It becomes Yes when you turn on 2-step sign-in for Google, GitHub, Shopify Partners, Cloudflare and Supabase, and inkadmin's one shared password is replaced. Then flip 14 to Yes on both apps.
2. **Pricing, "paid but not for pilots".** Set up the plans in Partner Dashboard, then The Ritualist, then Pricing (Managed Pricing), and send the app's plan-page handle, so a session can set `SHOPIFY_APP_HANDLE`. How pilots stay free is yours to choose: a private free plan, or the record left included for them.
3. **Listing:** the name "The Ritualist"; the §5 drafts in your words; no SMS or returns; privacy URL https://www.in.ink/ritualist-privacy.html.
4. **Testing notes:** "Open The Ritualist Studio", "Orders", no "Open dashboard" step, corvara's login.
5. **Screenshots and screencast** per §6.
6. **Warm server on:**
   ```bash
   gcloud run services update shopify-app --project inink-c76d3 --region us-central1 --min-instances=1
   ```
7. **Run the automated checks again.** They still list the old checkout extension. Then tick "I've reviewed all the App Store Requirements", then **Submit fixes** with the §4 note.
