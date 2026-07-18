#!/usr/bin/env bash
# Build a device-installable FlexYug.ipa WITHOUT a paid Apple Developer account.
#
# Free-account constraints this script works around:
#  - EAS cloud iOS device builds need paid-program signing -> we build locally.
#  - Organizer/IPA export needs a distribution certificate -> we package the
#    .app from the archive by hand (Payload/ + zip). The signature doesn't
#    matter much: sideload tools (Sideloadly/AltStore/SideStore) re-sign the
#    IPA with the installer's own Apple ID anyway.
#
# One-time prerequisite: open ios/FlexYug.xcworkspace in Xcode once and select
# your free Personal Team for the FlexYug target (Signing & Capabilities), or
# pass DEVELOPMENT_TEAM=<TEAMID> in the environment.
#
# Usage: npm run build:ipa       (output: build/FlexYug.ipa)
set -euo pipefail

[[ "$(uname)" == Darwin ]] || { echo "error: iOS builds require macOS/Xcode" >&2; exit 1; }
cd "$(dirname "$0")/.."

# The Supabase config is baked into the binary via app.config extra at prebuild
# time — an IPA built without it ships a broken login. Mirror app.config.ts's
# env precedence when checking.
url_ok=false
for f in .env .env.local .env.development .env.development.local; do
  [[ -f $f ]] && grep -qE '^(EXPO_PUBLIC_|VITE_)?SUPABASE_URL=..*' "$f" && url_ok=true
done
[[ -n "${EXPO_PUBLIC_SUPABASE_URL:-}${VITE_SUPABASE_URL:-}${SUPABASE_URL:-}" ]] && url_ok=true
$url_ok || { echo "error: no Supabase URL configured (.env) — see .env.example" >&2; exit 1; }

# Sentry's Xcode build phase hard-fails a Release build when it can't upload
# dSYMs/source maps. With no auth token configured (crash reporting is
# intentionally off for tester builds) the upload must be disabled explicitly.
token_ok=false
for f in .env .env.local; do
  [[ -f $f ]] && grep -qE '^SENTRY_AUTH_TOKEN=..*' "$f" && token_ok=true
done
[[ -n "${SENTRY_AUTH_TOKEN:-}" ]] && token_ok=true
$token_ok || { echo "==> No SENTRY_AUTH_TOKEN — disabling Sentry auto-upload"; export SENTRY_DISABLE_AUTO_UPLOAD=true; }

echo "==> Regenerating ios/ from app.config.ts (CNG)"
npx expo prebuild --clean -p ios
npx pod-install

echo "==> Archiving Release (free Personal Team signing)"
rm -rf build/FlexYug.xcarchive
xcodebuild archive \
  -workspace ios/FlexYug.xcworkspace \
  -scheme FlexYug \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/FlexYug.xcarchive \
  -allowProvisioningUpdates \
  ${DEVELOPMENT_TEAM:+DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM"}

echo "==> Packaging IPA (manual — free accounts can't use Organizer export)"
rm -rf build/Payload build/FlexYug.ipa
mkdir -p build/Payload
cp -R build/FlexYug.xcarchive/Products/Applications/FlexYug.app build/Payload/
(cd build && zip -qry FlexYug.ipa Payload)
rm -rf build/Payload

echo "==> Done: $(du -h build/FlexYug.ipa | cut -f1) build/FlexYug.ipa"
echo "    Send this file to your tester — install steps in docs/TESTING.md"
