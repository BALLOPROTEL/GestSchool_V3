#!/usr/bin/env bash
set -euo pipefail

if [[ "${CODESPACES:-}" != "true" ]]; then
  exit 0
fi

corepack enable
corepack prepare pnpm@10.24.0 --activate

if [[ ! -d node_modules ]]; then
  echo "[GestSchool] node_modules missing; installing workspace dependencies..."
  pnpm install --frozen-lockfile
  pnpm db:generate
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

upsert_env() {
  local key="$1"
  local value="$2"

  if grep -q "^\${key}=" .env; then
    sed -i "s|^\${key}=.*|\${key}=\${value}|" .env
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

web_origin="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"

upsert_env "IAM_ALLOWED_ORIGINS" "http://localhost:3000,http://127.0.0.1:3000,${web_origin}"
upsert_env "APP_PUBLIC_ORIGIN" "${web_origin}"
upsert_env "DOCUMENT_PUBLIC_ORIGIN" "${web_origin}"
upsert_env "API_INTERNAL_URL" "http://127.0.0.1:3100"

echo "[GestSchool] Codespaces URL configured: ${web_origin}"
echo "[GestSchool] Run 'pnpm infra:up' then 'pnpm dev' when you want to work."
