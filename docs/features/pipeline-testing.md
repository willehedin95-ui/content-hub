# Pipeline Testing Checklist

## Prerequisites
- ANTHROPIC_API_KEY configured
- TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID configured (optional)
- NEXT_PUBLIC_APP_URL set correctly

## E2E Test Flow

### 1. Navigate to Pipeline
- Go to `/pipeline`
- Verify Coverage Matrix loads
- Verify empty state shows if no concepts

### 2. Generate Concepts (requires API key)
- Click "Generate Concepts" button
- Select: 3 concepts, Matrix mode, HappySleep, NO+DK markets
- Click Generate
- Wait for concepts to appear in "To Review" section
- Verify Telegram notification received (if configured)

### 3. Approve Concept
- Click "Approve & Generate Images" on a concept
- Verify concept moves to "Generating Images" section
- Wait for images to complete
- Verify concept status updates to "images_complete"

### 4. Verify Badge
- Check sidebar shows badge count
- Approve concepts and verify badge count decreases

### 5. Coverage Matrix
- Verify matrix updates after concepts are generated
- Verify gap indicators are correct
- Verify suggestions list updates

## API Endpoints to Test

### Coverage API
```bash
GET /api/pipeline/coverage?product=happysleep
```
Expected: Returns matrix data with counts per market/awareness combination

### Generate Concepts
```bash
POST /api/pipeline/generate
Body: {
  "count": 3,
  "mode": "matrix",
  "product": "happysleep",
  "markets": ["NO", "DK"]
}
```
Expected: Returns concept IDs and triggers Telegram notification

### List Concepts
```bash
GET /api/pipeline/concepts?status=pending_review
```
Expected: Returns concepts awaiting review

### Get Concept Details
```bash
GET /api/pipeline/concepts/[id]
```
Expected: Returns full concept with all metadata

### Approve Concept
```bash
POST /api/pipeline/concepts/[id]/approve
Body: { "landingPageId": "optional-uuid" }
```
Expected: Creates image job and updates status

### Badge Count
```bash
GET /api/pipeline/badge-count
```
Expected: Returns count of concepts pending review

## Known Limitations

- Telegram notifications require env vars
- Concept generation requires ANTHROPIC_API_KEY
- Image generation takes 2-3 minutes per concept
- Coverage matrix caches for 1 hour (or until new concepts created)

## Static Analysis Verification

### Build Checks
✅ All API routes compile without errors
✅ All UI components compile without errors
✅ No circular dependencies detected
✅ TypeScript types are valid
✅ No critical import errors

### Database Schema
Verify these tables exist:
- `pipeline_concepts` (stores generated concepts)
- `pipeline_notifications` (tracks notification delivery)
- `coverage_matrix_cache` (caches matrix calculations)

### Environment Variables
Optional but recommended:
```env
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Performance Expectations

- **Concept generation**: 30-60 seconds for 3 concepts
- **Image generation**: 2-3 minutes per concept (8 style variations)
- **Coverage matrix load**: <500ms (from cache)
- **Badge count check**: <100ms

## Error Scenarios to Test

1. **Missing API key**: Verify graceful error message
2. **Network timeout**: Verify retry mechanism works
3. **Invalid concept data**: Verify validation errors
4. **Image job failure**: Verify status updates correctly
5. **Telegram notification failure**: Verify logged but doesn't block

## Success Criteria

- ✅ Concepts generate successfully
- ✅ Coverage matrix updates in real-time
- ✅ Badge count reflects pending items
- ✅ Telegram notifications delivered (if configured)
- ✅ Image jobs created after approval
- ✅ No console errors during normal flow
