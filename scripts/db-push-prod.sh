#!/usr/bin/env bash
#
# Safe wrapper around `drizzle-kit push` for prod.
#
# Loads `.env.prod` (so DATABASE_URL points at prod) and invokes drizzle-kit
# push interactively — it prints the diff, flags destructive statements, and
# prompts before applying. No data is touched until you confirm in the prompt.
#
# Override with `FORCE=1 ./scripts/db-push-prod.sh` to apply without the
# prompt (drizzle-kit's `--force` flag). Use with care.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.prod ]; then
  echo "❌ .env.prod not found in $(pwd)"
  exit 1
fi

echo "→ Pushing schema to prod via drizzle-kit..."
echo "   drizzle-kit will print the diff and prompt before applying anything."
echo

if [ "${FORCE:-0}" = "1" ]; then
  echo "FORCE=1 set — applying without confirmation."
  echo
  exec npx dotenvx run -f .env.prod -- npx drizzle-kit push --config drizzle.config.ts --force
else
  exec npx dotenvx run -f .env.prod -- npx drizzle-kit push --config drizzle.config.ts
fi
