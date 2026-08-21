# INK-SHOPIFY-DASHBOARD (the embed) — the map, and the bridge

You are in **one of three repos** that make up ink. This file is the map, never
the content — if code and a doc disagree, verify against code.

## WHAT THIS REPO IS

The Shopify admin embed — the merchant-facing app inside Shopify, deployed on
**Cloud Run**, auto-deploying on merge to `main`. The product it fronts is
**The Ritualist** (naming authority: feed-the-ai PR #644 — "the Ritualist"
mid-sentence, mark `the ritualist.`).

## THIS REPO'S OWN TRAPS

- **Two remotes.** `origin = ssmusic/Ink-Shopify-Dashboard`, `upstream` is a
  fork. `gh` defaults wrong and 404s — **always `-R ssmusic/…`**. Deploy from
  origin.
- **Merging to `main` deploys.** Docs-only changes still ship a revision; after
  any deploy, confirm the *serving* revision actually flipped
  (`gcloud run services describe … latestReadyRevisionName`).
- **Own comms stack, separate from everything else**: `SENDGRID_*` and
  `TWILIO_*_PHONE_NUMBER` live in Cloud Run env. This repo does NOT send
  through the worker's Resend rail, and the worker's Twilio vars are not these.
- Secrets live in Cloud Run env only. Never regenerate the Shopify `8da1…`
  credentials.

## THE BRIDGE — how the repos touch

    THE MINT (feed-the-ai/scripts/mint)   mints demos, sends cold letters
    THE WORKER (ink-easypost-proxy)       *.in.ink, demo register, send rail
    ink-backend                           canon: proofs, signing, returns
    THIS REPO                             the merchant's Shopify surface

- This repo reads the worker only for public brand-book data
  (`app/services/brand-email.server.ts` → `/api/public/brand-book`). Despite
  that filename, it sends no mail through the worker.
- The backend (`ink-backend`) is canon for proofs/returns; it deploys ONLY
  locally from `deploy/returns-testgate` — never assume a backend change is
  live because it merged.
- Demo links (`{brand}.in.ink/demo#g=mlt_…`) come from THE MINT via the worker
  and sign a stranger in as that demo's merchant. Real rigs for testing:
  **Steve Madden `sm-test-hhawzn52` + Clare V only** — never invent data on a
  real merchant.

## WHERE THE REST OF THE TRUTH LIVES

- `../feed-the-ai/CLAUDE.md` — the ten laws, spend discipline, voice.
- `../feed-the-ai/BRAND_BIBLE.md` — how we talk; read before ANY merchant copy.
- `../feed-the-ai/scripts/mint/CLAUDE.md` — THE MINT's map.
- `../feed-the-ai/ENGINEERING_BIBLE.md` §17 — landmines across all three repos.
