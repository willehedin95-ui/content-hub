---
name: context
description: Comprehensive Content Hub project briefing — architecture, workflows, APIs, databases, and current state. Use at the start of a session or when you need to understand the full project.
user-invocable: false
---

# Content Hub — Full Project Context

Read the CLAUDE.md at the project root for the core technical reference. Below is additional operational context.

## What This Is

Content Hub is an internal tool for a solopreneur ecommerce business (HappySleep / Hydro13 brands) selling to Norway, Denmark, and Sweden. A freelancer (Ron) creates English landing pages, static image ads, and ad copy. This hub:

1. Translates content to Norwegian/Danish/Swedish (German for static ads only)
2. Publishes translated landing pages to per-language Cloudflare Pages sites
3. A/B tests landing page variants
4. Generates and translates static image ads via AI
5. Pushes assembled campaigns to Meta Ads Manager
6. Swipes competitor pages — rewrites copy for our products using Claude AI

## The Golden Vision (automation loop)

Ad Spy → AI generates concept ideas → owner approves → static ads generated → landing page auto-recommended → WhatsApp notification → owner approves → auto-scheduled to Meta. Daily performance briefs with AI insights.

## Core Workflows

### Static Ad Generation Pipeline
1. **Brainstorm** (`/api/brainstorm`) — Claude generates concept proposals using CASH framework
2. **Approve concept** — User picks proposals, creates image jobs with CASH DNA (angle, hook, awareness level)
3. **Generate static ads** (`/api/image-jobs/[id]/generate-static`) — Claude writes image briefs per style → Kie AI (nano-banana-2) generates images
4. **Translate** — Kie AI translates text in images to target languages with quality analysis
5. **Push to Meta** (`/api/image-jobs/[id]/push-to-meta`) — Duplicates template ad sets, uploads images, creates ads

### Page Workflow
1. **Import** — Fetch URL (Puppeteer) or upload HTML
2. **Edit** — Iframe-based WYSIWYG with inline editing
3. **Translate** — GPT translates text, Kie AI translates images
4. **Publish** — Deploy to Cloudflare Pages (direct upload API)

## Key External Services

| Service | Purpose | Auth |
|---------|---------|------|
| Supabase | Database + Storage | Service role key (PostgREST), Management API for DDL |
| Vercel | App hosting | Auto-deploy on push to main |
| Cloudflare Pages | Landing page hosting | API token, direct upload |
| Meta Marketing API | Ad campaigns | System User token |
| Kie AI | Image generation/translation | API key, nano-banana-2 model |
| Anthropic Claude | Copywriting, brainstorming, briefs | API key, claude-sonnet-4-5 |
| OpenAI | Text translation, quality analysis | API key, gpt-5.2 |
| Google Drive | Import/export images | Service account |
| Hostinger | DNS management | API token |

## Current State

Check recent changes:
!`cd "/Users/williamhedin/Claude Code/content-hub" && git log --oneline -10 2>/dev/null || echo "Not a git repo or no commits"`

Running processes:
!`lsof -i :3000 2>/dev/null | head -5 || echo "No dev server running"`
