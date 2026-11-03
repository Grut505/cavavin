#!/usr/bin/env bash
# Régénère les captures du teaser : build de l'appli, serveur local, parcours Playwright (données fictives).
set -euo pipefail
cd "$(dirname "$0")/../.."
export PLAYWRIGHT_CORE="${PLAYWRIGHT_CORE:-$HOME/cv/node_modules/playwright-core}"
npm run build
node scripts/teaser/capture.mjs
