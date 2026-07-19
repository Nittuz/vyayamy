#!/usr/bin/env bash
# Build a device-installable FlexYug.ipa WITHOUT a paid Apple Developer account.
#
# Free-account constraints this script works around:
#  - EAS cloud iOS device builds need paid-program signing -> we build locally.
#  - `expo prebuild --clean` regenerates ios/ from scratch, so any team picked
#    inside Xcode is wiped every run -> the team ID comes from the environment
#    (DEVELOPMENT_TEAM, or APPLE_TEAM_ID in .env) and is passed to xcodebuild.
#  - expo-notifications bakes an aps-environment (push) entitlement that free
#    Personal Teams cannot provision -> stripped after prebuild. Nothing is
#    lost: the rest timer uses LOCAL notifications only, and sideload tools
#    strip push entitlements at re-sign anyway.
#  - Organizer/IPA export needs a distribution certificate -> we package the
#    .app from the archive by hand (Payload/ + zip). The signature doesn't
#    matter much: sideload tools (Sideloadly/AltStore/SideStore) re-sign the
#    IPA with the installer's own Apple ID anyway.
#
# Prerequisite: your Apple team ID in .env as APPLE_TEAM_ID (or exported as
# DEVELOPMENT_TEAM). Find it in Xcode -> Settings -> Accounts -> your Apple ID
# (a free "Personal Team" has one too, e.g. ABCDE12345). First use of a free
# Apple ID on this Mac: sign in there once so the personal team exists.
#
# Usage: npm run build:ipa       (output: build/FlexYug.ipa)
set -euo pipefail

[[ "$(uname)" == Darwin ]] || { echo "error: iOS builds require macOS/Xcode" >&2; exit 1; }
cd "$(dirname "$0")/.."

# env_val NAME -> value from the environment or the first .env* file that sets it.
env_val() {
  local name="$1" line
  if [[ -n "${!name:-}" ]]; then printf '%s' "${!name}"; return; fi
  for f in .env .env.local .env.development .env.development.local; do
    [[ -f $f ]] || continue
    line=$(grep -E "^${name}=..*" "$f" | tail -1) || true
    [[ -n $line ]] && { printf '%s' "${line#*=}"; return; }
  done
}

# The Supabase config is baked into the binary via app.config extra at prebuild
# time — an IPA built without it ships a broken login. Mirror app.config.ts's
# env precedence when checking; both the URL and the anon key are required.
url_ok=false key_ok=false
for name in EXPO_PUBLIC_SUPABASE_URL VITE_SUPABASE_URL SUPABASE_URL; do
  [[ -n "$(env_val "$name")" ]] && url_ok=true
done
for name in EXPO_PUBLIC_SUPABASE_ANON_KEY VITE_SUPABASE_ANON_KEY SUPABASE_ANON_KEY; do
  [[ -n "$(env_val "$name")" ]] && key_ok=true
done
$url_ok || { echo "error: no Supabase URL configured (.env) — see .env.example" >&2; exit 1; }
$key_ok || { echo "error: no Supabase anon key configured (.env) — see .env.example" >&2; exit 1; }

# The signing team. prebuild --clean regenerates ios/ every run, so an
# Xcode-side selection cannot stick — the ID must come from the environment.
TEAM="${DEVELOPMENT_TEAM:-$(env_val APPLE_TEAM_ID)}"
[[ -n $TEAM ]] || {
  echo "error: no signing team. Put APPLE_TEAM_ID=<your team id> in .env (or export" >&2
  echo "       DEVELOPMENT_TEAM). Xcode -> Settings -> Accounts shows it; free" >&2
  echo "       Personal Teams work." >&2
  exit 1
}

# Sentry's Xcode build phase hard-fails a Release build when it can't upload
# dSYMs/source maps. With no auth token configured (crash reporting is
# intentionally off for tester builds) the upload must be disabled explicitly.
[[ -n "$(env_val SENTRY_AUTH_TOKEN)" ]] || {
  echo "==> No SENTRY_AUTH_TOKEN — disabling Sentry auto-upload"
  export SENTRY_DISABLE_AUTO_UPLOAD=true
}

echo "==> Regenerating ios/ from app.config.ts (CNG)"
npx expo prebuild --clean -p ios
npx pod-install

# Free Personal Teams cannot provision the Push Notifications capability, and
# automatic signing must provision every entitlement present. Strip the
# aps-environment entitlement expo-notifications wrote (local notifications —
# the rest timer — do not need it).
ENTITLEMENTS=ios/FlexYug/FlexYug.entitlements
if /usr/libexec/PlistBuddy -c 'Print :aps-environment' "$ENTITLEMENTS" >/dev/null 2>&1; then
  echo "==> Stripping aps-environment entitlement (free teams can't sign push)"
  /usr/libexec/PlistBuddy -c 'Delete :aps-environment' "$ENTITLEMENTS"
fi

echo "==> Archiving Release (team $TEAM)"
rm -rf build/FlexYug.xcarchive
xcodebuild archive \
  -workspace ios/FlexYug.xcworkspace \
  -scheme FlexYug \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/FlexYug.xcarchive \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM"

echo "==> Packaging IPA (manual — free accounts can't use Organizer export)"
rm -rf build/Payload build/FlexYug.ipa
mkdir -p build/Payload
cp -R build/FlexYug.xcarchive/Products/Applications/FlexYug.app build/Payload/
(cd build && zip -qry FlexYug.ipa Payload)
rm -rf build/Payload

echo "==> Done: $(du -h build/FlexYug.ipa | cut -f1) build/FlexYug.ipa"
echo "    Send this file to your tester — install steps in docs/TESTING.md"
