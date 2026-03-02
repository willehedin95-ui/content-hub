# Pipeline — Automated Concept Generation

## Overview

The Pipeline is an AI-powered workflow for generating, reviewing, and launching ad concepts. It helps you systematically test different angles, awareness levels, and markets to find winning ads faster.

## Key Features

### 1. Coverage Matrix
Visual grid showing which product × market × awareness combinations you've tested. Helps identify gaps in your testing strategy.

**What it shows:**
- Markets (NO, DK) on rows
- Awareness levels (Unaware, Problem Aware, Solution Aware, Product Aware) on columns
- Color-coded cells showing how many concepts you've tested for each combination

**Color coding:**
- 🔴 Red (0 concepts): Critical gap — test this first
- 🟡 Yellow (1-2 concepts): Low coverage — needs more testing
- 🟢 Green (3+ concepts): Good coverage

### 2. AI Concept Generation
Claude generates complete ad concepts including:
- Headline and ad copy variations
- Strategic hypothesis explaining why it might work
- CASH DNA (Concept, Angle, Style, Hooks) classification
- Target awareness level
- Market-specific considerations

**Generation Modes:**
- **Matrix Mode** — Automatically fills coverage gaps by targeting untested combinations
- **From Template** — Uses proven ad structures as inspiration (coming soon)

### 3. Two-Stage Workflow
The pipeline separates ideation from execution:

**Stage 1: Review Concepts** — Approve or reject concept ideas before spending time on images
- Fast iteration (30-60 seconds to generate 3 concepts)
- Review strategic thinking before committing resources
- Reject weak ideas early

**Stage 2: Generate Images** — Approved concepts get 8 style variations generated
- Takes 2-3 minutes per concept
- Creates complete image job with all variations
- Ready to push to Meta Ads

### 4. Real-Time Notifications
Stay informed without constantly checking:

- **Telegram** — Get notified when concepts are ready for review
- **In-App Badge** — Sidebar badge shows concepts needing attention
- **Deep Links** — Notifications link directly to the concept

## How to Use

### Generating Concepts

1. Navigate to `/pipeline`
2. Click "Generate Concepts"
3. Choose settings:
   - **Count**: How many concepts (3-10 recommended)
   - **Mode**:
     - Matrix (fills coverage gaps) — recommended for systematic testing
     - From Template (uses proven ad structures) — coming soon
   - **Product**: HappySleep or Hydro13
   - **Markets**: NO, DK (or both)
4. Click "Generate"
5. Wait 30-60 seconds for Claude to generate concepts

**What happens behind the scenes:**
- Claude analyzes your coverage matrix
- Identifies gaps in your testing
- Generates concepts targeting those gaps
- Saves concepts with status "pending_review"
- Sends Telegram notification (if configured)

### Reviewing Concepts

When concepts are ready:

1. Check Telegram notification or badge count
2. Go to `/pipeline`
3. Review each concept in "To Review" section:
   - Read headline and primary copy
   - Expand to see full hypothesis
   - Consider: Does this angle make sense for the market?
   - Check awareness level and CASH DNA classification
4. Click "Approve & Generate Images" or "Reject"

**Tips for reviewing:**
- Read the hypothesis — it explains the strategic thinking
- Look for variety in awareness levels and angles
- Reject concepts that feel too similar to existing ones
- Approve concepts that test new hypotheses

### After Approval

Approved concepts automatically:
1. Create an image job
2. Generate 8 style variations (takes 2-3 minutes)
3. Move to "Generating Images" section during generation
4. Move to "To Schedule" section when complete
5. Send Telegram notification when images are ready

From the "To Schedule" section, you can:
- Assign a landing page (optional)
- Push directly to Meta Ads
- Monitor performance in the Analytics section

## Environment Variables

### Required
- `ANTHROPIC_API_KEY` — For concept generation
  - Get from: https://console.anthropic.com/
  - Format: `sk-ant-...`

### Optional (but recommended)
- `TELEGRAM_BOT_TOKEN` — For Telegram notifications
  - Get from: @BotFather on Telegram
  - Format: `123456:ABC-DEF...`
- `TELEGRAM_CHAT_ID` — Your Telegram chat ID
  - Get from: @userinfobot on Telegram
  - Format: `123456789`
- `NEXT_PUBLIC_APP_URL` — For notification links
  - Defaults to `http://localhost:3000` in development
  - Set to your production URL in deployment

## Coverage Matrix Strategy

The Coverage Matrix is your strategic testing framework. It ensures you're systematically testing all audience segments.

### Understanding the Matrix

**Rows (Markets):**
- NO (Norway)
- DK (Denmark)

**Columns (Awareness Levels):**
1. **Unaware** — Don't know they have the problem
   - Example: "Why successful people sleep 8 hours"
2. **Problem Aware** — Know they have a problem, don't know solutions exist
   - Example: "Struggling with sleep? You're not alone"
3. **Solution Aware** — Know solutions exist, don't know your product
   - Example: "Weighted blankets vs sleep aids: what works?"
4. **Product Aware** — Know your product, need reason to buy
   - Example: "HappySleep: 60-night trial, free returns"

### Best Practices

1. **Fill red cells first** — Critical gaps in your testing
2. **Then yellow cells** — Low coverage areas
3. **Maintain green cells** — Keep testing what works
4. **Test systematically** — Don't skip awareness levels

### Using the Suggestions

Below the matrix, you'll see AI-generated suggestions like:
- "Critical gap: NO market, Unaware level (0 concepts)"
- "Test more: DK market, Solution Aware (1 concept)"

**Click a suggestion** to auto-configure the concept generator with optimal settings for that gap.

## Tips for Success

### 1. Read the Hypothesis
Every concept includes a strategic hypothesis explaining:
- Why this angle might work
- What psychological trigger it uses
- How it addresses the awareness level

If the hypothesis doesn't make sense, reject the concept.

### 2. Test Diverse Angles
Don't approve 5 similar concepts. Look for variety in:
- Awareness levels (test all 4)
- Angles (different entry points)
- Hooks (varied opening lines)
- Styles (different tones)

### 3. Fill Gaps First
Use Matrix mode to systematically test what you haven't tried yet. The AI will automatically target untested combinations.

### 4. Review Within 24h
Fresh concepts perform better. Don't let them sit too long — review and approve within a day of generation.

### 5. Track What Works
As you launch concepts:
- Monitor which awareness levels perform best
- Note which angles resonate in each market
- Use this data to refine future concept generation

### 6. Start Small
Generate 3 concepts at a time. Review them carefully. Once you're comfortable with the quality, increase to 5-10.

## Workflow Integration

The Pipeline integrates with other Content Hub features:

### Image Jobs
Approved concepts create image jobs at `/images/[id]` where you can:
- Preview all 8 style variations
- Edit copy or regenerate styles
- Download assets

### Meta Ads
From the concept or image job, push directly to Meta Ads:
- Auto-creates ad sets per market
- Uploads images in 1:1 ratio
- Creates ads with your copy
- Disables auto-cropping for Stories/Reels

### Landing Pages
Assign landing pages from the `/pages` directory:
- Product pages
- Landing pages optimized for specific angles
- AB test variants

## Troubleshooting

### No concepts generated

**Symptoms:**
- Generate button clicked, but no concepts appear
- No Telegram notification received

**Solutions:**
- Check ANTHROPIC_API_KEY is set correctly in `.env.local`
- Check browser console for errors
- Verify API logs: `npm run dev` output
- Try generating with fewer concepts (3 instead of 10)

### Images not generating

**Symptoms:**
- Concept approved, but stuck in "Generating Images"
- Status never updates to "images_complete"

**Solutions:**
- Check image generation service is running
- Verify image job exists at `/images`
- Check image job status and error logs
- Retry from the image job page if needed

### No Telegram notifications

**Symptoms:**
- Concepts generated, but no notification received

**Solutions:**
- Verify TELEGRAM_BOT_TOKEN is set correctly
- Verify TELEGRAM_CHAT_ID is set correctly
- Check notification logs in database: `pipeline_notifications` table
- Test Telegram bot is responding: send it a message
- Verify bot has permission to message you (start a chat first)

### Coverage matrix not updating

**Symptoms:**
- Generated concepts, but matrix shows old data

**Solutions:**
- Matrix caches for 1 hour by default
- Creating new concepts invalidates cache automatically
- Force refresh by reloading page
- Check `coverage_matrix_cache` table for cache status

### Badge count incorrect

**Symptoms:**
- Badge shows wrong number or doesn't update

**Solutions:**
- Badge counts concepts with status "pending_review"
- Refresh page to update count
- Check concept statuses in database
- Verify concepts aren't stuck in generating state

## Performance Expectations

### Concept Generation
- **3 concepts**: 30-60 seconds
- **5 concepts**: 45-90 seconds
- **10 concepts**: 90-180 seconds

Time varies based on:
- Claude API response time
- Complexity of requirements
- Market/awareness combination

### Image Generation
- **Per concept**: 2-3 minutes
- **8 style variations** generated in parallel
- Uses nano-banana-2 model at 1K resolution

### Coverage Matrix
- **Initial load**: <500ms (from cache)
- **After new concepts**: <1 second (cache invalidated)
- **Cache duration**: 1 hour

## Future Enhancements

Coming soon to the Pipeline:

1. **Template Mode** — Generate concepts based on proven ad structures
2. **Performance Feedback Loop** — AI learns from your top-performing concepts
3. **Auto-Scheduling** — Optimal publish times based on historical data
4. **AB Test Recommendations** — AI suggests which concepts to test against each other
5. **Multi-Language Expansion** — Support for SE market and additional languages
6. **Concept Scoring** — Predictive quality scores before approval
7. **Batch Operations** — Approve/reject multiple concepts at once

## Support

For issues or questions:
- Check this documentation first
- Review the testing checklist in `pipeline-testing.md`
- Check browser console and server logs
- Verify environment variables are set correctly
