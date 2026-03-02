#!/bin/bash
# Automatically sync all environment variables from .env.local to Vercel
# Usage: ./scripts/deploy-fix-env-vars.sh <VERCEL_TOKEN>

set -e

PROJECT_ID="prj_cVuvFPwB69wLAq07a0cZ1g44EVwO"
TEAM_ID="team_4bxkDOt3vGRX8rlUanMlXBhp"
ENV_FILE=".env.local"

if [ -z "$1" ]; then
  echo "❌ Error: Vercel token required"
  echo ""
  echo "Usage: $0 <VERCEL_TOKEN>"
  echo ""
  echo "Steps:"
  echo "1. Go to: https://vercel.com/account/tokens"
  echo "2. Create a new token with 'Full Account' scope"
  echo "3. Run: ./scripts/deploy-fix-env-vars.sh <token>"
  exit 1
fi

VERCEL_TOKEN="$1"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: $ENV_FILE not found"
  exit 1
fi

echo "🚀 Syncing environment variables to Vercel..."
echo ""

# Critical variables that MUST be set for the app to work
CRITICAL_VARS=(
  "ANTHROPIC_API_KEY"
  "TELEGRAM_BOT_TOKEN"
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
  "META_SYSTEM_USER_TOKEN"
  "META_AD_ACCOUNT_ID"
  "META_PAGE_ID"
  "OPENAI_API_KEY"
  "CF_PAGES_ACCOUNT_ID"
  "CF_PAGES_API_TOKEN"
  "APIFY_TOKEN"
)

# Function to add/update env var in Vercel
add_env_var() {
  local key="$1"
  local value="$2"

  # Check if variable exists
  EXISTING=$(curl -s "https://api.vercel.com/v9/projects/$PROJECT_ID/env?teamId=$TEAM_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN" | \
    jq -r ".envs[] | select(.key == \"$key\") | .id" 2>/dev/null)

  if [ -n "$EXISTING" ]; then
    echo "  ⚠️  $key already exists (id: ${EXISTING:0:8}...) - skipping"
    return
  fi

  # Add new variable
  RESPONSE=$(curl -s -X POST "https://api.vercel.com/v10/projects/$PROJECT_ID/env?teamId=$TEAM_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"key\": \"$key\",
      \"value\": \"$value\",
      \"type\": \"encrypted\",
      \"target\": [\"production\", \"preview\", \"development\"]
    }")

  if echo "$RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
    ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error.message')
    echo "  ❌ $key - ERROR: $ERROR_MSG"
  else
    echo "  ✅ $key - added successfully"
  fi
}

# Read .env.local and process critical variables
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ "$key" =~ ^#.*$ ]] && continue
  [[ -z "$key" ]] && continue

  # Check if this is a critical variable
  for critical in "${CRITICAL_VARS[@]}"; do
    if [ "$key" = "$critical" ]; then
      # Remove quotes from value if present
      value="${value%\"}"
      value="${value#\"}"

      # Handle multiline values (like private keys)
      if [[ "$value" == *"-----BEGIN"* ]]; then
        # Read until we find the END marker
        full_value="$value"
        while IFS= read -r line && [[ "$line" != *"-----END"* ]]; do
          full_value="$full_value"$'\n'"$line"
        done
        full_value="$full_value"$'\n'"$line"
        value="$full_value"
      fi

      add_env_var "$key" "$value"
      break
    fi
  done
done < "$ENV_FILE"

echo ""
echo "✅ Environment variable sync complete!"
echo ""
echo "Next steps:"
echo "1. Go to: https://vercel.com/willehedin95-7687/content-hub/deployments"
echo "2. Find the failed deployment"
echo "3. Click 'Redeploy' to trigger a new deployment with the new env vars"
echo ""
echo "Or trigger automatic redeploy:"
echo "  git commit --allow-empty -m 'chore: trigger redeploy'"
echo "  git push origin main"
