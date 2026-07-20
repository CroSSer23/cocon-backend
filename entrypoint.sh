#!/bin/sh
set -e

# Generate a throwaway Firebase service-account file at runtime (kept out of git so
# secret-scanners don't flag it). Only used by chat/push screens, which are disabled
# in this reconstructed demo anyway.
FB_FILE="${FIREBASE_CONFIG_FILE:-/app/firebase-dummy.json}"
if [ ! -f "$FB_FILE" ]; then
  cat > "$FB_FILE" <<'JSON'
{"type":"service_account","project_id":"cocon-demo","private_key_id":"x","private_key":"-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n","client_email":"cocon-demo@cocon-demo.iam.gserviceaccount.com","client_id":"0","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token"}
JSON
fi

echo "[entrypoint] seeding database (schema + admin)..."
node seed.js || echo "[entrypoint] seed step reported an error; continuing to start API"

echo "[entrypoint] starting serverless-offline on 0.0.0.0:3000 ..."
exec npx serverless offline start --host 0.0.0.0 --httpPort 3000 --stage development
