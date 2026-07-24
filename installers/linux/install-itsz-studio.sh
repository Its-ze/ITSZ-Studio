#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${ITSZ_STUDIO_DOWNLOADS_URL:-https://its-ze.github.io/ITSZ-Studio/downloads}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

install_runtime_deps() {
  if need_cmd apt-get; then
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl python3 libgtk-3-0 libnss3 libxss1 libasound2t64 xdg-utils || \
      sudo apt-get install -y ca-certificates curl python3 libgtk-3-0 libnss3 libxss1 libasound2 xdg-utils
    sudo apt-get install -y libfuse2 || true
    sudo apt-get install -y gvfs-backends gvfs-fuse gphoto2 libglib2.0-bin || true
  elif need_cmd dnf; then
    sudo dnf install -y ca-certificates curl python3 gtk3 nss libXScrnSaver alsa-lib fuse-libs xdg-utils
    sudo dnf install -y gvfs-gphoto2 gvfs-mtp gvfs-fuse gphoto2 glib2 || true
  elif need_cmd pacman; then
    sudo pacman -Sy --needed --noconfirm ca-certificates curl python gtk3 nss libxss alsa-lib fuse2 xdg-utils
    sudo pacman -Sy --needed --noconfirm gvfs gvfs-gphoto2 gvfs-mtp gphoto2 glib2 || true
  elif need_cmd zypper; then
    sudo zypper --non-interactive install ca-certificates curl python3 gtk3 nss libXScrnSaver alsa libfuse2 xdg-utils
    sudo zypper --non-interactive install gvfs-backends gvfs-fuse gphoto2 glib2-tools || true
  else
    echo "Unsupported package manager. Install curl, python3, GTK3, NSS, XSS, ALSA, FUSE, xdg-utils, gvfs-backends, gvfs-fuse, and gphoto2, then rerun." >&2
    exit 1
  fi
}

install_runtime_deps

curl -fsSL "$BASE_URL/updates.json" -o "$WORK_DIR/updates.json"
VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$WORK_DIR/updates.json")"
DEB_URL="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["installers"]["linux"].get("deb") or "")' "$WORK_DIR/updates.json")"
APPIMAGE_URL="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["installers"]["linux"].get("appImage") or "")' "$WORK_DIR/updates.json")"
DEB_SHA256="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("verification",{}).get("artifacts",{}).get("linuxDeb",{}).get("sha256") or "")' "$WORK_DIR/updates.json")"
APPIMAGE_SHA256="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("verification",{}).get("artifacts",{}).get("linuxAppImage",{}).get("sha256") or "")' "$WORK_DIR/updates.json")"

if [[ -n "$DEB_URL" ]] && need_cmd apt-get; then
  if [[ -z "$DEB_SHA256" ]]; then
    echo "No deb SHA-256 is listed in $BASE_URL/updates.json" >&2
    exit 1
  fi
  DEB_PATH="$WORK_DIR/itsz-studio.deb"
  echo "Downloading ITSZ's Studio $VERSION deb package..."
  curl -fL "$DEB_URL" -o "$DEB_PATH"
  printf '%s  %s\n' "$DEB_SHA256" "$DEB_PATH" | sha256sum -c -
  sudo apt-get install -y "$DEB_PATH"
elif [[ -n "$APPIMAGE_URL" ]]; then
  if [[ -z "$APPIMAGE_SHA256" ]]; then
    echo "No AppImage SHA-256 is listed in $BASE_URL/updates.json" >&2
    exit 1
  fi
  INSTALL_DIR="${HOME}/.local/opt/itsz-studio"
  BIN_DIR="${HOME}/.local/bin"
  DESKTOP_DIR="${HOME}/.local/share/applications"
  mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$DESKTOP_DIR"
  APPIMAGE_PATH="$INSTALL_DIR/ITSZ-Studio.AppImage"
  echo "Downloading ITSZ's Studio $VERSION AppImage..."
  curl -fL "$APPIMAGE_URL" -o "$APPIMAGE_PATH"
  printf '%s  %s\n' "$APPIMAGE_SHA256" "$APPIMAGE_PATH" | sha256sum -c -
  chmod +x "$APPIMAGE_PATH"
  ln -sf "$APPIMAGE_PATH" "$BIN_DIR/itsz-studio"
  cat > "$DESKTOP_DIR/itsz-studio.desktop" <<DESKTOP
[Desktop Entry]
Name=ITSZ's Studio
Comment=Photo viewer and editor
Exec=$APPIMAGE_PATH
Icon=itsz-studio
Terminal=false
Type=Application
Categories=Graphics;Photography;
DESKTOP
  update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
else
  echo "No Linux installer is listed in $BASE_URL/updates.json" >&2
  exit 1
fi

echo "ITSZ's Studio $VERSION installed."
