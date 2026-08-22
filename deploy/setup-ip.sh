#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run this installer with sudo or as root.\n' >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  printf 'Usage: sudo bash deploy/setup-ip.sh PUBLIC_IPV4\n' >&2
  exit 1
fi

CORELINE_IPV4="$1"
python3 - "$CORELINE_IPV4" <<'PY'
import ipaddress
import sys

try:
    address = ipaddress.ip_address(sys.argv[1])
except ValueError as exc:
    raise SystemExit(f"Invalid IP address: {exc}")
if address.version != 4 or not address.is_global:
    raise SystemExit("Use the public IPv4 address shown in the aitch.systems panel.")
PY

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${SCRIPT_DIR}/.env"
NGINX_AVAILABLE="/etc/nginx/sites-available/coreline"
NGINX_ENABLED="/etc/nginx/sites-enabled/coreline"
CERT_DIR="/etc/letsencrypt/live/${CORELINE_IPV4}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install --yes ca-certificates curl git gnupg nginx openssl python3 snapd

install -m 0755 -d /etc/apt/keyrings
curl --fail --silent --show-error --location \
  https://download.docker.com/linux/ubuntu/gpg \
  --output /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

. /etc/os-release
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF

apt-get update
apt-get install --yes docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker nginx

if snap list core >/dev/null 2>&1; then
  snap refresh core
else
  snap install core
fi
if ! snap list certbot >/dev/null 2>&1; then
  snap install --classic certbot
else
  snap refresh certbot
fi
ln -sfn /snap/bin/certbot /usr/local/bin/certbot

CERTBOT_MAJOR="$(certbot --version 2>&1 | awk '{print $2}' | cut -d. -f1)"
CERTBOT_MINOR="$(certbot --version 2>&1 | awk '{print $2}' | cut -d. -f2)"
if [[ -z "$CERTBOT_MAJOR" || -z "$CERTBOT_MINOR" ]] \
  || (( CERTBOT_MAJOR < 5 || (CERTBOT_MAJOR == 5 && CERTBOT_MINOR < 4) )); then
  printf 'Certbot 5.4 or newer is required for public IP certificates.\n' >&2
  exit 1
fi

install -d -m 0755 /var/www/coreline-certbot
sed "s/__CORELINE_IPV4__/${CORELINE_IPV4}/g" \
  "${SCRIPT_DIR}/nginx/coreline-bootstrap.conf.template" > "$NGINX_AVAILABLE"
ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

if [[ ! -s "${CERT_DIR}/fullchain.pem" || ! -s "${CERT_DIR}/privkey.pem" ]]; then
  certbot certonly \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email \
    --cert-name "$CORELINE_IPV4" \
    --preferred-profile shortlived \
    --webroot \
    --webroot-path /var/www/coreline-certbot \
    --ip-address "$CORELINE_IPV4"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  umask 077
  POSTGRES_PASSWORD="$(openssl rand -hex 32)"
  PUSH_CRON_SECRET="$(openssl rand -hex 32)"
  VAPID_TEMP="$(mktemp /tmp/coreline-vapid.XXXXXX.pem)"
  trap 'rm -f -- "${VAPID_TEMP:-}"' EXIT
  openssl ecparam -genkey -name prime256v1 -noout -out "$VAPID_TEMP"
  VAPID_PUBLIC_KEY="$(openssl ec -in "$VAPID_TEMP" -pubout -outform DER 2>/dev/null \
    | tail -c 65 | base64 -w 0 | tr '/+' '_-' | tr -d '=')"
  VAPID_PRIVATE_KEY="$(openssl ec -in "$VAPID_TEMP" -outform DER 2>/dev/null \
    | tail -c +8 | head -c 32 | base64 -w 0 | tr '/+' '_-' | tr -d '=')"

  cat > "$ENV_FILE" <<EOF
CORELINE_IPV4=${CORELINE_IPV4}
POSTGRES_DB=coreline
POSTGRES_USER=coreline
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql+psycopg://coreline:${POSTGRES_PASSWORD}@db:5432/coreline
CORS_ORIGINS=https://weeeedddd.github.io
MEDIA_DIR=/app/media
PUBLIC_INTEGRATIONS_ENABLED=false
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
VAPID_SUBJECT=https://${CORELINE_IPV4}
PUSH_CRON_SECRET=${PUSH_CRON_SECRET}
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
GOOGLE_MAPS_API_KEY=
GOOGLE_GEOCODING_API_KEY=
GOOGLE_PLACES_API_KEY=
INTEGRATION_TIMEOUT_SECONDS=15
INTEGRATION_MAX_REQUEST_BYTES=32768
INTEGRATION_MAX_RESPONSE_BYTES=524288
AI_PLAN_RATE_LIMIT_PER_MINUTE=6
AI_ASSISTANT_RATE_LIMIT_PER_MINUTE=12
STORE_SEARCH_RATE_LIMIT_PER_MINUTE=20
EOF
  chmod 0600 "$ENV_FILE"
elif ! grep -qx "CORELINE_IPV4=${CORELINE_IPV4}" "$ENV_FILE"; then
  printf 'deploy/.env belongs to a different IP. Stop and migrate explicitly.\n' >&2
  exit 1
fi

cd "$SCRIPT_DIR"
docker compose --env-file .env up --detach --build --remove-orphans

sed "s/__CORELINE_IPV4__/${CORELINE_IPV4}/g" \
  "${SCRIPT_DIR}/nginx/coreline.conf.template" > "$NGINX_AVAILABLE"
nginx -t
systemctl reload nginx

install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/coreline-nginx <<'EOF'
#!/usr/bin/env sh
set -eu
nginx -t
systemctl reload nginx
EOF
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/coreline-nginx

cat > /etc/systemd/system/coreline-cert-renew.service <<'EOF'
[Unit]
Description=Renew CORELINE short-lived HTTPS certificate
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/snap/bin/certbot renew --quiet
EOF

cat > /etc/systemd/system/coreline-cert-renew.timer <<'EOF'
[Unit]
Description=Check CORELINE HTTPS certificate twice daily

[Timer]
OnCalendar=*-*-* 03,15:17:00
RandomizedDelaySec=1800
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/coreline-backup.service <<EOF
[Unit]
Description=Back up the CORELINE PostgreSQL database
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
Environment=CORELINE_BACKUP_DIR=/var/backups/coreline
ExecStart=${REPO_DIR}/deploy/backup.sh
EOF

cat > /etc/systemd/system/coreline-backup.timer <<'EOF'
[Unit]
Description=Daily CORELINE database backup

[Timer]
OnCalendar=*-*-* 04:10:00
RandomizedDelaySec=900
Persistent=true

[Install]
WantedBy=timers.target
EOF

chmod 0755 "${SCRIPT_DIR}/backup.sh" "${SCRIPT_DIR}/doctor.sh"
systemctl daemon-reload
systemctl enable --now coreline-cert-renew.timer coreline-backup.timer

for _ in {1..30}; do
  if curl --fail --silent "http://127.0.0.1:8000/api/health/ready" >/dev/null; then
    break
  fi
  sleep 2
done

curl --fail --silent --show-error "https://${CORELINE_IPV4}/api/health" >/dev/null
printf '\nCORELINE backend is live: https://%s\n' "$CORELINE_IPV4"
printf 'No password, database secret, or private VAPID key was printed.\n'
printf 'Run sudo %s/deploy/doctor.sh for a health check.\n' "$REPO_DIR"
