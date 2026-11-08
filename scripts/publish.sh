#!/usr/bin/env bash
# Publishes out/release-<version>/ as GitHub release v<version>. Every installed copy of The Incinerator
# picks it up within a few hours, or on its next start.
#
# RULE: only run this after the owner has said yes, in the chat, to publishing this exact version.
#   bash scripts/publish.sh --owner-said-yes
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" != "--owner-said-yes" ]; then
  echo "Not published. Ask the owner first, then run: bash scripts/publish.sh --owner-said-yes" >&2
  exit 1
fi

REPO=$(node -p "require('./package.json').incinerator.repo")
VER=$(node -p "require('./package.json').version")
DIR="out/release-$VER"
[ -f "$DIR/latest.json" ] || { echo "$DIR/latest.json is missing: run node scripts/make-release.js first" >&2; exit 1; }
[ "$(node -p "require('./$DIR/latest.json').version")" = "$VER" ] || { echo "latest.json is for another version" >&2; exit 1; }
git diff --quiet HEAD -- || { echo "Commit your changes first" >&2; exit 1; }

git push origin HEAD:main
git tag -f "v$VER"
git push -f origin "v$VER"
gh release create "v$VER" "$DIR"/*.pak "$DIR"/latest.json $(ls "$DIR"/*.exe 2>/dev/null) \
  --repo "$REPO" --title "The Incinerator $VER" --notes-file "$DIR/notes.txt" --verify-tag
echo "Published v$VER: https://github.com/$REPO/releases/tag/v$VER"
