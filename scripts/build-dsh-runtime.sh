#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${REALMFLOW_DSH_TARGET:-}"
SOURCE_DIR="${REALMFLOW_DSH_SOURCE:-"$ROOT_DIR/../deepseek-harness"}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="$2"
      shift 2
      ;;
    --source)
      SOURCE_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  TARGET="$(node -e "process.stdout.write(process.platform + '-' + process.arch)")"
fi

case "$TARGET" in
  darwin-arm64|darwin-x64|linux-arm64|linux-x64|win32-x64) ;;
  *)
    echo "Unsupported DSH runtime target: $TARGET" >&2
    exit 1
    ;;
esac

if [[ "$TARGET" == win32-* ]]; then
  NODE_BINARY="$ROOT_DIR/resources/dsh/runtime/$TARGET/node/node.exe"
  NODE_BIN_DIR="$ROOT_DIR/resources/dsh/runtime/$TARGET/node"
  COREPACK_JS="$ROOT_DIR/resources/dsh/runtime/$TARGET/node/node_modules/corepack/dist/corepack.js"
else
  NODE_BINARY="$ROOT_DIR/resources/dsh/runtime/$TARGET/node/bin/node"
  NODE_BIN_DIR="$ROOT_DIR/resources/dsh/runtime/$TARGET/node/bin"
  COREPACK_JS="$ROOT_DIR/resources/dsh/runtime/$TARGET/node/lib/node_modules/corepack/dist/corepack.js"
fi
DSH_ENTRYPOINT="$ROOT_DIR/resources/dsh/runtime/$TARGET/dsh/apps/cli/lib/bin.js"
DSH_CLI_ROOT="$ROOT_DIR/resources/dsh/runtime/$TARGET/dsh/apps/cli"

dsh_pnpm_in() {
  local workspace_dir="$1"
  shift
  PATH="$NODE_BIN_DIR:$PATH" "$NODE_BINARY" "$COREPACK_JS" pnpm --dir "$workspace_dir" "$@"
}

dsh_pnpm() {
  dsh_pnpm_in "$SOURCE_DIR" "$@"
}

discover_dsh_workspace_packages() {
  dsh_pnpm list -r --depth -1 --json | "$NODE_BINARY" --input-type=module -e '
import { readFileSync } from "node:fs"

const input = readFileSync(0, "utf8").trim()
const packages = input === "" ? [] : JSON.parse(input)
for (const manifest of packages) {
  if (
    typeof manifest?.name === "string" &&
    manifest.name.startsWith("@deepseek-ai/") &&
    typeof manifest.path === "string"
  ) {
    process.stdout.write(`${manifest.name}\t${manifest.path}\n`)
  }
}
'
}

materialize_missing_dsh_workspace_packages() {
  while IFS=$'\t' read -r package_name source_path; do
    if [[ -z "${package_name:-}" || -z "${source_path:-}" ]]; then
      continue
    fi
    local package_scope
    local package_basename
    local destination_path

    if [[ ! -f "$source_path/package.json" ]]; then
      echo "Missing DSH supplemental package source: $source_path" >&2
      exit 1
    fi

    package_scope="$(dirname "$package_name")"
    package_basename="$(basename "$package_name")"
    destination_path="$DSH_CLI_ROOT/node_modules/$package_scope/$package_basename"

    if [[ -f "$destination_path/package.json" ]]; then
      continue
    fi

    mkdir -p "$(dirname "$destination_path")"
    rsync -a \
      --exclude node_modules \
      --exclude .turbo \
      --exclude .tsbuildinfo \
      "$source_path/" \
      "$destination_path/"
  done < <(discover_dsh_workspace_packages)
}

prune_dsh_runtime_dev_artifacts() {
  if [[ ! -d "$DSH_CLI_ROOT" ]]; then
    return
  fi

  find "$DSH_CLI_ROOT" \
    \( -name tests -o -name __tests__ -o -name snapshots \) \
    -prune \
    -exec rm -rf {} +
}

build_dsh_native_system() {
  local native_system_dir="$SOURCE_DIR/native/system"
  if [[ ! -f "$native_system_dir/package.json" ]]; then
    echo "Missing DSH native system package: $native_system_dir" >&2
    exit 1
  fi

  dsh_pnpm_in "$native_system_dir" run build:native
}

if [[ ! -x "$NODE_BINARY" ]]; then
  echo "Missing staged Node 22.19.0 runtime: $NODE_BINARY" >&2
  echo "Stage the target Node runtime before running fetch:dsh-runtime." >&2
  exit 1
fi

if [[ ! -f "$COREPACK_JS" ]]; then
  echo "Missing bundled Corepack runtime: $COREPACK_JS" >&2
  exit 1
fi

cd "$ROOT_DIR"
dsh_pnpm run build:lib:host
dsh_pnpm run build:lib:client
build_dsh_native_system
rm -rf "$DSH_CLI_ROOT"
mkdir -p "$(dirname "$DSH_CLI_ROOT")"
dsh_pnpm --filter @deepseek-ai/dsh deploy --ignore-scripts "$DSH_CLI_ROOT"
if [[ "$TARGET" != win32-* ]]; then
  chmod +x "$DSH_ENTRYPOINT"
fi
materialize_missing_dsh_workspace_packages
prune_dsh_runtime_dev_artifacts
node scripts/fetch-dsh-runtime.mjs --source "$SOURCE_DIR" --target "$TARGET"
npm run generate:dsh-runtime-sbom -- --target "$TARGET"
npm run verify:dsh-package-layout -- --target "$TARGET"
npm run verify:dsh-runtime -- --target "$TARGET"
