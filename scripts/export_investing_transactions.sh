#!/usr/bin/env bash
# Export investing transactions from the LUMNA Postgres DB to CSV.
# Run this ON THE VM (it needs the production DB password).
#
#   ssh azureuser@20.86.130.108
#   cd /home/azureuser/Chess
#   bash scripts/export_investing_transactions.sh
#
# Output: investing_transactions_export.csv in the current directory.
set -euo pipefail

# --- DB connection (matches backend/database.py env vars) -------------------
# If the backend's env isn't already exported in your shell, point this at the
# file that defines DB_PASSWORD (e.g. a .env or systemd EnvironmentFile).
ENV_FILE="${ENV_FILE:-}"
if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
  set -a; . "$ENV_FILE"; set +a
fi

export PGHOST="${DB_HOST:-localhost}"
export PGPORT="${DB_PORT:-5432}"
export PGDATABASE="${DB_NAME:-lumna}"
export PGUSER="${DB_USER:-lumna}"
export PGPASSWORD="${DB_PASSWORD:?DB_PASSWORD not set. Run: ENV_FILE=/path/to/.env bash $0}"

OUT="investing_transactions_export.csv"

# --- 1) Does the table still exist, and how many rows? ----------------------
echo "Checking whether portfolio_transactions still exists..."
EXISTS=$(psql -tAc "SELECT to_regclass('public.portfolio_transactions') IS NOT NULL;")
if [[ "$EXISTS" != "t" ]]; then
  echo "RESULT: table 'portfolio_transactions' does NOT exist. The data was dropped."
  exit 1
fi

COUNT=$(psql -tAc "SELECT count(*) FROM portfolio_transactions;")
echo "RESULT: table exists with $COUNT row(s)."
if [[ "$COUNT" -eq 0 ]]; then
  echo "Table is empty. Nothing to export."
  exit 0
fi

# --- 2) Export everything, joined with account name/bank --------------------
# SELECT pt.* so the export survives any extra columns added by later
# migrations (e.g. price_currency), plus human-readable account info.
psql -c "\copy (
  SELECT pt.*, ia.name AS account_name, ia.bank AS account_bank
  FROM portfolio_transactions pt
  LEFT JOIN investment_accounts ia ON ia.id = pt.account_id
  ORDER BY pt.transaction_date, pt.id
) TO '$OUT' WITH CSV HEADER"

echo "Done. Wrote $COUNT transactions to: $(pwd)/$OUT"
