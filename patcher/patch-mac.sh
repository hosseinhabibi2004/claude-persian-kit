#!/usr/bin/env bash
# patch-mac.sh: a Persian-patched copy of Claude Desktop on macOS.
#
# Builds ~/Applications/Claude-Persian.app from /Applications/Claude.app. The
# original is never modified and no sudo is used. The copy is signed ad hoc, so
# macOS may ask once about Gatekeeper and once about the Keychain.
#
#   patch-mac.sh install   [--source APP] [--target APP] [--font NAME|--font-file F|--no-font] [--launch] [--yes]
#   patch-mac.sh status    [--target APP]
#   patch-mac.sh uninstall [--target APP] [--yes]
#
# Exit codes: 2 usage, 3 missing prerequisite, 4 Claude not found, 5 failed.

set -euo pipefail

# shellcheck source=lib/common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

SOURCE_APP=""
TARGET_APP="$HOME/Applications/Claude-Persian.app"
LAUNCH=0
STAGING=""
DONE=0
DISPLAY_NAME="Claude Persian"

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
}

require_macos() {
  [ "$(uname -s)" = "Darwin" ] || pk_die "$PK_E_PREREQ" "this installer is for macOS; on Linux use patch-linux.sh."
  local tool
  for tool in codesign ditto plutil xattr; do
    command -v "$tool" > /dev/null 2>&1 || pk_die "$PK_E_PREREQ" "'$tool' not found. Install the command line tools with: xcode-select --install"
  done
}

find_source() {
  if [ -n "$SOURCE_APP" ]; then
    [ -d "$SOURCE_APP/Contents" ] || pk_die "$PK_E_NOT_FOUND" "$SOURCE_APP is not an app bundle"
    return
  fi
  local candidate
  for candidate in /Applications/Claude.app "$HOME/Applications/Claude.app"; do
    if [ -d "$candidate/Contents/Resources" ]; then SOURCE_APP="$candidate"; return; fi
  done
  pk_die "$PK_E_NOT_FOUND" "Claude.app not found in /Applications. Install Claude Desktop from https://claude.ai/download, or pass --source."
}

cleanup() {
  if [ "$DONE" != "1" ] && [ -n "$STAGING" ] && [ -d "$STAGING" ]; then
    rm -rf "$STAGING"
  fi
}
trap cleanup EXIT

quit_copy() {
  # Only processes started from our own copy, never the original or Claude Code.
  local pids
  pids="$(pgrep -f "$TARGET_APP/Contents/MacOS/" 2> /dev/null || true)"
  [ -n "$pids" ] || return 0
  pk_log "Closing the running Claude Persian ..."
  # shellcheck disable=SC2086  # pids is a list of numbers
  kill $pids 2> /dev/null || true
  sleep 2
}

# Signs one file or bundle ad hoc, keeping its entitlements except the ones tied
# to Anthropic's developer account, which macOS refuses on an ad hoc signature.
sign_one() {
  local item="$1" ents
  ents="$(mktemp "${TMPDIR:-/tmp}/persian-kit-ents.XXXXXX")"
  if codesign -d --entitlements :- "$item" 2> /dev/null | pk_tool entitlements > "$ents" 2> /dev/null && grep -q '<key>' "$ents"; then
    codesign --force --sign - --entitlements "$ents" "$item" > /dev/null 2>&1 \
      || { rm -f "$ents"; return 1; }
  else
    codesign --force --sign - "$item" > /dev/null 2>&1 || { rm -f "$ents"; return 1; }
  fi
  rm -f "$ents"
}

sign_app() {
  local app="$1" item count=0
  while IFS= read -r -d '' item; do
    sign_one "$item" || pk_die "$PK_E_FAILED" "could not sign $item"
    count=$((count + 1))
  done < <(pk_tool list-code --app "$app")
  sign_one "$app" || pk_die "$PK_E_FAILED" "could not sign $app"
  codesign --verify --deep --strict "$app" > /dev/null 2>&1 \
    || pk_die "$PK_E_FAILED" "the signature of the copy does not verify"
  pk_log "Signed $((count + 1)) items."
}

cmd_install() {
  require_macos
  pk_require_node
  find_source
  local resources="$SOURCE_APP/Contents/Resources"
  [ -f "$resources/app.asar" ] || pk_die "$PK_E_NOT_FOUND" "$SOURCE_APP has no Contents/Resources/app.asar; it is not the Claude Desktop build this expects."
  local info version
  info="$(pk_tool identify --asar "$resources/app.asar")"
  version="$(pk_json "$info" version)"

  pk_log "Claude Desktop $version"
  pk_log "  from: $SOURCE_APP   (not modified)"
  pk_log "  to:   $TARGET_APP"
  pk_log "The copy is signed with a local, ad hoc signature. On first start macOS may ask"
  pk_log "to open it (right-click, Open) and to allow 'Claude Safe Storage' in your Keychain."
  pk_confirm "Create the patched copy?" || pk_die "$PK_E_USAGE" "cancelled"

  if [ -d "$TARGET_APP" ] && ! pk_is_ours "$TARGET_APP/Contents/Resources"; then
    pk_die "$PK_E_FAILED" "$TARGET_APP exists and was not made by this kit; move it away first."
  fi
  quit_copy

  mkdir -p "$(dirname "$TARGET_APP")"
  STAGING="$TARGET_APP.new"
  rm -rf "$STAGING"
  ditto "$SOURCE_APP" "$STAGING" || pk_die "$PK_E_FAILED" "copying $SOURCE_APP failed"
  xattr -cr "$STAGING" 2> /dev/null || true
  plutil -convert xml1 "$STAGING/Contents/Info.plist" || pk_die "$PK_E_FAILED" "cannot read Info.plist"

  local staged="$STAGING/Contents/Resources" result hash
  result="$(pk_tool inject --asar "$staged/app.asar" --out "$staged/app.asar.new" ${PK_FONT_ARGS[@]+"${PK_FONT_ARGS[@]}"})" \
    || pk_die "$PK_E_FAILED" "patching the archive failed"
  mv -f "$staged/app.asar.new" "$staged/app.asar"
  hash="$(pk_json "$result" headerHash)"

  # Electron compares the archive's header hash with the one in Info.plist.
  pk_tool plist-integrity --plist "$STAGING/Contents/Info.plist" --hash "$hash" --display-name "$DISPLAY_NAME" > /dev/null \
    || pk_die "$PK_E_FAILED" "cannot update Info.plist"
  pk_write_json "$staged/$PK_MARKER_NAME" kit "$PK_VERSION" source "$SOURCE_APP" version "$version" \
    patched "$(pk_json "$result" patched | tr '\n' ' ')"

  sign_app "$STAGING"

  rm -rf "$TARGET_APP"
  mv "$STAGING" "$TARGET_APP"
  DONE=1

  pk_log ""
  pk_log "Done: $TARGET_APP"
  pk_log "Quit the original Claude first (both share your login), then open Claude Persian."
  pk_log "After a Claude Desktop update, run install again to rebuild the copy."
  if [ "$LAUNCH" = "1" ]; then open "$TARGET_APP"; fi
}

cmd_status() {
  pk_require_node
  if [ ! -d "$TARGET_APP" ] || ! pk_is_ours "$TARGET_APP/Contents/Resources"; then
    pk_log "installed: no"
    return 0
  fi
  local info marker
  info="$(pk_tool status --asar "$TARGET_APP/Contents/Resources/app.asar")"
  marker="$(cat "$TARGET_APP/Contents/Resources/$PK_MARKER_NAME")"
  pk_log "installed: yes"
  pk_log "location: $TARGET_APP"
  pk_log "version: $(pk_json "$info" version)"
  pk_log "patched: $(pk_json "$info" isPatched)"
  pk_log "font: $(pk_json "$info" font)"
  pk_log "source: $(pk_json "$marker" source)"
  local current=""
  if [ -f "$(pk_json "$marker" source)/Contents/Resources/app.asar" ]; then
    current="$(pk_json "$(pk_tool identify --asar "$(pk_json "$marker" source)/Contents/Resources/app.asar")" version)"
  fi
  if [ -n "$current" ] && [ "$current" != "$(pk_json "$info" version)" ]; then
    pk_log "update: Claude Desktop is now $current; run install again to rebuild the copy"
  fi
}

cmd_uninstall() {
  pk_log "This removes $TARGET_APP only. Claude.app is never touched."
  pk_confirm "Remove it?" || pk_die "$PK_E_USAGE" "cancelled"
  if [ -d "$TARGET_APP" ]; then
    pk_is_ours "$TARGET_APP/Contents/Resources" || pk_die "$PK_E_FAILED" "$TARGET_APP was not made by this kit; leaving it alone"
    quit_copy
    rm -rf "$TARGET_APP"
  fi
  pk_log "Removed."
}

main() {
  [ "$#" -ge 1 ] || { usage; exit "$PK_E_USAGE"; }
  local command="$1"
  shift
  pk_parse_common "$@"
  local i=0 args=()
  args=(${PK_REST[@]+"${PK_REST[@]}"})
  while [ "$i" -lt "${#args[@]}" ]; do
    case "${args[$i]}" in
      --source | --target)
        [ $((i + 1)) -lt "${#args[@]}" ] || pk_die "$PK_E_USAGE" "${args[$i]} needs a value"
        if [ "${args[$i]}" = "--source" ]; then SOURCE_APP="${args[$((i + 1))]}"; else TARGET_APP="${args[$((i + 1))]}"; fi
        i=$((i + 1))
        ;;
      --launch) LAUNCH=1 ;;
      *) pk_die "$PK_E_USAGE" "unknown option ${args[$i]}" ;;
    esac
    i=$((i + 1))
  done
  case "$command" in
    install) cmd_install ;;
    status) cmd_status ;;
    uninstall) cmd_uninstall ;;
    -h | --help | help) usage ;;
    *) usage; exit "$PK_E_USAGE" ;;
  esac
}

main "$@"
