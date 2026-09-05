# GestSchool

Monorepo SaaS GestSchool : fondation technique, interface visuelle, infrastructure locale et socle
de données multi-tenant des LOTS 0 à 3. Le LOT 3 fournit le modèle relationnel et ses garanties
d'intégrité ; il n'ajoute encore ni authentification, ni API métier, ni traitement asynchrone.

## Prérequis

- Node.js 24 LTS (version de référence : `24.20.0`)
- pnpm `10.24.0`

## Commandes

```bash
pnpm install
pnpm infra:up
pnpm infra:check
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm db:test
pnpm db:reset
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

Le socle de données utilise Prisma `7.10.0` GA avec le schéma et les migrations historiques sous
`packages/database/prisma`. Consultez la documentation du modèle pour la certification d'une base
vierge. `pnpm db:reset` est destructif et réservé aux bases locales jetables.

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
Le modèle PostgreSQL et ses règles d'intégrité sont décrits dans
[`docs/database/data-model.md`](docs/database/data-model.md).
