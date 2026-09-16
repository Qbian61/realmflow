#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="$ROOT_DIR/release/mac-arm64/RealmFlow.app"
COMPONENT_PLIST="$ROOT_DIR/.build/package/components.plist"
PKG_PATH="$ROOT_DIR/release/RealmFlow-0.1.0-arm64.pkg"
ZIP_PATH="$ROOT_DIR/release/RealmFlow-0.1.0-arm64.zip"

cd "$ROOT_DIR"
mkdir -p "$(dirname "$COMPONENT_PLIST")"

if [[ -d "$ROOT_DIR/release/mac-arm64" && ! -w "$APP_PATH/Contents/_CodeSignature" ]]; then
  mv "$ROOT_DIR/release/mac-arm64" \
    "$ROOT_DIR/.build/package/relocated-app-$(date +%s)"
fi

bash scripts/build-python.sh
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder \
  --config build/electron-builder.yml \
  --mac dir \
  --arm64

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
