#!/usr/bin/env bash
set -euo pipefail

WEBHOOK_PATH="/functions/v1/telegram-webhook"

# ── Load environment variables from .env ─────────────────────────────────────
function load_env() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    set -o allexport
    source "$env_file"
    set +o allexport
    echo "Environment variables loaded from $env_file"
  fi
}

load_env "supabase/functions/.env"

# ── Validate required env vars ───────────────────────────────────────────────
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "Error: TELEGRAM_BOT_TOKEN is not set"
  exit 1
fi

# ── Fetch Supabase projects ─────────────────────────────────────────────────
echo "Fetching Supabase projects..."
PROJECTS_JSON=$(supabase projects list --output json 2>&1) || {
  echo "Error: Failed to fetch Supabase projects."
  echo "$PROJECTS_JSON"
  exit 1
}

PROJECT_COUNT=$(echo "$PROJECTS_JSON" | jq 'length')
if [[ "$PROJECT_COUNT" -eq 0 ]]; then
  echo "Error: No Supabase projects found."
  exit 1
fi

# ── Display project list ────────────────────────────────────────────────────
echo ""
echo "Available Supabase projects:"
echo ""
for i in $(seq 0 $((PROJECT_COUNT - 1))); do
  NAME=$(echo "$PROJECTS_JSON" | jq -r ".[$i].name")
  REF=$(echo "$PROJECTS_JSON" | jq -r ".[$i].ref")
  REGION=$(echo "$PROJECTS_JSON" | jq -r ".[$i].region")
  STATUS=$(echo "$PROJECTS_JSON" | jq -r ".[$i].status")
  LINKED=$(echo "$PROJECTS_JSON" | jq -r ".[$i].linked")
  SUFFIX=""
  if [[ "$LINKED" == "true" ]]; then
    SUFFIX=" (linked)"
  fi
  echo "  $((i + 1))) $NAME [$REF] — $REGION — $STATUS$SUFFIX"
done

# ── Detect linked project ────────────────────────────────────────────────────
LINKED_INDEX=""
for i in $(seq 0 $((PROJECT_COUNT - 1))); do
  if [[ $(echo "$PROJECTS_JSON" | jq -r ".[$i].linked") == "true" ]]; then
    LINKED_INDEX=$i
    break
  fi
done

# ── Prompt user to select a project ─────────────────────────────────────────
echo ""
if [[ -n "$LINKED_INDEX" ]]; then
  DEFAULT_NUM=$((LINKED_INDEX + 1))
  read -rp "Select project [1-$PROJECT_COUNT] (default: $DEFAULT_NUM): " SELECTION
  if [[ -z "$SELECTION" ]]; then
    SELECTION=$DEFAULT_NUM
  fi
else
  read -rp "Select project [1-$PROJECT_COUNT]: " SELECTION
fi

if ! [[ "$SELECTION" =~ ^[0-9]+$ ]] || [[ "$SELECTION" -lt 1 ]] || [[ "$SELECTION" -gt "$PROJECT_COUNT" ]]; then
  echo "Error: Invalid selection."
  exit 1
fi

INDEX=$((SELECTION - 1))
PROJECT_REF=$(echo "$PROJECTS_JSON" | jq -r ".[$INDEX].ref")
PROJECT_NAME=$(echo "$PROJECTS_JSON" | jq -r ".[$INDEX].name")

echo ""
echo "Selected: $PROJECT_NAME [$PROJECT_REF]"

# ── Set Telegram webhook ────────────────────────────────────────────────────
WEBHOOK_URL="https://${PROJECT_REF}.supabase.co${WEBHOOK_PATH}"
echo "Setting webhook to: $WEBHOOK_URL"

WEBHOOK_ARGS="url=${WEBHOOK_URL}"
if [[ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  WEBHOOK_ARGS+="&secret_token=${TELEGRAM_WEBHOOK_SECRET}"
  echo "Using secret_token for webhook"
fi

TG_API_URL="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
if [[ "${TELEGRAM_ENVIRONMENT:-}" == "test" ]]; then
  TG_API_URL+="/test"
  echo "Using Telegram test environment"
fi
curl -s -X POST "${TG_API_URL}/setWebhook" \
  -d "${WEBHOOK_ARGS}" | jq .
