# Session: 2026-06-02 (kväll 2026-06-01 -> natt)

## What was done
- **Diagnosed + fixed swedishbalance.se 403 outage.** Apex `@` had two A records and round-robined between them: `23.227.38.65` (Shopify, 200) and `45.84.206.37` (dead Hostinger LiteSpeed box, 403). ~50% of visitors got 403 -> lost purchases through the evening. Plus a stray apex AAAA on a Hostinger IPv6.
  - Fix via Hostinger DNS API: deleted stray A + AAAA, set apex A = `23.227.38.65` only, TTL 60 (matching prior known-good). Verified propagation.
- **Root-caused the timeline with Hostinger zone snapshots.** First guess (leftover migration record) was WRONG. Snapshots proved apex was clean Shopify-only (TTL 60) until 2026-05-31 10:32 UTC. The damage was Hostinger's **automated teardown of the expired Business Web Hosting plan** (expired 2026-05-10, grace ~3wk): snapshots show "Zone records delete request" x2 + "Hosting CDN disabled" on 2026-05-31, after which the dead Hostinger IP + AAAA were injected and TTL bumped 60->1800.
- **Full account audit (13 domains).** Dead IP only on swedishbalance.se. Found: doginwork.com served Hostinger parking page; wirasleep.com/.de return 409 (point to Shopify, not connected); astridjensen.com expired 2026-05-11; several domains non_renewing.
- **doginwork.com -> doginwork.se** 301 redirect via Hostinger forwarding API. Verified.
- **swedishbalance.dk -> swedishbalance.se/da-dk** 301 redirect via Hostinger forwarding (DK market migrated to .se/da-dk ~2026-05; .dk being retired, auto-renew already off, exp 2027-01-13).
- **Built + deployed hourly uptime-watch** (GitHub Actions -> Telegram). `scripts/uptime-watch.mjs` + `.github/workflows/uptime-watch.yml`. Checks DNS integrity (dead-IP detection), storefront status, and Hydro13 + HappySleep SE/DK/NO PDPs + doginwork Valpakademin quiz (200 + size + sentinel). Secrets set via GitHub REST API + libsodium sealed-box (no gh CLI). Test run green; Telegram delivery confirmed.
- Per request: removed the daily heartbeat - watch is now completely silent unless something is wrong.

## Decisions made
- **Monitor on GitHub Actions, not Vercel cron.** Vercel Hobby = daily crons only; and the watcher must live outside the infra it watches (an internal cron can't alarm when the app/DNS is down). GHA is free, external, always-on.
- **Smart checks, not naive ping.** Tonight's failure was intermittent (round-robin) so a single 200-check would have missed it ~50% of the time. DNS RRset inspection (one query returns the full record set) deterministically catches a stray/dead IP; content checks catch "loads but broken".
- **Sentinel = `product-form`** for Shopify PDPs, `Valpakademin` for the quiz - both verified present by curling first.
- Left wirasleep untouched; astridjensen.com to lapse; swedishbalance.dk to lapse (auto-renew already off).

## Current state
- swedishbalance.se: UP, apex Shopify-only, fully propagated. ✅
- All revenue-critical stores healthy (get-renew.com, swedishbalance.se, doginwork.se). ✅
- uptime-watch: LIVE, runs :17 hourly, silent on green. HEAD `0428e77b`.
- doginwork.com + swedishbalance.dk redirects: live. ✅

## Blockers / Open questions
- **Security:** content-hub git remote URL has a GitHub PAT in plaintext (`ghp_...`). Leak risk - rotate + use a credential helper. (User aware, no rush.)
- `runtime/quiz-runtime/node_modules/` is untracked (should be gitignored). Many old journal files also untracked - pre-existing, not this session.

## Next up
1. (Optional, user's call) Rotate the embedded GitHub PAT in the content-hub remote.
2. (Optional) Add checkout-flow / more-market checks to uptime-watch if desired.
3. Consider a free external backstop (UptimeRobot/Better Stack) on top of GHA for true independence (was offered, not yet chosen).
