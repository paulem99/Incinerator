#!/usr/bin/env bash
# Builds "out/Incinerator Setup.exe" (a per-user Windows installer) on Linux. Nothing else to install on the PC:
# it carries castLabs Electron (Widevine), the app, and a portable Python with castlabs-evs for one-time VMP signing.
#
#   bash scripts/build-installer.sh
# Downloads go to vendor/ (gitignored) and are reused next time.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
VER=$(node -p "require('./package.json').version")
SHELLV=$(node -p "require('./package.json').incinerator.shell")
ECS_TAG="v${SHELLV}+wvcus"
PBS_TAG=20261020
PBS_FILE="cpython-3.12.15+${PBS_TAG}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz"
EVS_VER=1.3.3
VENDOR=${VENDOR:-$ROOT/vendor}
BUILD="$ROOT/out/build/The Incinerator"
mkdir -p "$VENDOR" "$ROOT/out"

fetch() { [ -s "$2" ] || { echo "downloading $(basename "$2")"; curl -fL --retry 3 -o "$2.part" "$1" && mv "$2.part" "$2"; }; }

# 1. castLabs Electron for Windows (Widevine-enabled build).
fetch "https://github.com/castlabs/electron-releases/releases/download/${ECS_TAG}/electron-${ECS_TAG}-win32-x64.zip" "$VENDOR/ecs-win-${SHELLV}.zip"

# 2. Portable Python for Windows with castlabs-evs (signing runs on the user's PC: EVS isn't reachable from here).
PYEVS="$VENDOR/pyevs-${EVS_VER}"
if [ ! -f "$PYEVS/python.exe" ]; then
  fetch "https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${PBS_FILE}" "$VENDOR/$PBS_FILE"
  rm -rf "$PYEVS.tmp" && mkdir -p "$PYEVS.tmp"
  tar -xzf "$VENDOR/$PBS_FILE" -C "$PYEVS.tmp"
  python3 -m pip install --quiet --disable-pip-version-check --target "$PYEVS.tmp/python/Lib/site-packages" \
    --platform win_amd64 --python-version 3.12 --implementation cp --only-binary=:all: "castlabs-evs==${EVS_VER}"
  # botocore ships data for every AWS service; EVS only talks to S3 and Cognito.
  BD="$PYEVS.tmp/python/Lib/site-packages/botocore/data"
  find "$BD" -mindepth 1 -maxdepth 1 -type d ! -name s3 ! -name cognito-idp -exec rm -rf {} +
  rm -rf "$PYEVS" && mv "$PYEVS.tmp/python" "$PYEVS" && rm -rf "$PYEVS.tmp"
fi

# 3. makensis: from PATH, from electron-builder's cache, or electron-builder's prebuilt NSIS.
MAKENSIS=$(command -v makensis || true); NSISDIR_ARG=""
if [ -z "$MAKENSIS" ]; then
  N=$(ls -d "$HOME"/.cache/electron-builder/nsis-3.0.4.1/nsis-3.0.4.1* 2>/dev/null | head -1 || true)
  if [ -z "$N" ]; then
    N="$VENDOR/nsis-3.0.4.1"
    if [ ! -x "$N/linux/makensis" ]; then
      fetch "https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z" "$VENDOR/nsis-3.0.4.1.7z"
      python3 -c "import py7zr" 2>/dev/null || python3 -m pip install --quiet --break-system-packages py7zr
      rm -rf "$N" && mkdir -p "$N" && python3 -c "import py7zr,sys; py7zr.SevenZipFile(sys.argv[1]).extractall(sys.argv[2])" "$VENDOR/nsis-3.0.4.1.7z" "$N"
      chmod +x "$N/linux/makensis"
    fi
  fi
  MAKENSIS="$N/linux/makensis"; NSISDIR_ARG="$N"
fi

# 4. Assemble the app folder exactly as it lands on the PC.
[ -f node_modules/music-metadata/package.json ] || npm ci --omit=dev
rm -rf "$BUILD" && mkdir -p "$BUILD"
python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$VENDOR/ecs-win-${SHELLV}.zip" "$BUILD"
mv "$BUILD/electron.exe" "$BUILD/The Incinerator.exe"
mv "$BUILD/electron.exe.sig" "$BUILD/The Incinerator.exe.sig"
rm -f "$BUILD/resources/default_app.asar"
mkdir -p "$BUILD/resources/app"
cp -r package.json boot.js src assets node_modules "$BUILD/resources/app/"
rm -rf "$BUILD/resources/app/node_modules/.bin" "$BUILD/resources/app/node_modules/.package-lock.json"
cp -r "$PYEVS" "$BUILD/resources/pyevs"
SHELLVER_FILE=$(cat "$BUILD/version")

# 5. Installer.
[ -n "$NSISDIR_ARG" ] && export NSISDIR="$NSISDIR_ARG"
"$MAKENSIS" -V2 \
  -DVERSION="$VER" -DSHELLVER="$SHELLVER_FILE" -DSRC="$BUILD" -DOUTFILE="$ROOT/out/Incinerator Setup.exe" -DICO="$ROOT/assets/icon.ico" \
  installer.nsi
ls -l "$ROOT/out/Incinerator Setup.exe"
