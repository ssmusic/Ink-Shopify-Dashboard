# Handoff — Importing Into Health's evidence layer into in.ink

**Written 2026-09-19.** Self-contained brief for a code session porting Into
Health's proof/verification work into the ink stack. Trust `git log` and the
live code over this doc, including this one. Every line reference below was
read at these commits:

| Repo | Commit read | Role |
|---|---|---|
| `ssmusic/ink-backend` | `600c972` | The shared backend. `ink-firebase/functions` (Cloud Functions API), `ink_web` (the in.ink consumer SPA), `ink_admin`, `lovable` |
| `ssmusic/intohealth-backend` | `109d0e4` | A FORK of the same backend. Adds `evv/` and `mcp/` |
| `ssmusic/Ink-Shopify-Dashboard` | this repo | Shopify embedded app — a thin client |
| `ssmusic/into_health_platform` | `6faf210` | Into Health frontend (fork of `inkadmin`) |

---

## 1 · The thesis

**Into Health can prove things to a stranger. ink can only show you things.**

ink captures more than Into Health does — six sibling event collections, a
person ledger, returns, carrier locations. What it cannot do is let anyone
outside ink check that any of it is true. `/retrieve` hands a caller a
`signature` and a `public_key` and nothing to verify them against.

Everything in this handoff serves that one gap, plus the three live bugs found
on the way to it.

## 2 · Why this is cheap: the two backends are forks of one ancestor

Diffed file by file at the commits above. These are **byte-identical** in both
repos:

```
config/database.js            utils/crypto.js          utils/gps.js
utils/geocode.js              utils/custodySignature.js utils/webhook.js
utils/apiKeyAuth.js           utils/inventory.js       utils/deliveryWindow.js
utils/merchantAnimationPick.js utils/adminInventoryReport.js
routes/api/inventory.js       routes/merchantByProof.js routes/retrieve.js
routes/enroll.js              routes/merchantByToken.js
```

The Ed25519 primitives, the haversine, the geocoder and the custody signer are
already the same code. Into Health's additions sit entirely in `evv/` and
`mcp/`, which ink does not have. **Nothing has to be reconciled at the
foundation layer.**

Corollary, and a standing hazard: a fix to `utils/gps.js` today has to be made
**twice**. Lifting the identical set into a shared package is worth doing
before the port, not after.

## 3 · The three live bugs (symptom → root cause → fix)

### 3.1 ink records honest buyers as anomalous

**Symptom.** A buyer who declines the location prompt gets
`delivery_gps: {lat: 0, lng: 0}` and `gps_verdict: 'flagged'` written to their
proof, signed into a `DELIVERY_VERIFIED` custody event, and served on the
public receipt.

**Root cause, in three places:**

1. `ink_web/src/pages/auth/AuthUnlockingHandler.tsx:59-63` — on denial the page
   substitutes Null Island:
   ```js
   // Only use real coordinates when user approved; otherwise use placeholder so delivery record hides map
   const coordinates = geoResult.success && geoResult.coordinates
     ? geoResult.coordinates : { lat: 0, lng: 0 };
   ```
   The frontend knows it is a placeholder. That knowledge never reaches the
   backend. Same shape in `premium/PremiumUnlockingHandler.tsx`.
2. `ink-backend/.../routes/verify.js:71-81` — `sanitizeGps` only tests
   `Number.isFinite`, so `{0,0}` passes as a real fix.
3. `routes/verify.js:324-325, 350-351` — `calculateDistance(0, 0, shippingLat,
   shippingLng)` ≈ 10,000 km → `getGpsVerdict` → `'flagged'`.

**The opposite failure exists too.** When the shipping address was never
geocoded, `distance` and `gpsVerdict` are never reassigned from their
declarations at `:324-325`:
```js
let distance = 0;
let gpsVerdict = 'pass';
```
and the catch at `:360` resets them to the same. So:

| Shipping address geocoded? | Buyer declines location → |
|---|---|
| Yes | `flagged` (Null Island, ~10,000 km) |
| No | `pass` (default never overwritten) |

Wrong in both directions. It then propagates: persisted `:486`, returned
`:572-574`, carried in the custody event `:227-228`, served publicly at
`routes/retrieve.js:90`.

**Fix — Into Health already wrote it.** `evv/binding/ceremony.js:101`:
```js
// Honest, not hopeful: PASS only when the tapping device actually shared a
// fix. NOT_SHARED is a neutral state ... it never degrades the status, it
// just refuses to claim a pass that didn't happen.
gps: ctx && ctx.gps ? 'PASS' : 'NOT_SHARED',
```
plus `reason` codes on the co-location block (`routes/evv/tap.js:219`) and a
neutral grey-dash `na` render (`into_health_platform/src/pages/evv/VisitDetail.tsx:67-75`).

Their own postmortem on this bug (`HANDOFF_GPS_LOCATION.md` §3.2): *"Ceremony
hardcoded `gps:'PASS'` with no fix — a weak visit shown as strong, the one
forbidden thing."*

**ink already captures the signal it needs.** `utils/tapOpenContext.js` writes
`gps_permission` (`granted` | `denied` | `skipped`) on **every** tap row. It is
never read. Use it rather than inferring from coordinates.

### 3.2 A tap fires on any page load

**Symptom.** Any load of the receipt URL counts as a delivery: a reload, a
restored background tab, a link-preview fetch, the merchant testing the link.

**Root cause.** `ink_web/src/pages/auth/AuthUnlockingHandler.tsx:47-50` — the
tap fires from `useEffect` on mount, with no gate:
```js
(async () => { await loadAnimation(); requestLocationAndVerify(); })();
}, [token]);
```
Same in `premium/PremiumUnlockingHandler.tsx`. The only guards downstream are a
10s post-enrollment cooldown and a duplicate check on `proof.delivery_timestamp`
— so the *first* load wins, whoever caused it.

**Fix — field-proven, hardware-independent.** Into Health hit this exact
failure on Android Chrome (a visit closed with nobody tapping) and shipped the
tap-born gate, `into_health_platform/src/pages/TapPage.tsx:268-280`:
```js
const nav = (performance.getEntriesByType?.("navigation") || [])[0];
const tapBorn = !nav || nav.type === "navigate";
const youngEnough = performance.now() < 90_000;
if (!tapBorn || !youngEnough) return; // stale page: display-only
```
An NFC tap is a genuine new navigation seconds before the fire. A reload,
bfcache restore or discarded-tab reload is not.

### 3.3 The JWKS `kid` can silently stop matching

`routes/jwks.js:24` hardcodes `kid: 'key_001'`, while
`utils/custodySignature.js:3` stamps `process.env.ED25519_KEY_ID || 'key_001'`
onto every custody event. Set `ED25519_KEY_ID` in ink and external verification
breaks with no error anywhere.

Into Health's `routes/jwks.js` is ink's plus five lines — reads the env var,
adds `alg: 'EdDSA'`, sets cache headers. Straight copy.

## 4 · The import manifest

Source paths are under `intohealth-backend/ink-firebase/functions/`.

### 4.1 Copy as-is

These import only from files ink already has byte-identical.

| File | Lines | Gives ink |
|---|---|---|
| `evv/chainEvent.js` | 50 | Hash-linked custody events (`seq`, `prev_event_id`, `prev_payload_hash`, `signed_payload`) |
| `evv/chainVerifier.js` | 73 | Independent read-side chain verification |
| `routes/jwks.js` | 5-line delta | §3.3 |
| `evv/connectors/nearestLocation.js` | 93 | Honest nearest-location; `distance_m: null` when unmeasured |

`chainEvent.js` is ink's `custodySignature.js` plus the chain fields. Note its
comment, which names a bug ink has **today**:

> Persist the exact signed string so an independent verifier re-checks the
> signature byte-for-byte — Firestore does NOT preserve JSON key order, so
> re-serialising the stored event would change the bytes and break the sig.

ink stores only `signable_payload_hash`, not the bytes. Anyone re-verifying an
ink signature must re-serialize from Firestore, and key order may differ — so
verification can fail on a genuine record. **This is the single most important
detail in the port.**

ink has 11 custody event types to backfill `seq`/`prev` into: `ENROLLED`,
`DELIVERY_VERIFIED`, `TAP_RECORDED`, `MEDIA_UPLOADED`, `CARRIER_DELIVERED`,
`PASSPORT_GENERATED`, `PASSPORT_SCANNED`, `RETURN_INITIATED`,
`RETURN_LABEL_GENERATED`, `RETURN_COMPLETED`, `RETURN_CANCELLED`.

### 4.2 Port the pattern — right idea, EVV-shaped code

| File | Lines | Rewrite as |
|---|---|---|
| `evv/auditPacket.js` | 123 | Delivery claims instead of federal elements. Keep the law: no signed event backing a claim → `MISSING`, never fabricated |
| `routes/evv/verifyVisit.js` | 100 | Public "verify this delivery yourself" endpoint |
| `evv/proofReceipt.js` | 175 | Signed receipt a merchant can hand a third party |
| `evv/triage.js` | 1189 | Group merchant exceptions by cause, propose action. Reads only — never writes |
| `evv/bulkExport.js` + `evv/recordsRequest.js` | 914 | Signed export bundle; `manifest.json` inventories every file by path, bytes and SHA-256 |
| `evv/askRecord.js` | 407 | "Prove this delivery happened," answered only from the signed packet |
| `mcp/phi.js` | 88 | Field allowlist on public surfaces (see §5.2) |

`verifyVisit.js` is the headline. Its own header states the goal:

> Returns everything an outside party (auditor / payer) needs to RE-VERIFY a
> visit's proof in their own browser, **WITHOUT trusting Into Health**

`askRecord.js` carries the rule that makes an LLM safe over evidence:

> The model decides WHICH QUESTION is being asked.
> The code decides WHAT THE EVIDENCE SAYS.

ink already has the Anthropic client, the spend circuit-breaker and two AI
lanes (`utils/playSynthesis.js`, `routes/analyst.js`) — all aimed at generating
marketing copy. Nothing in ink can answer a question about evidence.

### 4.3 Copy the law, write your own code

- **`NOT_SHARED`** — `evv/binding/ceremony.js:101`. Never claim a pass that
  didn't happen.
- **Tap-born gate** — `into_health_platform/src/pages/TapPage.tsx:268`.
- **`coloSummary()`** — `routes/evv/tap.js:251`. Public surfaces get the verdict
  and the distance, never the coordinates: *"a lat/lng at a timestamp is a home
  at a moment."*
- **Wilson 95% intervals, `pct: null` at n=0** — `evv/divergence.js`. Never
  report `0%` for zero samples; every rate carries its n.

### 4.4 Do NOT port the chip crypto

`evv/tag/` (cmac.js, ntag424.js, keyProvider.js, kmsClient.js, tagKeys.js,
consumedSet.js) is spec-exact NXP AN12196 and it is real code — but Into
Health's field tags run `sun_mode: 'simulated'`, where the server mints the tap
and then validates its own mint (`routes/evv/tap.js`, via
`tagKeys.simulateTap`; note `tagKeys.js:60` claims it is "NOT used in the
request path", which is stale). Their own open item is *"Real NTAG 424 cards
not ordered."*

For tags actually in the field this is the same trust model as ink's bearer
`nfc_token`. **It buys ink nothing today.** Revisit only at a hardware
decision — and if you do, `evv/tapValidator.js` is the migration path: it
discriminates on `sun_mode` and runs both schemes side by side.

## 5 · The surfacing gap (ink-only work, no Into Health code needed)

Found while auditing. Independent of the port, and cheaper.

### 5.1 Per-tap distance is captured, stored, and never shown

`utils/tapOpenContext.js:124` writes `distance_to_shipping_m` on **every** tap
row including duplicates — that was the explicit point of hoisting it in
`verify.js`. `/admin/tap-events?proof_id=` already serves it
(`routes/admin.js:1366`), and the Shopify dashboard already holds
`X-Admin-Secret` (`app/services/ink-api.server.ts:59`).

In this repo, `app/routes/app.orders.$orderId.tsx:355`:
```js
distance_meters: null, // Not returned by /retrieve, only /verify
```
That is the only assignment, so **two already-built renders are permanently
dead**: the "Location verified · *Xm from shipping address*" timeline row
(`:1068`) and `TapLocationCard`'s "Distance from address" (`:1108`).

The same bug was already found and fixed once — in the admin console. The
comment above `routes/admin.js:1366` reads: *"distance_to_shipping_m was
hard-coded null here while the console's own type already expected the value."*

**Order this after §3.1.** Wiring the distance up first means merchants start
seeing `10005432m` on honest buyers.

### 5.2 The dashboard reads the wrong endpoint

| Endpoint | Fields |
|---|---|
| `/retrieve` — legacy public receipt, what the order page uses | 10 |
| `/api/proofs/:token` — authenticated merchant door; dashboard already has the Bearer key (`ink-api.server.ts:339`) | ~40 |
| what the order page keeps | **6** |

Switching unlocks `customer_tier`, `customer_order_count`, `customer_ltv`,
`within_expected_window`, `shipping_geocode_accuracy_m`, `phone_verified_at`,
`payload_hash` — with no backend change.

Related, and the reason `mcp/phi.js` is in §4.2: `/retrieve` is mounted under a
comment reading `// Legacy public routes` (`app.js:159-161`) with no auth, and
returns `delivery_gps` (raw coordinates of where the buyer tapped — their
home), `shipping_address_gps`, `warehouse_gps` and `shipping_address_raw`.
`app/components/TapLocationCard.tsx` renders it to six decimals (~11 cm) and
ships the coordinates to Nominatim and a Google Maps embed on every render.

### 5.3 Everything else captured but unexposed to merchants

Each has an admin read door (`routes/admin.js` `ADMIN_EVENT_DOORS`, ~line 1470).
The Shopify dashboard consumes **none** of them.

| Collection | Unused fields |
|---|---|
| `tap_events` | `distance_to_shipping_m` · `gps_permission` · `gps_accuracy_m` · `ms_since_prev_tap` · `tracking_status_at_tap` · `tracking_last_moved_at` · `delivered_at_tap` · `src` · `entry` · `referrer_host` · `local_hour` · `tz_offset_min` · `network_type` |
| `visit_events` | `seconds_visible` · `max_scroll_pct` · `sections_seen` |
| `click_events` | `block` · `href` · `ms_since_open` |
| `serve_events` | `served_page_key` · `holdout` · `score_band` · `withheld_page_id` |
| `estimate_events` | The full delivery-promise history: merchant promise → carrier's first word → every revision |
| `return_page_events` | `status_at_view` · `mode_at_view` |
| `customers` | Repeat rate per person (`utils/personLedger.js`) |

### 5.4 One shipped number is currently garbage

`routes/api/merchantInsights.js:73` averages
`first_tap_distance_to_shipping_m` into `integrity.geofence.avg_distance_m`,
rendered as "Geofence accuracy" in `app/components/AdvancedAnalytics.tsx:111`.
That average includes the Null Island values from §3.1 — one denied-location
tap in a hundred moves it by ~100 km. Fixing §3.1 fixes this; a backfill over
existing proofs is a separate decision.

## 6 · Suggested order

1. **§3.1** Null Island → `NOT_SHARED`, using the `gps_permission` already on
   the row. Backend + both unlocking handlers.
2. **§5.1 + §5.2** Per-tap distance table from `/admin/tap-events`; swap
   `/retrieve` → `/api/proofs/:token`. Mostly this repo.
3. **§3.3** `jwks.js` kid. Five lines.
4. **§3.2** Tap-born gate in both unlocking handlers.
5. **§4.1** `chainEvent` + `chainVerifier`, then backfill the 11 emit sites.
6. **§4.2** Audit packet → public verify endpoint → receipt → export bundle.
   Each is built on the one before it.

1–4 are bug fixes. 5 is the unlock; 6 is the product.

## 7 · Gotchas

1. **Store the signed bytes** (§4.1). Firestore does not preserve JSON key
   order. Without `signed_payload`, re-verification can fail on genuine records.
2. **`gps_permission` already exists** on every tap row. Do not build a new
   capture path.
3. **Fix Null Island before surfacing distance** (§5.1), or merchants see
   absurd numbers.
4. **Don't fork `utils/crypto.js` again** (§2). Lift the identical set into a
   shared package first.
5. **`/retrieve` returns `public_key` inline beside the signature** — it
   self-certifies and proves nothing. `evv/proofReceipt.js` guards this
   explicitly: *"an included key can never be presented as independently
   trusted."* Verification belongs on the separate JWKS channel.
6. **Three haversines exist**: `utils/gps.calculateDistance` (metres),
   `utils/carrierLocationQuery.haversineMeters` (metres), and Into Health's
   `routes/evv/tap.js haversineFt`. Into Health already wrote the dedupe note —
   `evv/connectors/nearestLocation.js`, `TODO(gps-dedupe)`.

## 8 · Code map

**ink-backend** (`ink-firebase/functions/`)
- `routes/verify.js` — the tap path. `sanitizeGps` :71, distance hoist :322,
  custody event :215, proof write :486, response :572
- `routes/retrieve.js` — public receipt; the payload at :68-95
- `routes/admin.js` — `/admin/tap-events` :1399, row mapper :1328,
  `ADMIN_EVENT_DOORS` :1470, `/admin/people` :1700
- `routes/api/proofs.js` — merchant projection, ~40 fields, from :58
- `routes/api/merchantInsights.js` — the only merchant-facing aggregate
- `utils/tapOpenContext.js` — tap wire validation + per-row stamps
- `utils/custodySignature.js` — signs, does not chain

**ink_web** (`src/`)
- `pages/auth/AuthUnlockingHandler.tsx` — main tap path; auto-fire :47,
  Null Island :63
- `pages/premium/PremiumUnlockingHandler.tsx` — same shape
- `pages/auth/PhoneVerificationHandler.tsx` — takes lat/lng from the URL query
  string (:47-48). Client-supplied and forgeable; a separate design decision,
  not in scope above
- `pages/DeliveryRecord.tsx` — the buyer's receipt; shows no distance

**This repo**
- `app/routes/app.orders.$orderId.tsx` — `distance_meters: null` :355, dead
  renders :1068 and :1108
- `app/components/TapLocationCard.tsx` — 6-decimal coordinates → Nominatim +
  Google embed
- `app/services/ink-api.server.ts` — holds both credentials: `X-Admin-Secret`
  :59, merchant Bearer :324

**intohealth-backend** (`ink-firebase/functions/`) — everything in §4, plus
`HANDOFF_GPS_LOCATION.md` at the repo root, which is the field postmortem
behind §3.1 and §3.2 and worth reading first.

## 9 · Not verified here

- Nothing in this handoff was run. All findings are from reading code at the
  commits in the header.
- No production data was queried; the Null Island and default-`pass` paths are
  established from the code, not from observed records.
- Backfill policy for existing proofs carrying Null Island coordinates or a
  false `pass` is an open decision (§5.4).
- `ink_admin/` and `lovable/` in both repos were not audited.
