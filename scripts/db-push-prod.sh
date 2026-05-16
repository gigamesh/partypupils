#!/usr/bin/env bash
# Safe wrapper around `prisma db push` for prod.
#
# 1. Loads .env.prod (so DATABASE_URL points at prod).
# 2. Prints the exact SQL that `db push` would apply.
# 3. Flags destructive statements (DROP / ALTER ... DROP / TRUNCATE).
# 4. Requires the operator to type `yes` before applying.
#
# Override with `FORCE=1 ./scripts/db-push-prod.sh` to skip the prompt (use with care).
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.prod ]; then
  echo "❌ .env.prod not found in $(pwd)"
  exit 1
fi

echo "→ Computing schema diff against prod..."
echo

# `--from-config-datasource` reads the URL from prisma.config.ts, which is
# `process.env.DATABASE_URL` — so loading .env.prod makes it point at prod.
# `--exit-code` returns: 0 = no changes, 2 = has changes, 1 = error.
set +e
DIFF=$(npx dotenv -e .env.prod -- npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script \
  --exit-code 2>&1)
DIFF_STATUS=$?
set -e

case "$DIFF_STATUS" in
  0)
    echo "✅ No schema changes. Nothing to push."
    exit 0
    ;;
  2)
    ;; # has changes, fall through
  *)
    echo "❌ Failed to compute diff:"
    echo "$DIFF"
    exit 1
    ;;
esac

echo "─── SQL that would be applied to prod ───"
echo "$DIFF" | grep -v "^Loaded Prisma config" | sed '/./,$!d'
echo "─────────────────────────────────────────"
echo

if echo "$DIFF" | grep -qiE '\b(DROP|TRUNCATE)\b'; then
  echo "⚠️  WARNING: diff contains DROP / TRUNCATE statements. Data loss is possible."
  echo "   Make sure you've taken a backup before continuing."
  echo
fi

if [ "${FORCE:-0}" = "1" ]; then
  echo "FORCE=1 set — skipping confirmation."
else
  read -r -p "Apply these changes to prod? Type 'yes' to confirm: " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
fi

echo
echo "→ Running prisma db push against prod..."
npx dotenv -e .env.prod -- npx prisma db push
