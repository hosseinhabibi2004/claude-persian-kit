#!/usr/bin/env bash
# Helpers shared by patch-mac.sh and patch-linux.sh. Sourced, never run.
# Written for bash 3.2 (the one macOS ships): no mapfile, no associative arrays.

# shellcheck disable=SC2034  # the constants below are used by the scripts that source this
PK_VERSION="0.1.0"
PK_MARKER_NAME=".persian-kit.json"

# Exit codes the /persian-patch command and the tests rely on.
PK_E_USAGE=2
PK_E_PREREQ=3
PK_E_NOT_FOUND=4
PK_E_FAILED=5

pk_log() { printf '%s\n' "$*"; }
pk_warn() { printf 'warning: %s\n' "$*" >&2; }
pk_die() {
  local code="$1"
  shift
  printf 'error: %s\n' "$*" >&2
  exit "$code"
}

PK_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PK_SRC_DIR="$(cd "$PK_LIB_DIR/../src" && pwd)"
PK_PATCH_APP="$PK_SRC_DIR/patch-app.cjs"

# Finds node (18 or newer) and puts its path in PK_NODE.
pk_require_node() {
  PK_NODE="$(command -v node 2>/dev/null || true)"
  [ -n "$PK_NODE" ] || pk_die "$PK_E_PREREQ" "Node.js 18 or newer is needed (it rewrites the app archive). Install it from https://nodejs.org and run this again."
  local major
  major="$("$PK_NODE" -e 'process.stdout.write(String(process.versions.node.split(".")[0]))' 2>/dev/null || echo 0)"
  [ "$major" -ge 18 ] || pk_die "$PK_E_PREREQ" "Node.js $major is too old; version 18 or newer is needed."
}

# pk_tool <patch-app arguments>: runs the Node helper, prints its output.
pk_tool() { "$PK_NODE" "$PK_PATCH_APP" "$@"; }

# pk_json <json> <key>: one top-level field of a JSON text, as text.
pk_json() {
  "$PK_NODE" -e '
    const v = JSON.parse(process.argv[1])[process.argv[2]];
    process.stdout.write(v === undefined || v === null ? "" : Array.isArray(v) ? v.join("\n") : String(v));
  ' "$1" "$2"
}

# pk_write_json <file> <key> <value> [<key> <value> ...]
pk_write_json() {
  local file="$1"
  shift
  "$PK_NODE" -e '
    const a = process.argv.slice(2), o = {};
    for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1];
    require("node:fs").writeFileSync(process.argv[1], JSON.stringify(o, null, 2) + "\n");
  ' "$file" "$@"
}

# pk_confirm <question>: succeeds on yes. With --yes it never asks; with no
# terminal and no --yes it refuses instead of guessing.
pk_confirm() {
  [ "${PK_YES:-0}" = "1" ] && return 0
  if [ ! -t 0 ] && [ ! -r /dev/tty ]; then
    pk_die "$PK_E_USAGE" "this needs a yes and there is no terminal to ask; run again with --yes."
  fi
  local answer
  printf '%s [y/N] ' "$1" >&2
  read -r answer < /dev/tty || answer=""
  case "$answer" in y | Y | yes | YES) return 0 ;; *) return 1 ;; esac
}

# Options every installer shares. Sets PK_YES, PK_FONT_ARGS (an array) and
# collects the rest in PK_REST (an array) for the caller.
pk_parse_common() {
  PK_YES=0
  PK_FONT_ARGS=()
  PK_REST=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --yes | -y) PK_YES=1 ;;
      --font)
        [ "$#" -ge 2 ] || pk_die "$PK_E_USAGE" "--font needs a font name"
        PK_FONT_ARGS+=(--font-local "$2")
        shift
        ;;
      --font-file)
        [ "$#" -ge 2 ] || pk_die "$PK_E_USAGE" "--font-file needs a file"
        PK_FONT_ARGS+=(--font-file "$2")
        shift
        ;;
      --no-font) PK_FONT_ARGS+=(--no-font) ;;
      --no-rtl) PK_FONT_ARGS+=(--no-rtl) ;;
      --all-js) PK_FONT_ARGS+=(--all-js) ;;
      *) PK_REST+=("$1") ;;
    esac
    shift
  done
}

# pk_is_ours <dir>: true when the directory carries this kit's marker, so an
# installer only ever deletes what it made.
pk_is_ours() { [ -f "$1/$PK_MARKER_NAME" ]; }

pk_du_mb() { du -sk "$1" 2>/dev/null | awk '{ printf "%d", $1 / 1024 }'; }
