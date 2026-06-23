#!/usr/bin/env bash
# Permanently delete the DEMO investing account and all its transactions.
# Run this ON THE VM (it needs the production DB password).
#
#   ssh azureuser@20.86.130.108
#   cd /home/azureuser/Chess
#   ENV_FILE=backend/.env.prod bash scripts/delete_demo_account.sh
#
# The DEMO rows are already backed up in investing_transactions_export.csv
# (the earlier full export of all 166 transactions), so this is reversible.
set -euo pipefail

ENV_FILE="${ENV_FILE:-}"
if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
  set -a; . "$ENV_FILE"; set +a
fi

export PGHOST="${DB_HOST:-localhost}"
export PGPORT="${DB_PORT:-5432}"
export PGDATABASE="${DB_NAME:-lumna}"
export PGUSER="${DB_USER:-lumna}"
export PGPASSWORD="${DB_PASSWORD:?DB_PASSWORD not set. Run: ENV_FILE=backend/.env.prod bash $0}"

# Identify DEMO accounts (by name) and count what would be removed.
echo "DEMO accounts found:"
psql -c "SELECT id, user_id, name, bank FROM investment_accounts WHERE name = 'DEMO';"

TX=$(psql -tAc "SELECT count(*) FROM portfolio_transactions
                WHERE account_id IN (SELECT id FROM investment_accounts WHERE name = 'DEMO');")
echo "Transactions tied to DEMO account(s): $TX"

if [[ "$TX" -eq 0 ]] && [[ "$(psql -tAc "SELECT count(*) FROM investment_accounts WHERE name='DEMO';")" -eq 0 ]]; then
  echo "Nothing to delete."
  exit 0
fi

# Delete transactions first (FK), then the account rows. Single transaction.
psql -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DELETE FROM portfolio_transactions
 WHERE account_id IN (SELECT id FROM investment_accounts WHERE name = 'DEMO');
DELETE FROM investment_accounts WHERE name = 'DEMO';
COMMIT;
SQL

echo "Done. DEMO account and its transactions removed."
