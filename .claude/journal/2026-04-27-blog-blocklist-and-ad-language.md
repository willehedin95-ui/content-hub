# Session: 2026-04-27 - Blog topic blocklist + per-workspace ad image language

Short focused session. William noticed two Renew blog articles that pushed Hydro13 in topics the product isn't intended for, and reinforced the rule that any text in nano banana / Kie AI generated images must be in Swedish (never English).

## Trigger

William flagged two live articles:
- `https://get-renew.com/blogs/kollagen/kollagen-gravid` - had heading "Bäst för gravida som fått godkänt av sin barnmorska" + CTA "Se Hydro13 här". Hydro13 is not intended for pregnant women.
- `https://get-renew.com/blogs/kollagen/kollagen-leder` - had CTA "Redo att testa kollagen för dina leder? Beställ Hydro13" + ingredient pitch in joint context. Hydro13 is not a joint product.

Disclaimers existed on both, but they still pushed Hydro13 inside an audience-mismatch context.

## Decisions

After discussion: **delete both articles outright** rather than rewrite without CTA. Topical-authority value of 2 articles is marginal vs. risk of misleading customers + maintenance cost. Better to focus the 32-article plan on topics that actually sell Hydro13 (skin, hair, klimakteriet, anti-aging).

## Changes (commit `44b3b7b`, pushed to main)

### 1. Articles deleted
- `scripts/delete-renew-blog-articles.ts` (one-off): looks up Shopify article IDs by handle for the `kollagen` blog, calls `DELETE /admin/api/2024-01/blogs/{blogId}/articles/{articleId}.json`, then marks `blog_content_plan` rows `deferred` and removes `pages` + `translations` rows so autopilot won't re-publish.
- Shopify article ids: `567927636123` (kollagen-gravid), `567949459611` (kollagen-leder). Both removed.
- `kollagen-leder` returns proper 404. `kollagen-gravid` returns Shopify branded "finns inte" page (HTTP 200 but rendered 404 - Shopify quirk).

### 2. Topic blocklist mechanism
- Workspace setting `blog_topic_blocklist: string[]` - case-insensitive substrings matched against slug, title, primary_keyword.
- `src/lib/blog-autopilot.ts` `pickNextArticle`: filters `blog_content_plan` candidates, auto-defers blocklisted rows so they don't keep showing up as "planned" in the UI, and filters DataForSEO suggestions.
- `src/lib/gsc-gaps.ts` `addGapsToContentPlan`: skips blocklisted gaps before insert (so GSC gap discovery can't re-introduce them). Returns `{ added, skipped, blocked }`.
- Hydro13 blocklist set: `["gravid","graviditet","amning","leder","ledsmärta","ledvärk","ledinflammation","artros","barn","bebis"]`.

### 3. Static ad prompt - per-workspace language
- Found `src/lib/static-ad-prompt.ts:677` had hardcoded "ALL text in hooks, headlines, and any text embedded in prompts MUST be in ENGLISH" applied to ALL workspaces. Hydro13/Renew publishes ads directly in Swedish (no translation step afterward), so this was leaking English overlays into Swedish ads.
- `generateImageBriefs` now resolves generation language from `job.workspace_id` → `workspaces.settings.ad_copy_language` (default `"en"`).
- `buildBriefSystemPrompt(generationLanguage)` builds the LANGUAGE RULE conditionally:
  - `en`: unchanged, "MUST be in English, will be translated later"
  - `sv`/other: "publishes directly in {Lang}, NO translation step, ALL text MUST be in {Lang}, no 'COLLAGEN' / 'HYALURONIC ACID' / 'BEFORE / AFTER' English overlays"
- No caller changes needed; resolution happens internally. Optional `generationLanguage` override on the options object for callers that already have it.

## Memory updates (auto-memory at `~/.claude/projects/.../memory/`)

- New: `feedback_nano_banana_swedish_text.md` - hard rule, any visible text in Kie AI / nano banana images must be Swedish, never English. Pointer added to MEMORY.md topic index.
- Updated `MEMORY.md` Hydro13 nano banana section - language rule rewritten to be unambiguous (was "All prompts in English, Swedish text as content within" which read both ways).
- Updated `nano-banana-ugc-prompts.md` with the same explicit rule + example.
- Updated `seo-blog.md` - documented kollagen-leder/kollagen-gravid removal + the new blocklist mechanism.
- Updated `autopilot.md` - documented the per-workspace ad-image language behavior in `generateImageBriefs`.
- Fixed `MEMORY.md` Supabase access token (old value `sbp_111fc4cc...` was stale; live value `sbp_c05da7e8...` from `content-hub/.env.local`).

## Blocked / not done

- Did not commit-and-push journal updates yet (this entry).
- William's MEMORY.md rule: don't push after every fix - already pushed once today (44b3b7b for the actual code fix).

## Files touched

```
M src/app/api/cron/gsc-gap-refresh/route.ts  (results array type + log line)
M src/lib/blog-autopilot.ts                  (pickNextArticle + isTopicBlocked helpers)
M src/lib/gsc-gaps.ts                        (addGapsToContentPlan blocklist filter)
M src/lib/static-ad-prompt.ts                (dynamic LANGUAGE RULE + getAdCopyLanguageByWorkspaceId)
A scripts/delete-renew-blog-articles.ts      (one-off Shopify cleanup, kept for re-runnability)
```

## Build

`npm run build` - passed after fixing `results` array type in `gsc-gap-refresh` route to include `blocked: number`.
