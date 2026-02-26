#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="supabase/functions/.env"
PORT=54321
WEBHOOK_PATH="/functions/v1/telegram-webhook"

# 1. Read TELEGRAM_BOT_TOKEN from .env
BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" | cut -d'=' -f2-)
if [[ -z "$BOT_TOKEN" ]]; then
  echo "Error: TELEGRAM_BOT_TOKEN not found in $ENV_FILE"
  exit 1
fi
echo "Bot token loaded."

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
curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${WEBHOOK_URL}" | jq .

echo ""
echo "ngrok running (PID $NGROK_PID). Press Ctrl+C to stop."
trap "kill $NGROK_PID 2>/dev/null; exit" INT TERM
wait "$NGROK_PID"
