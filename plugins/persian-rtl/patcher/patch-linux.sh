#!/usr/bin/env bash
# patch-linux.sh (EXPERIMENTAL): a Persian-patched copy of Claude Desktop on Linux.
#
# Anthropic does not ship an official Claude Desktop for Linux, so this looks for
# an Electron build you already have (AppImage, deb/rpm install, Flatpak or a
# community package), copies it, and patches the COPY. The original is never
# touched. Claude Code in a terminal needs none of this.
#
#   patch-linux.sh install   [--path DIR|FILE] [--font NAME|--font-file F|--no-font] [--no-sandbox] [--yes]
#   patch-linux.sh status
#   patch-linux.sh uninstall [--yes]
#   patch-linux.sh detect    [--path DIR|FILE]
#
# Exit codes: 2 usage, 3 missing prerequisite, 4 no Claude Desktop found, 5 failed.

set -euo pipefail

# shellcheck source=lib/common.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
KIT_DIR="$DATA_HOME/claude-persian-kit"
TARGET="$KIT_DIR/Claude-Persian"
LAUNCHER="$HOME/.local/bin/claude-persian"
DESKTOP_FILE="$DATA_HOME/applications/claude-persian.desktop"
LAUNCHER_TAG="# claude-persian-kit"

SOURCE_PATH=""
NO_SANDBOX=0

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
}

# --- finding Claude Desktop ---------------------------------------------------

# Succeeds when the archive is Claude Desktop's.
looks_like_claude() {
  local info name
  info="$(pk_tool identify --asar "$1" 2>/dev/null)" || return 1
  name="$(pk_json "$info" name)$(pk_json "$info" productName)"
  case "$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')" in *claude*) return 0 ;; *) return 1 ;; esac
}

# How an install got here, for the message only.
package_of() {
  local owner=""
  if command -v dpkg > /dev/null 2>&1; then
    owner="$(dpkg -S "$1" 2> /dev/null | head -n 1 | cut -d: -f1 || true)"
    [ -n "$owner" ] && { printf 'deb package %s' "$owner"; return; }
  fi
  if command -v rpm > /dev/null 2>&1; then
    owner="$(rpm -qf "$1" 2> /dev/null | head -n 1 || true)"
    case "$owner" in "" | *"not owned"*) ;; *) printf 'rpm package %s' "$owner"; return ;; esac
  fi
  case "$1" in
    */flatpak/*) printf 'Flatpak' ;;
    /snap/*) printf 'Snap' ;;
    "$HOME"/*) printf 'a copy in your home folder' ;;
    *) printf 'a manual or community install' ;;
  esac
}

# Prints every app.asar that belongs to Claude Desktop, one per line.
find_archives() {
  local dir
  for dir in /opt /usr/lib /usr/lib64 /usr/share /usr/local /snap \
    /var/lib/flatpak/app "$DATA_HOME/flatpak/app" "$DATA_HOME" "$HOME/.local/opt" "$HOME/opt" "$HOME/Applications"; do
    [ -d "$dir" ] || continue
    find "$dir" -maxdepth 7 -name app.asar -type f -not -path "$KIT_DIR/*" 2> /dev/null
  done | sort -u | while IFS= read -r asar; do
    looks_like_claude "$asar" && printf '%s\n' "$asar"
  done
}

# Prints AppImages that look like Claude, one per line.
find_appimages() {
  local dir
  for dir in "$HOME/Applications" "$HOME/Downloads" "$HOME/Desktop" "$HOME/.local/bin" "$HOME/bin" /opt; do
    [ -d "$dir" ] || continue
    find "$dir" -maxdepth 2 -type f \( -iname '*claude*.AppImage' -o -iname '*claude*.appimage' \) 2> /dev/null
  done | sort -u
}

# Unpacks an AppImage (no FUSE needed) and prints the archive inside.
extract_appimage() {
  local image="$1" work="$KIT_DIR/extracted"
  rm -rf "$work"
  mkdir -p "$work"
  chmod +x "$image" 2> /dev/null || true
  (cd "$work" && "$image" --appimage-extract > /dev/null 2>&1) || pk_die "$PK_E_FAILED" "could not unpack $image (is it an AppImage?)"
  find "$work/squashfs-root" -maxdepth 5 -name app.asar -type f 2> /dev/null | head -n 1
}

# Resolves --path (a folder, an app.asar or an AppImage) to an archive.
archive_from_path() {
  local p="$1"
  if [ -d "$p" ]; then
    local hit
    hit="$(find "$p" -maxdepth 5 -name app.asar -type f 2> /dev/null | head -n 1)"
    [ -n "$hit" ] || pk_die "$PK_E_NOT_FOUND" "no app.asar under $p"
    printf '%s\n' "$hit"
  elif [ -f "$p" ]; then
    case "$p" in
      *.AppImage | *.appimage) extract_appimage "$p" ;;
      *.asar) printf '%s\n' "$p" ;;
      *) pk_die "$PK_E_USAGE" "$p is neither a folder, an app.asar nor an AppImage" ;;
    esac
  else
    pk_die "$PK_E_NOT_FOUND" "$p does not exist"
  fi
}

none_found() {
  cat >&2 << 'MSG'
error: no Claude Desktop (Electron) installation found.

Anthropic does not publish an official Claude Desktop for Linux, so there may be
nothing to patch. Claude Code in a terminal works on Linux with the plugins alone.

If you have a community build, point to it:
  patch-linux.sh install --path /path/to/install-folder
  patch-linux.sh install --path /path/to/Claude.AppImage
  patch-linux.sh install --path /path/to/app.asar
MSG
  exit "$PK_E_NOT_FOUND"
}

# Sets ASAR (the chosen archive). Exits 4 when there is none.
choose_archive() {
  if [ -n "$SOURCE_PATH" ]; then
    ASAR="$(archive_from_path "$SOURCE_PATH")"
    [ -n "$ASAR" ] || none_found
    looks_like_claude "$ASAR" || pk_die "$PK_E_NOT_FOUND" "$ASAR is not Claude Desktop's archive"
    return
  fi
  local found
  found="$(find_archives)"
  if [ -z "$found" ]; then
    local image
    image="$(find_appimages | head -n 1)"
    if [ -n "$image" ]; then
      pk_log "Found an AppImage: $image"
      ASAR="$(extract_appimage "$image")"
      [ -n "$ASAR" ] && looks_like_claude "$ASAR" && return
    fi
    none_found
  fi
  ASAR="$(printf '%s\n' "$found" | head -n 1)"
  if [ "$(printf '%s\n' "$found" | wc -l | tr -d ' ')" -gt 1 ]; then
    pk_warn "more than one Claude Desktop found; using the first. Use --path to choose:"
    printf '%s\n' "$found" | sed 's/^/  /' >&2
  fi
}

# The folder to copy for an archive: the one that holds resources/, or the
# archive's own folder.
install_root_of() {
  local dir
  dir="$(dirname "$1")"
  if [ "$(basename "$dir")" = "resources" ]; then dirname "$dir"; else printf '%s\n' "$dir"; fi
}

# --- commands -------------------------------------------------------------------

cmd_detect() {
  pk_require_node
  choose_archive
  local info
  info="$(pk_tool identify --asar "$ASAR")"
  pk_log "archive: $ASAR"
  pk_log "kind: $(package_of "$ASAR")"
  pk_log "version: $(pk_json "$info" version)"
}

find_executable() {
  local dir="$1" f best="" size best_size=0
  for f in "$dir"/*; do
    if [ ! -f "$f" ] || [ ! -x "$f" ]; then continue; fi
    case "$(basename "$f")" in chrome-sandbox | chrome_crashpad_handler | *.sh | *.so*) continue ;; esac
    [ "$(head -c 4 "$f" 2> /dev/null | od -An -tx1 | tr -d ' \n')" = "7f454c46" ] || continue
    size="$(wc -c < "$f" | tr -d ' ')"
    case "$(basename "$f" | tr '[:upper:]' '[:lower:]')" in *claude*) size=$((size + 1000000000)) ;; esac
    if [ "$size" -gt "$best_size" ]; then best="$f"; best_size="$size"; fi
  done
  printf '%s\n' "$best"
}

write_launcher() {
  local exe="$1" archive="$2"
  mkdir -p "$(dirname "$LAUNCHER")" "$(dirname "$DESKTOP_FILE")"
  local flags=""
  [ "$NO_SANDBOX" = "1" ] && flags=" --no-sandbox"
  {
    printf '#!/bin/sh\n%s\n' "$LAUNCHER_TAG"
    if [ -n "$exe" ]; then
      printf 'exec "%s"%s "$@"\n' "$exe" "$flags"
    else
      printf 'exec electron "%s"%s "$@"\n' "$archive" "$flags"
    fi
  } > "$LAUNCHER"
  chmod +x "$LAUNCHER"
  {
    printf '[Desktop Entry]\nType=Application\nName=Claude Persian\nComment=Claude Desktop with Persian font and RTL\n'
    printf 'Exec="%s" %%U\nTerminal=false\nCategories=Network;Chat;\nStartupWMClass=Claude\n' "$LAUNCHER"
    printf 'X-Claude-Persian-Kit=true\n'
  } > "$DESKTOP_FILE"
}

cmd_install() {
  pk_require_node
  choose_archive
  local root rel info size version staging
  root="$(install_root_of "$ASAR")"
  case "$root" in
    / | /usr | /usr/lib | /usr/lib64 | /usr/share | /opt | /usr/local | "$HOME" | "$DATA_HOME")
      pk_die "$PK_E_FAILED" "refusing to copy $root; use --path to point at the Claude folder itself" ;;
  esac
  size="$(pk_du_mb "$root")"
  [ "${size:-0}" -lt 3072 ] || pk_die "$PK_E_FAILED" "$root is ${size} MB; that is not a Claude Desktop folder"
  rel="${ASAR#"$root"/}"
  info="$(pk_tool identify --asar "$ASAR")"
  version="$(pk_json "$info" version)"

  pk_log "Claude Desktop $version ($(package_of "$ASAR"))"
  pk_log "  from: $root"
  pk_log "  to:   $TARGET   (a copy, about ${size} MB; the original is not touched)"
  pk_confirm "Create the patched copy?" || pk_die "$PK_E_USAGE" "cancelled"

  mkdir -p "$KIT_DIR"
  staging="$KIT_DIR/Claude-Persian.new"
  rm -rf "$staging"
  cp -a "$root/." "$staging/" || pk_die "$PK_E_FAILED" "copying $root failed"

  local out result
  out="$staging/$rel.new"
  result="$(pk_tool inject --asar "$staging/$rel" --out "$out" ${PK_FONT_ARGS[@]+"${PK_FONT_ARGS[@]}"})" \
    || { rm -rf "$staging"; pk_die "$PK_E_FAILED" "patching the archive failed"; }
  mv -f "$out" "$staging/$rel"

  pk_write_json "$staging/$PK_MARKER_NAME" kit "$PK_VERSION" source "$root" archive "$rel" version "$version" \
    patched "$(pk_json "$result" patched | tr '\n' ' ')"

  local exe
  exe="$(find_executable "$staging")"
  rm -rf "$TARGET"
  mv "$staging" "$TARGET"
  [ -n "$exe" ] && exe="$TARGET/${exe#"$staging"/}"
  write_launcher "$exe" "$TARGET/$rel"

  pk_log ""
  pk_log "Done. Start it with: $LAUNCHER   (or 'Claude Persian' in your app menu)"
  if [ -z "$exe" ]; then
    pk_warn "this build has no Electron program of its own; the launcher needs 'electron' on your PATH."
  fi
  if [ "$NO_SANDBOX" != "1" ] && ! unshare -Ur true > /dev/null 2>&1; then
    pk_warn "this system may not allow Electron's sandbox for a copied app. If it does not start, run: patch-linux.sh install --no-sandbox"
  fi
  pk_log "Close the original Claude Desktop first: both share your login and settings."
}

cmd_status() {
  pk_require_node
  if [ ! -d "$TARGET" ] || ! pk_is_ours "$TARGET"; then
    pk_log "installed: no"
    return 0
  fi
  local rel info
  rel="$(pk_json "$(cat "$TARGET/$PK_MARKER_NAME")" archive)"
  info="$(pk_tool status --asar "$TARGET/$rel")"
  pk_log "installed: yes"
  pk_log "location: $TARGET"
  pk_log "version: $(pk_json "$info" version)"
  pk_log "patched: $(pk_json "$info" isPatched)"
  pk_log "font: $(pk_json "$info" font)"
  pk_log "launcher: $LAUNCHER"
  pk_log "source: $(pk_json "$(cat "$TARGET/$PK_MARKER_NAME")" source)"
}

cmd_uninstall() {
  pk_log "This removes only what the kit made: $TARGET, $LAUNCHER and the app-menu entry."
  pk_confirm "Remove them?" || pk_die "$PK_E_USAGE" "cancelled"
  if [ -d "$TARGET" ]; then
    pk_is_ours "$TARGET" || pk_die "$PK_E_FAILED" "$TARGET is not a Claude Persian Kit copy; leaving it alone"
    rm -rf "$TARGET"
  fi
  if [ -f "$LAUNCHER" ] && grep -q "$LAUNCHER_TAG" "$LAUNCHER"; then rm -f "$LAUNCHER"; fi
  if [ -f "$DESKTOP_FILE" ] && grep -q 'X-Claude-Persian-Kit=true' "$DESKTOP_FILE"; then rm -f "$DESKTOP_FILE"; fi
  rm -rf "$KIT_DIR/extracted" "$KIT_DIR/Claude-Persian.new"
  pk_log "Removed. Your original Claude Desktop was never changed."
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
      --path)
        [ $((i + 1)) -lt "${#args[@]}" ] || pk_die "$PK_E_USAGE" "--path needs a value"
        SOURCE_PATH="${args[$((i + 1))]}"
        i=$((i + 1))
        ;;
      --no-sandbox) NO_SANDBOX=1 ;;
      *) pk_die "$PK_E_USAGE" "unknown option ${args[$i]}" ;;
    esac
    i=$((i + 1))
  done
  case "$command" in
    install) cmd_install ;;
    status) cmd_status ;;
    uninstall) cmd_uninstall ;;
    detect) cmd_detect ;;
    -h | --help | help) usage ;;
    *) usage; exit "$PK_E_USAGE" ;;
  esac
}

main "$@"
