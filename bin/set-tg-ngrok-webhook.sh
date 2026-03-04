#!/usr/bin/env bash
set -euo pipefail

PORT=54321
WEBHOOK_PATH="/functions/v1/telegram-webhook"

# 1. Load environment variables from .env
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
load_env "supabase/functions/.env.local"

# 2. Start ngrok in background
echo "Starting ngrok on port $PORT..."
ngrok http "$PORT" > /dev/null 2>&1 &
NGROK_PID=$!

# Wait for ngrok to be ready
for i in {1..20}; do
  if curl -s http://localhost:4040/api/tunnels > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

# 3. Extract public URL
PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url')
if [[ -z "$PUBLIC_URL" || "$PUBLIC_URL" == "null" ]]; then
  echo "Error: Could not get ngrok public URL"
  kill "$NGROK_PID" 2>/dev/null
  exit 1
fi
echo "Ngrok URL: $PUBLIC_URL"

# 4. Set Telegram webhook
WEBHOOK_URL="${PUBLIC_URL}${WEBHOOK_PATH}"
echo "Setting webhook to: $WEBHOOK_URL"
WEBHOOK_ARGS="url=${WEBHOOK_URL}"
if [[ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  WEBHOOK_ARGS+="&secret_token=${TELEGRAM_WEBHOOK_SECRET}"
  echo "Using secret_token for webhook"
fi
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "${WEBHOOK_ARGS}" | jq .

echo ""
echo "ngrok running (PID $NGROK_PID). Press Ctrl+C to stop."
trap "kill $NGROK_PID 2>/dev/null; exit" INT TERM
wait "$NGROK_PID"
