#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Run this command with sudo or as root.\n' >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
MODEL="gpt-5.6-luna"

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'deploy/.env does not exist. Run deploy/setup-ip.sh first.\n' >&2
  exit 1
fi

printf 'Enter the OpenAI API key in this server console.\n'
printf 'The key stays hidden, is stored only in deploy/.env, and is never printed.\n'
read -r -s -p 'OpenAI API key: ' CORELINE_OPENAI_KEY
printf '\n'

cleanup() {
  unset CORELINE_OPENAI_KEY
}
trap cleanup EXIT

if [[ ${#CORELINE_OPENAI_KEY} -lt 20 ]]; then
  printf 'The key is empty or too short. Nothing was changed.\n' >&2
  exit 1
fi

export CORELINE_OPENAI_KEY
python3 - "$ENV_FILE" "$MODEL" <<'PY'
import os
import pathlib
import stat
import sys
import tempfile

env_path = pathlib.Path(sys.argv[1])
model = sys.argv[2]
key = os.environ.get("CORELINE_OPENAI_KEY", "")
if not key or any(char in key for char in "\r\n\0"):
    raise SystemExit("Invalid API key input. Nothing was changed.")

updates = {
    "PUBLIC_INTEGRATIONS_ENABLED": "true",
    "OPENAI_API_KEY": key,
    "OPENAI_MODEL": model,
}

lines = env_path.read_text(encoding="utf-8").splitlines()
seen: set[str] = set()
next_lines: list[str] = []
for line in lines:
    name = line.split("=", 1)[0] if "=" in line and not line.lstrip().startswith("#") else ""
    if name in updates:
        next_lines.append(f"{name}={updates[name]}")
        seen.add(name)
    else:
        next_lines.append(line)
for name, value in updates.items():
    if name not in seen:
        next_lines.append(f"{name}={value}")

fd, temporary = tempfile.mkstemp(prefix=".env.", dir=env_path.parent)
try:
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write("\n".join(next_lines) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, stat.S_IRUSR | stat.S_IWUSR)
    os.replace(temporary, env_path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY

unset CORELINE_OPENAI_KEY
trap - EXIT

cd "$SCRIPT_DIR"
docker compose --env-file .env up --detach --build --force-recreate api

for _ in {1..30}; do
  if curl --fail --silent 'http://127.0.0.1:8000/api/health/ready' >/dev/null; then
    break
  fi
  sleep 2
done

curl --fail --silent --show-error 'http://127.0.0.1:8000/api/health/ready' >/dev/null
STATUS="$(curl --fail --silent --show-error 'http://127.0.0.1:8000/api/v1/integrations/status')"
python3 - "$MODEL" "$STATUS" <<'PY'
import json
import sys

model = sys.argv[1]
status = json.loads(sys.argv[2])
if not status.get("ai", {}).get("available"):
    raise SystemExit("CORELINE restarted, but AI is not marked available. Run deploy/doctor.sh.")
print(f"CORELINE real AI is configured with {model}.")
print("The first consented request will verify the key, project billing, and provider availability.")
print("No API key was printed.")
PY
