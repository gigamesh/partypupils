#!/usr/bin/env bash
#
# Pull the latest prod data into db/seed.sql, scrubbed of PII.
#
# 1. pg_dumps the catalog + order tables from prod (read-only, via .env.prod).
# 2. Loads them into the local dev DB — DESTRUCTIVE: truncates the existing
#    catalog/orders first. Anything you added locally during dev is wiped.
# 3. Replaces real emails with deterministic `customer-<hash>@example.com`
#    addresses, fakes Stripe live IDs as `cs_test_seed_*` / `pi_test_seed_*`,
#    and regenerates download token UUIDs.
# 4. Re-dumps the scrubbed local data to db/seed.sql.
#
# After running, `pnpm db:reset && pnpm dev` rebuilds the local DB from the
# now-fresh, scrubbed seed.
set -euo pipefail
cd "$(dirname "$0")/.."

LOCAL_URL=$(npx dotenvx -q run -f .env -- bash -c 'printf "%s" "$DATABASE_URL"')
PROD_URL=$(npx dotenvx -q run -f .env.prod -- bash -c 'printf "%s" "$DATABASE_URL"')

if [[ ! "$LOCAL_URL" =~ localhost|127\.0\.0\.1 ]]; then
  echo "❌ Refusing to refresh: .env DATABASE_URL doesn't point at localhost"
  echo "   (got: ${LOCAL_URL:0:40}...)"
  exit 1
fi

PROD_URL_WITH_SSL="${PROD_URL}&sslrootcert=system"
TABLES="releases tracks track_files orders order_items download_tokens site_settings links link_pages link_page_items"
TABLES_CSV=$(echo $TABLES | tr ' ' ',')
DUMP_ARGS=""
for t in $TABLES; do DUMP_ARGS+=" -t $t"; done

echo "→ Dumping prod data..."
pg_dump --data-only --no-owner --no-privileges $DUMP_ARGS "$PROD_URL_WITH_SSL" > /tmp/pp-prod-raw.sql

echo "→ Loading into local DB (truncates first)..."
psql "$LOCAL_URL" -c "TRUNCATE $TABLES_CSV RESTART IDENTITY CASCADE;" >/dev/null
psql "$LOCAL_URL" -f /tmp/pp-prod-raw.sql >/dev/null

echo "→ Scrubbing PII..."
psql "$LOCAL_URL" <<'SQL' >/dev/null
BEGIN;
UPDATE orders
  SET email = 'customer-' || substring(md5(email) FROM 1 FOR 12) || '@example.com';
UPDATE orders
  SET "stripeSessionId" = CASE WHEN "stripeSessionId" IS NOT NULL THEN 'cs_test_seed_' || lpad(id::text, 18, '0') END,
      "stripePaymentId" = CASE WHEN "stripePaymentId" IS NOT NULL THEN 'pi_test_seed_' || lpad(id::text, 18, '0') END;
UPDATE download_tokens SET token = gen_random_uuid()::text;
COMMIT;
SQL

echo "→ Re-dumping scrubbed data to db/seed.sql..."
pg_dump --data-only --no-owner --no-privileges $DUMP_ARGS "$LOCAL_URL" > db/seed.sql

rm -f /tmp/pp-prod-raw.sql

ORDER_COUNT=$(psql "$LOCAL_URL" -tAc "SELECT count(*) FROM orders;")
echo "✅ db/seed.sql refreshed ($ORDER_COUNT orders, PII scrubbed)"
