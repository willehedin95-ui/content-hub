# Meta Compliance Check — Design

## Problem
Ads get rejected by Meta, risking account bans. Previous ChatGPT-based compliance checking was too strict — flagged everything as potentially violating. Need a realistic checker that catches actual violations without over-flagging.

## Solution
AI-powered advisory compliance check on the Preview & Push tab. Analyzes both ad copy text (via Claude) and static ad images (via GPT-4o vision) against Meta's advertising policies, with specific calibration for health/wellness/supplement ads.

## Key Design Decisions
- **Advisory, not blocking** — shows warnings but never prevents publishing
- **Text + images** — Claude checks copy, GPT-4o vision checks images
- **Calibrated for realism** — prompt includes compliant examples, biased toward PASS
- **Three-tier severity** — PASS / WARNING / REJECT with specific rule citations

## Architecture

### New files
- `src/lib/meta-compliance.ts` — core compliance analysis (Claude for text, GPT-4o for images)
- `src/app/api/image-jobs/[id]/compliance-check/route.ts` — API route
- `src/components/images/ComplianceCheck.tsx` — UI component for Preview & Push tab

### Data flow
1. User clicks "Run Compliance Check" on Preview & Push tab
2. Frontend calls `POST /api/image-jobs/[id]/compliance-check`
3. API route loads concept's ad copy (primary texts + headlines) and image URLs
4. Runs in parallel:
   - Claude analyzes all text variants against compliance rules
   - GPT-4o vision analyzes each 1:1 image
5. Returns structured result, logged to `usage_logs`
6. UI shows per-item PASS/WARNING/REJECT with details
7. Readiness checklist shows compliance status (but doesn't block push)

### Compliance result structure
```typescript
interface ComplianceResult {
  overall_verdict: "PASS" | "WARNING" | "REJECT";
  text_results: ComplianceTextResult[];
  image_results: ComplianceImageResult[];
  summary: string;
  checked_at: string;
}

interface ComplianceTextResult {
  text: string;
  type: "primary" | "headline";
  verdict: "PASS" | "WARNING" | "REJECT";
  issues: ComplianceIssue[];
}

interface ComplianceImageResult {
  image_url: string;
  verdict: "PASS" | "WARNING";
  issues: ComplianceIssue[];
}

interface ComplianceIssue {
  rule: string;        // e.g. "Personal Attributes"
  detail: string;      // what specifically triggered it
  suggestion?: string; // how to fix it (text only)
}
```

### Prompt calibration strategy (anti-over-strictness)
1. Embed ~20 "you CAN say this" examples from compliance docs
2. Set industry context: health/wellness supplements, Scandinavian markets
3. Explicit instruction: "Only flag what you're confident would trigger Meta's automated review. When in doubt, PASS."
4. Three-tier system prevents binary thinking — WARNING is the middle ground
5. Rules ranked by actual rejection risk (personal attributes = high, borderline phrasing = low)

### Compliance rules embedded in prompt
From Stefan's PDF + CopyCoders transcripts:
1. **Personal Attributes** — no "your" + body condition/health state
2. **Negative Self-Imagery** — no shaming, fear-based body language
3. **False Promises** — no "will cure/fix", use "can help support"
4. **Before/After** — no side-by-side comparisons in images
5. **FTC Weight Loss Red Flags** — no unrealistic timeframes or guarantees
6. **Testimonial Rules** — must reflect typical experience, disclose conditions
7. **Image Rules** — no scales/tape measures as focal point, no sad "before" state, no excessive skin

### Storage
- Result stored on `image_jobs.compliance_result` (JSONB column)
- Persists across sessions so you don't re-run unnecessarily
- Invalidated when ad copy or images change

### Cost
- ~$0.02-0.05 per check (Claude text + GPT-4o vision)
- Logged to `usage_logs` with `type: "compliance_check"`

## UI placement
On MetaAdPreview.tsx, between the ad preview mockup and the readiness checklist:
- "Run Compliance Check" button
- Expandable results panel showing per-item verdicts
- Compliance status in readiness checklist (advisory only)
- Results persist — shows "Last checked: X minutes ago" with re-run option
