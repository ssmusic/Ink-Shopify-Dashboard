# Handoff — Into Health's evidence layer in in.ink: what landed, what's left

**Written 2026-09-19. Rewritten 2026-09-23 after re-auditing.** Trust `git log`
and the live code over this doc.

> **Read this first.** The 2026-09-19 version of this file audited
> `ssmusic/ink-backend` at **`main` (`600c972`)**. That was the wrong branch.
> ink-backend's live branch is **`deploy/returns-testgate`** — every recent PR
> (#126–#133) merges there, and `main` has not moved since before this work
> began. Most of what the first version proposed was designed and shipped on
> that branch on 2026-09-19, the same day it was written. This rewrite records
> what actually landed and what is genuinely still open.

| Repo | Live ref | Role |
|---|---|---|
| `ssmusic/ink-backend` | **`deploy/returns-testgate`** (`8ee3abf`) — *not `main`* | Backend API + `ink_web` (the in.ink consumer SPA) |
| `ssmusic/Ink-Shopify-Dashboard` | `main` (`f866629`) | Shopify embedded app |
| `ssmusic/intohealth-backend` | `main` (`109d0e4`) | The source of the patterns below |

---

## 1 · What landed (2026-09-19 → 09-23)

All on `deploy/returns-testgate` unless noted.

| Item | Commit / PR | State |
|---|---|---|
| Honest GPS verdict — `not_shared` / `unmeasured` / `pass\|near\|flagged` | `216dc69` | **Done** |
| `{lat:0,lng:0}` rejected at `sanitizeGps` | `216dc69` | **Done** |
| `gps_permission` read rather than inferred from coordinates | `216dc69` | **Done** |
| JWKS `kid` follows `ED25519_KEY_ID`, `alg: 'EdDSA'` | `185463b` | **Done** |
| Chained custody events — `seq`, prev-link, exact signed bytes | `cd3b885` — `utils/chainEvent.js` (306L), `utils/chainVerifier.js` (287L) | **Done** |
| Audit packet + public re-verification door | `a4a14c4` — `utils/auditPacket.js` (717L), `routes/verifyOrder.js` | **Done** |
| Signed third-party receipt | `utils/proofReceipt.js` (177L) | **Done** |
| `/retrieve` scoped to the asking shop | ink-backend #127 | **Done** |
| Per-open location word, replacing the two raw rollups | ink-backend #131, #132; dashboard #140 (`app/lib/open-location.ts`) | **Done** |
| Order page reads the proof door, per-open distance surfaced | dashboard #130, #131, #137, #138 | **Done** |

Two things worth keeping from that work, because they are the evidence the
original analysis was right:

`routes/verify.js` `sanitizeGps`:

```js
// {0,0} is the legacy page's "buyer declined" placeholder (ink_web
// AuthUnlockingHandler), not a fix: measured against a geocoded ship-to it
// read as ~10,000 km and flagged an honest buyer.
if (lat === 0 && lng === 0) return null;
```

`routes/verify.js` `measureAgainstShipTo`, which also names the blast radius:

> a buyer who declined location, or a ship-to that was never geocoded, read as
> a pass that never happened (measured 2026-09-19 through the admin doors:
> **1,354 of 1,366 tapped proofs across 56 merchants**). Into Health's law
> (`evv/binding/ceremony.js`): PASS only when the tapping device actually
> shared a fix.

## 2 · What is still open

### 2.1 The tap-born gate — not shipped

Confirmed absent on `deploy/returns-testgate`: no `performance.getEntriesByType`
or navigation-type check in `ink_web/src/pages/auth/AuthUnlockingHandler.tsx`
or `pages/premium/PremiumUnlockingHandler.tsx`.

The tap still fires from `useEffect` on mount, so **any** load of the receipt
URL counts as a delivery — a reload, a restored background tab, a link-preview
fetch, the merchant opening the link to test it. The only guards downstream are
a 10s post-enrollment cooldown and a duplicate check on
`proof.delivery_timestamp`, so the *first* load wins whoever caused it.

Into Health hit this in the field on Android Chrome (a visit closed with nobody
tapping) and fixed it in four lines —
`into_health_platform/src/pages/TapPage.tsx:268-280`:

```js
const nav = (performance.getEntriesByType?.("navigation") || [])[0];
const tapBorn = !nav || nav.type === "navigate";
const youngEnough = performance.now() < 90_000;
if (!tapBorn || !youngEnough) return; // stale page: display-only
```

An NFC tap is a genuine new navigation seconds before the fire. A reload,
bfcache restore or discarded-tab reload is not. Hardware-independent — it works
on plain NDEF URL tags.

**This is the one remaining item from the original three bugs.**

### 2.2 Not yet built, from Into Health's `evv/`

Source paths under `intohealth-backend/ink-firebase/functions/`.

| File | Lines | Would give ink |
|---|---|---|
| `evv/triage.js` | 1189 | Group exceptions by cause, propose action. Reads only — never writes |
| `evv/bulkExport.js` + `evv/recordsRequest.js` | 914 | Signed export bundle; `manifest.json` inventories every file by path, bytes and SHA-256 |
| `evv/askRecord.js` | 407 | "Prove this delivery happened," answered only from the signed packet |
| `mcp/phi.js` | 88 | Field allowlist on public surfaces, enforced structurally rather than by review |

`askRecord.js` carries the rule that makes a language model safe over evidence:

> The model decides WHICH QUESTION is being asked.
> The code decides WHAT THE EVIDENCE SAYS.

ink has the Anthropic client, the spend circuit-breaker and two AI lanes
(`utils/playSynthesis.js`, `routes/analyst.js`) — all aimed at generating
marketing copy. Nothing in ink answers a question about evidence.

### 2.3 Cosmetic leftovers

- `ink_web` still sends `{lat: 0, lng: 0}` on denial
  (`AuthUnlockingHandler.tsx:63`, `DeliveryRecord.tsx:79`). Harmless now that
  `sanitizeGps` rejects it, but the client should send no fix rather than a
  placeholder the server has to recognise.
- Three haversines still exist: `utils/gps.calculateDistance` (metres),
  `utils/carrierLocationQuery.haversineMeters` (metres), Into Health's
  `routes/evv/tap.js haversineFt`. Into Health already wrote the dedupe note —
  `evv/connectors/nearestLocation.js`, `TODO(gps-dedupe)`.
- `utils/crypto.js`, `gps.js`, `geocode.js` are still duplicated between
  `ink-backend` and `intohealth-backend`. A fix has to be made twice.

## 3 · Still do NOT port the chip crypto

`evv/tag/` (cmac.js, ntag424.js, keyProvider.js, kmsClient.js, tagKeys.js,
consumedSet.js) is spec-exact NXP AN12196 and real code — but Into Health's
field tags run `sun_mode: 'simulated'`, where the server mints the tap and then
validates its own mint (`routes/evv/tap.js` via `tagKeys.simulateTap`; note
`tagKeys.js:60` claims it is "NOT used in the request path", which is stale).
Their own open item is *"Real NTAG 424 cards not ordered."*

For tags actually in the field this is the same trust model as ink's bearer
`nfc_token`. It buys ink nothing today. Revisit only at a hardware decision —
`evv/tapValidator.js` is then the migration path: it discriminates on
`sun_mode` and runs both schemes side by side.

## 4 · Code map

**ink-backend** — branch `deploy/returns-testgate`, under `ink-firebase/functions/`
- `routes/verify.js` — `sanitizeGps` :83, `measureAgainstShipTo` :573
- `utils/chainEvent.js`, `utils/chainVerifier.js`, `utils/auditPacket.js`,
  `utils/proofReceipt.js` — the evidence layer as built
- `routes/verifyOrder.js` — the public re-verification door
- `utils/tapOpenContext.js` — tap wire validation and per-row stamps

**ink_web** — same branch, under `ink_web/src/`
- `pages/auth/AuthUnlockingHandler.tsx` — §2.1 lives here
- `pages/premium/PremiumUnlockingHandler.tsx` — same shape
- `pages/auth/PhoneVerificationHandler.tsx` — still takes lat/lng from the URL
  query string (:47-48). Client-supplied and forgeable; a design decision, not
  covered above

**Ink-Shopify-Dashboard** — `main`
- `app/lib/open-location.ts` — the door's per-open reading
- `app/routes/app.orders.$orderId.tsx` — the order page as reworked

**intohealth-backend** — `main`, the source for §2.2. `HANDOFF_GPS_LOCATION.md`
at the repo root is the field postmortem behind §2.1 and is worth reading first.

## 5 · Not verified here

- Nothing in this doc was run. Findings are from reading code at the refs in
  the header on 2026-09-23.
- No production data was queried. The 1,354/1,366 figure is quoted from the
  ink-backend commit that measured it, not independently reproduced.
- Whether existing proofs carrying a false `pass` or Null Island coordinates
  were backfilled is not established here — the verdict change is forward-only
  unless a migration ran.
