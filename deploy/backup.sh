#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${CORELINE_BACKUP_DIR:-/var/backups/coreline}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="${BACKUP_DIR}/coreline-${STAMP}.sql.gz"
TEMP_TARGET="${TARGET}.tmp"

install -d -m 0700 "$BACKUP_DIR"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  printf 'Missing %s/.env. Run setup-ip.sh first.\n' "$SCRIPT_DIR" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

cleanup() {
  rm -f -- "$TEMP_TARGET"
}
trap cleanup EXIT

docker compose --env-file .env exec -T db \
  pg_dump --clean --if-exists --no-owner \
  --username "${POSTGRES_USER:-coreline}" \
  --dbname "${POSTGRES_DB:-coreline}" \
  | gzip -9 > "$TEMP_TARGET"

test -s "$TEMP_TARGET"
mv -- "$TEMP_TARGET" "$TARGET"
chmod 0600 "$TARGET"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'coreline-*.sql.gz' -mtime +14 -delete

printf 'CORELINE backup created: %s\n' "$TARGET"
