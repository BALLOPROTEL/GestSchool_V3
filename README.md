# GestSchool

Monorepo SaaS GestSchool : fondation technique, interface visuelle et infrastructure locale des
LOTS 0 à 2. Le frontend conserve uniquement des données fictives ; PostgreSQL, Redis et MinIO ne
portent encore aucune logique métier.

## Prérequis

- Node.js 24 LTS (version de référence : `24.20.0`)
- pnpm `10.24.0`

## Commandes

```bash
pnpm install
pnpm infra:up
pnpm infra:check
pnpm exec playwright install chromium
pnpm dev
pnpm build
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm infra:down
```

Playwright peut demander les bibliothèques système Chromium usuelles sur une image Linux minimale.

Applications locales :

- Web : `http://localhost:3000`
- API : `http://localhost:3100/health/live` et `http://localhost:3100/health/ready`
- MinIO : API `http://localhost:9000`, interface `http://localhost:9001`
- Worker : processus NestJS sans serveur HTTP public

Consultez [`docs/README.md`](docs/README.md) pour le périmètre courant et
[`docs/design/template-audit.md`](docs/design/template-audit.md) pour l'audit du contrat visuel.
Le guide complet de l'infrastructure se trouve dans
[`docs/infrastructure/local-development.md`](docs/infrastructure/local-development.md).
