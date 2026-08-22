#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  printf 'Missing %s/.env. Run setup-ip.sh first.\n' "$SCRIPT_DIR" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

printf '== Containers ==\n'
docker compose --env-file .env ps

printf '\n== Local API ==\n'
curl --fail --silent --show-error http://127.0.0.1:8000/api/health/ready
printf '\n\n== Public HTTPS ==\n'
curl --fail --silent --show-error "https://${CORELINE_IPV4}/api/health"
printf '\n\n== Certificate ==\n'
openssl s_client -connect "${CORELINE_IPV4}:443" -servername "$CORELINE_IPV4" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

printf '\n== Timers ==\n'
systemctl --no-pager --full status coreline-cert-renew.timer coreline-backup.timer \
  | sed -n '1,28p'
