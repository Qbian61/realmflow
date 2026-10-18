#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="$ROOT_DIR/release/mac-arm64/RealmFlow.app"
COMPONENT_PLIST="$ROOT_DIR/.build/package/components.plist"
PKG_PATH="$ROOT_DIR/release/RealmFlow-0.1.0-arm64.pkg"
ZIP_PATH="$ROOT_DIR/release/RealmFlow-0.1.0-arm64.zip"
STAGING_ROOT="${REALMFLOW_MAC_PACKAGE_STAGE:-}"
CLEAN_STAGING_ROOT=0

if [[ -z "$STAGING_ROOT" ]]; then
  STAGING_ROOT="$(mktemp -d /tmp/realmflow-mac-package.XXXXXX)"
  CLEAN_STAGING_ROOT=1
else
  case "$STAGING_ROOT" in
    /tmp/realmflow-mac-package.*|/private/tmp/realmflow-mac-package.*) ;;
    *)
      echo "REALMFLOW_MAC_PACKAGE_STAGE must be under /tmp/realmflow-mac-package.*" >&2
      exit 1
      ;;
  esac
fi

cleanup() {
  if [[ "$CLEAN_STAGING_ROOT" == "1" ]]; then
    rm -rf "$STAGING_ROOT"
  fi
}
trap cleanup EXIT

cd "$ROOT_DIR"
mkdir -p "$(dirname "$COMPONENT_PLIST")"

if [[ -d "$ROOT_DIR/release/mac-arm64" && ! -w "$APP_PATH/Contents/_CodeSignature" ]]; then
  mv "$ROOT_DIR/release/mac-arm64" \
    "$ROOT_DIR/.build/package/relocated-app-$(date +%s)"
fi

bash scripts/build-dsh-runtime.sh --target darwin-arm64
npm run generate:dsh-runtime-sbom -- --target darwin-arm64
npm run build
npm run verify:dsh-package-layout -- --target darwin-arm64
npm run verify:dsh-runtime -- --target darwin-arm64

rm -rf "$STAGING_ROOT"
mkdir -p "$STAGING_ROOT"
rsync -a \
  "$ROOT_DIR/build" \
  "$ROOT_DIR/dsh-plugins" \
  "$ROOT_DIR/logo.png" \
  "$ROOT_DIR/node_modules" \
  "$ROOT_DIR/out" \
  "$ROOT_DIR/package.json" \
  "$ROOT_DIR/python-service" \
  "$ROOT_DIR/resources" \
  "$ROOT_DIR/THIRD_PARTY_NOTICES.md" \
  "$STAGING_ROOT/"

cd "$STAGING_ROOT"
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder \
  --config build/electron-builder.yml \
  --mac dir \
  --arm64

cd "$ROOT_DIR"
rm -rf "$ROOT_DIR/release/mac-arm64"
mkdir -p "$ROOT_DIR/release"
rsync -a --delete "$STAGING_ROOT/release/mac-arm64/" "$ROOT_DIR/release/mac-arm64/"

codesign --force --deep --sign - "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"

rm -f "$PKG_PATH" "$ZIP_PATH"
pkgbuild --analyze --root "$ROOT_DIR/release/mac-arm64" "$COMPONENT_PLIST"
/usr/libexec/PlistBuddy \
  -c "Set :0:BundleIsRelocatable false" \
  "$COMPONENT_PLIST"

pkgbuild \
  --root "$ROOT_DIR/release/mac-arm64" \
  --component-plist "$COMPONENT_PLIST" \
  --identifier "com.realmflow.desktop" \
  --version "0.1.0" \
  --install-location "/Applications" \
  "$PKG_PATH"

ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ZIP_PATH"
