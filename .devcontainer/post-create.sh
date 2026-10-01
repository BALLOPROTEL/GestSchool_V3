#!/usr/bin/env bash
set -euo pipefail

echo "[GestSchool] Preparing the Codespaces development environment..."

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[GestSchool] pnpm is missing; enabling Corepack with elevated permissions..."
  sudo corepack enable
  sudo corepack prepare pnpm@10.24.0 --activate
fi

echo "[GestSchool] Using pnpm $(pnpm -v)"

pnpm install --frozen-lockfile
pnpm db:generate

echo
echo "[GestSchool] Codespace dependencies are ready."
echo "[GestSchool] Infrastructure is intentionally NOT started automatically to preserve free quota."
echo "[GestSchool] Start work with:"
echo "  pnpm infra:up"
echo "  pnpm infra:check"
echo "  pnpm db:migrate:deploy"
echo "  pnpm db:seed       # only when you need a seeded disposable development database"
echo "  pnpm dev"
