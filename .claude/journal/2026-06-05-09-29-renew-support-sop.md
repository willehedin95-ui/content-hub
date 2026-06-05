# Session: 2026-06-05 09:29

## What was done

Built a complete customer support SOP for Renew (get-renew.com) in Notion. New support agent Carola Astrid Nilsson (`carola.astrid.nilsson@gmail.com`) starts soon and needed a comprehensive playbook.

**Main SOP page**: [Renew Support SOP](https://www.notion.so/365fdc1d333480dba502eb452d0ddbea)

- §§ 1-8 with welcome callout, brand/product info, three customer forms (contact/return/guarantee with pre-qual logic), subscription handling, policies in 60 seconds, process playbooks, FAQ, escalation rules, SLA
- § 9 cheat sheet table (relocated from top to bottom per William's preference)
- Two prominent subpage cards at top (in columns) so they cannot be missed

**Subpage 1**: [Hydro13 App](https://www.notion.so/365fdc1d333481bca927dac566a5a8d8) - companion iOS app support flows, 5 screenshots captured from booted iPhone 17 simulator via mobile-mcp (spawned as Node subprocess since hydro13-ios MCP servers not loaded in this session).

**Subpage 2**: [Loop admin walkthrough](https://www.notion.so/36cfdc1d333481c7ac8dea74241243fa) - 8 annotated screenshots (Shopify Apps entry, Loop login fallback, subscriptions list, detail view, pause modal, cancel modal, edit address, edit details) with red arrows + numbered callouts in English.

**Investigations along the way**:
- Tested the result guarantee Fillout form's edge cases by reading `__NEXT_DATA__` JSON directly - 3 conditional endings (För tidigt <60 days, För sent >90 days, success)
- Tested return form - 2 endings (För sent >14 days redirects to guarantee, success)
- Caught a bug: the "Ansökningstiden har passerat" subtitle on the guarantee form said `kundservice@swedishbalance.se` - William fixed in Fillout
- Drafted Swedish email to Shelfless IT asking how Shopify→Shelfless address sync works. Alexander Strand replied: NO auto-sync on imported orders. Must change in Shelfless partner portal FIRST, then in Shopify. Documented in SOP § 5.7 and Loop walkthrough § 5.

**SLA logic fixed**: William's review of v1 caught that I said "refunds processed same day approved" - which conflicts with the return flow that requires waiting for Shelfless to confirm bottle is unopened. Split refund timing into 3 cases (returns, guarantee, reklamation).

## Decisions made

- **Cheat sheet at bottom, not top** (William's preference) - originally I put it at top assuming most-used = most-prominent. William wanted the welcome/intro to lead.
- **No PII blur on screenshots** (William's call) - support sees real customer data anyway when doing their job, blurring just adds noise.
- **English SOP body** - Carola is Swedish but William wants the SOP to be feedable to ChatGPT/Claude. English handles better. Only customer-facing reply templates kept in Swedish (e.g. dosing cup goodwill response).
- **Loop login flow**: primary path is Shopify → Apps sidebar → Loop Subscriptions tile (auto-login). Backup is app.loopwork.co/login → type `0iq0nr-sp` store handle.
- **Dosing cup FAQ resolution**: don't ship replacement (~80 kr shipping for ~5 kr item). Tell customer "knappt 2 matskedar = 25 ml" workaround + ~50 kr goodwill refund. Subscribers get new cup with next bottle automatically.

## Current state

- SOP is live, complete, ready to send to Carola
- William planned to send it to her immediately at end of session
- Bug fixes William did during session: corrected typo on guarantee form (kundservice@swedishbalance.se → kundservice@get-renew.com)
- Pricing in SOP § 1 may need re-verification - I wrote 749/1349/1949 for one-time and lower for subscription but Notion shows 749/1349/1949 as one-time and 549/949/1349 as subscription. The latter is likely correct (it was in the Notion page when I fetched it).

## Blockers / Open questions

- Carola's Loop user role permissions: she has been added but William hasn't verified she has the right role (should be able to pause/cancel/edit address but NOT change billing/integrations). Worth a quick sanity check in Settings → Members on first login.
- Travel packs launch date: deliberately left vague in FAQ § 6.3. William hasn't committed to a date.
- Hydro13 Android app: SOP says "iOS only for now, no committed Android date". When Android launches, update app subpage.

## Next up

- Carola onboarding session - walk her through the SOP live, answer her first questions
- After 1-2 weeks of real tickets, audit the SOP for gaps (any ticket types not covered, any flows that turned out to be confusing)
- Update SOP § 6.3 when travel packs ship
- Consider adding a "Frequently sent saved replies" Freshdesk template list with Swedish copy for the most common scenarios (currently only the dosing cup template is fully written out)
