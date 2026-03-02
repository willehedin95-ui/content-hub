# Deployment Error Troubleshooting Guide

## Current Situation

- ✅ Local build: **PASSING** (all 92 routes compiled successfully)
- ❌ Vercel deployment: **FAILED**
- 📦 Latest commit: `d5f6c1c` (pipeline feature documentation)

## Most Likely Cause: Missing Environment Variables

The pipeline feature requires these **critical environment variables** in Vercel:

### Required for Pipeline Feature
- `ANTHROPIC_API_KEY` - Claude concept generation
- `TELEGRAM_BOT_TOKEN` - Notifications when concepts are ready
- `NEXT_PUBLIC_SUPABASE_URL` - Database connection
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Database client auth
- `SUPABASE_SERVICE_ROLE_KEY` - Database admin operations

### Required for Existing Features
- `META_SYSTEM_USER_TOKEN` - Meta Ads integration
- `META_AD_ACCOUNT_ID` - Meta account
- `META_PAGE_ID` - Meta page
- `OPENAI_API_KEY` - Image generation
- `CF_PAGES_ACCOUNT_ID` - Cloudflare Pages
- `CF_PAGES_API_TOKEN` - Cloudflare API
- `APIFY_TOKEN` - Ad Spy scraper
- All other variables from `.env.local`

## How to Fix

### Option 1: Use Vercel Dashboard (Quick)

1. Go to: https://vercel.com/willehedin95-7687/content-hub/settings/environment-variables
2. Click "Add New" for each missing variable
3. For each variable:
   - **Key**: Variable name (e.g., `ANTHROPIC_API_KEY`)
   - **Value**: Copy from `.env.local` file
   - **Environments**: Select all (Production, Preview, Development)
4. After adding all variables, go to **Deployments** tab
5. Click the failed deployment
6. Click "Redeploy" button

### Option 2: Use Vercel CLI (Automated)

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Link project (if not already)
cd /Users/williamhedin/Claude\ Code/content-hub
vercel link

# Add environment variables from .env.local
# You'll need to add each one manually or use the API
vercel env add ANTHROPIC_API_KEY production
# Paste the value when prompted

# Or redeploy
vercel --prod
```

### Option 3: Use API Script (With Token)

```bash
# Get a Vercel API token from: https://vercel.com/account/tokens
# Then run:
./scripts/sync-vercel-env.sh <YOUR_VERCEL_TOKEN>
```

## Check Deployment Details

Click "See deployment details" link in the Vercel error message to see the exact error. Common errors:

1. **`MODULE_NOT_FOUND`** → Missing dependency (check package.json)
2. **`FUNCTION_INVOCATION_TIMEOUT`** → Increase timeout in vercel.json
3. **`OUT_OF_MEMORY`** → Upgrade Vercel plan or optimize build
4. **`TypeError: Cannot read property...`** → Missing environment variable

## Verify Fix

Once environment variables are added:

1. Vercel will automatically redeploy
2. Check deployment status: https://vercel.com/willehedin95-7687/content-hub
3. Visit: https://content-hub-nine-theta.vercel.app/pipeline
4. Should redirect to `/auth/login` (expected behavior)

## Quick Test Locally

The pipeline feature is working locally:
```bash
cd /Users/williamhedin/Claude\ Code/content-hub
npm run dev
# Visit: http://localhost:3000/pipeline
```
