#!/usr/bin/env bash
# Push the runtime config EAS cloud builds need into the project's EAS
# environment variables (production environment).
#
# Why: app.config.ts reads Supabase/Sentry values from .env at config time,
# and .env is gitignored, so an EAS build never sees it. Without these, the
# TestFlight build boots with no backend. Run once, and again whenever a
# value in .env changes. Requires `npx eas-cli login` first.
#
# Usage: bash scripts/eas-env-sync.sh [environment]   (default: production)
set -euo pipefail
cd "$(dirname "$0")/.."

ENVIRONMENT="${1:-production}"

env_val() {
  local name="$1" v
  v="${!name:-}"
  [[ -n $v ]] && { printf '%s' "$v"; return; }
  for f in .env .env.local; do
    [[ -f $f ]] || continue
    v="$(grep -E "^${name}=" "$f" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
    [[ -n $v ]] && { printf '%s' "$v"; return; }
  done
}

# name:visibility — plaintext (readable in the dashboard), sensitive (hidden,
# still readable by the build), secret (write-only).
VARS=(
  EXPO_PUBLIC_SUPABASE_URL:plaintext
  EXPO_PUBLIC_SUPABASE_ANON_KEY:sensitive
  EXPO_PUBLIC_SENTRY_DSN:plaintext
  SENTRY_ORG:plaintext
  SENTRY_PROJECT:plaintext
  SENTRY_AUTH_TOKEN:secret
)

# Sentry's Xcode phase fails a release build when no auth token is available
# unless uploads are explicitly disabled (same guard as build-ipa.sh).
if [[ -z "$(env_val SENTRY_AUTH_TOKEN)" ]]; then
  echo "push  SENTRY_DISABLE_AUTO_UPLOAD=true (no SENTRY_AUTH_TOKEN in .env)"
  npx -y eas-cli@latest env:create \
    --scope project --environment "$ENVIRONMENT" \
    --name SENTRY_DISABLE_AUTO_UPLOAD --value true --visibility plaintext --type string \
    --force --non-interactive >/dev/null
fi

for entry in "${VARS[@]}"; do
  name="${entry%%:*}"; vis="${entry##*:}"
  value="$(env_val "$name")"
  if [[ -z $value ]]; then
    echo "skip  $name (not set in .env)"
    continue
  fi
  echo "push  $name ($vis)"
  npx -y eas-cli@latest env:create \
    --scope project --environment "$ENVIRONMENT" \
    --name "$name" --value "$value" --visibility "$vis" --type string \
    --force --non-interactive >/dev/null
done

echo
echo "Now set on EAS ($ENVIRONMENT):"
npx -y eas-cli@latest env:list --environment "$ENVIRONMENT" 2>&1
