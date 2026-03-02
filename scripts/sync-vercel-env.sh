#!/bin/bash
# Sync environment variables from .env.local to Vercel
# Usage: ./scripts/sync-vercel-env.sh [VERCEL_TOKEN]

set -e

PROJECT_ID="prj_cVuvFPwB69wLAq07a0cZ1g44EVwO"
TEAM_ID="team_4bxkDOt3vGRX8rlUanMlXBhp"

if [ -z "$1" ]; then
  echo "❌ Error: Vercel token required"
  echo "Usage: $0 <VERCEL_TOKEN>"
  echo ""
  echo "Get your token from: https://vercel.com/account/tokens"
  exit 1
fi

VERCEL_TOKEN="$1"

echo "🔍 Checking current Vercel environment variables..."

# Get current env vars
CURRENT_VARS=$(curl -s "https://api.vercel.com/v9/projects/$PROJECT_ID/env?teamId=$TEAM_ID" \
  -H "Authorization: Bearer $VERCEL_TOKEN" | jq -r '.envs[].key' 2>/dev/null)

if [ -z "$CURRENT_VARS" ]; then
  echo "❌ Failed to fetch current variables. Check your token and permissions."
  exit 1
fi

echo "✅ Current variables in Vercel:"
echo "$CURRENT_VARS" | sort

echo ""
echo "📋 Critical variables for pipeline feature:"
echo "  - ANTHROPIC_API_KEY"
echo "  - TELEGRAM_BOT_TOKEN"
echo "  - NEXT_PUBLIC_SUPABASE_URL"
echo "  - NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "  - SUPABASE_SERVICE_ROLE_KEY"

echo ""
echo "🔧 To add missing variables, use:"
echo "curl -X POST 'https://api.vercel.com/v10/projects/$PROJECT_ID/env' \\"
echo "  -H 'Authorization: Bearer <TOKEN>' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"key\": \"VAR_NAME\", \"value\": \"VAR_VALUE\", \"type\": \"encrypted\", \"target\": [\"production\", \"preview\", \"development\"]}'"
