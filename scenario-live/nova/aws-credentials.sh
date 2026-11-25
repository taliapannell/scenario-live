#!/bin/bash
# Refreshes Bedrock role credentials and writes them to .env.
# Run this when Nova shows "security token expired".
# If it fails, run `aws login` first, then re-run this script.

set -e

ROLE_ARN="arn:aws:iam::224861043871:role/scenario-live-bedrock-role"
ENV_FILE="$(dirname "$0")/.env"

echo "Assuming $ROLE_ARN..."

read -r KEY SECRET TOKEN < <(aws sts assume-role \
  --role-arn "$ROLE_ARN" \
  --role-session-name nova-kiosk \
  --duration-seconds 3600 \
  --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \
  --output text)

cat > "$ENV_FILE" <<EOF
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCESS_KEY_ID=$KEY
VITE_AWS_SECRET_ACCESS_KEY=$SECRET
VITE_AWS_SESSION_TOKEN=$TOKEN
EOF

echo "✅ .env updated — restart Vite (Ctrl+C → npm run dev)"
