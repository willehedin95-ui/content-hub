# Content Hub — Setup Guide

## 1. Install dependencies

```bash
cd content-hub
npm install
```

## 2. Set up Supabase (free database)

1. Go to [supabase.com](https://supabase.com) → Create a new project
2. Go to **SQL Editor** and run this:

```sql
CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  product TEXT NOT NULL,
  page_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  original_html TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  translated_html TEXT,
  seo_title TEXT,
  seo_description TEXT,
  status TEXT DEFAULT 'draft',
  published_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_id, language)
);
```

3. Go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

## 3. Set up Netlify sites

1. Go to [netlify.com](https://netlify.com) → Add new site → Deploy manually (drag any empty folder)
2. Create **two sites**: one for Swedish (blog.halsobladet.com) and one for Danish (smarthelse.dk)
3. Attach your custom domains: Site settings → Domain management → Add custom domain
4. Copy each **Site ID** from: Site settings → General → Site details

Get your **API token**: User avatar → User settings → Applications → New access token

## 4. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local` with your keys from steps 2 and 3.

## 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 6. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → Add New Project → Import from GitHub
   (push this folder to a private GitHub repo first)
2. Add all environment variables from `.env.local` in Vercel's project settings
3. Deploy — your dashboard will be live at a `.vercel.app` URL

## Daily workflow

1. Ron sends you a Lovable URL
2. Click **Import New Page** → paste URL → fill in details
3. On the page detail screen, click **Translate** for each language
4. Review the SEO title preview, then click **Publish**
5. Page is live on the country domain ✓
