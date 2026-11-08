#!/usr/bin/env bash
# Ships the version in updates/ by pushing it to GitHub (main). Every installed copy of Incinerator sees it
# the next time it opens (or within 6 hours) and asks its player before installing.
#
# RULE: only run this after the owner has said yes, in the chat, to sending this exact version.
#   bash scripts/publish.sh --owner-said-yes
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" != "--owner-said-yes" ]; then
  echo "Not published. Ask the owner first, then run: bash scripts/publish.sh --owner-said-yes" >&2
  exit 1
fi

VER=$(node -p "require('./package.json').version")
[ -f updates/latest.json ] || { echo "updates/latest.json is missing: run node scripts/make-release.js first" >&2; exit 1; }
[ "$(node -p "require('./updates/latest.json').version")" = "$VER" ] || { echo "updates/latest.json is for another version" >&2; exit 1; }
[ -z "$(git status --porcelain -- . ':!updates')" ] || { echo "Commit your code changes first" >&2; exit 1; }

git add updates
git diff --cached --quiet || git commit -q -m "Ship $VER

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin HEAD:main
echo "Shipped $VER: installed copies will offer it next time they open."
