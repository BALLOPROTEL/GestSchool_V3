# GestSchool

Monorepo SaaS GestSchool : fondation technique, interface visuelle, infrastructure locale et socle
de données multi-tenant des LOTS 0 à 3. Le LOT 4 ajoute l'identité, l'authentification réelle,
les sessions, le RBAC et le MFA. Le LOT 5 branche les annuaires élèves, parents et enseignants
sur PostgreSQL, avec validation, scopes et audit. Les autres écrans restent des démonstrations ;
aucun module académique du LOT 6 ni traitement asynchrone n'est ajouté.

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
pnpm iam:keys
pnpm iam:dev activation student@example.invalid
pnpm dev:access
pnpm dev:totp school-admin@example.invalid
pnpm people:test
pnpm iam:test
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
Le démarrage des comptes fictifs, les secrets locaux et les garanties IAM sont décrits dans
[`docs/security/iam-auth.md`](docs/security/iam-auth.md). Aucun mot de passe n'est prédéfini par
le seed. En local uniquement, `pnpm dev:access` génère les accès, les affiche et vérifie les sept
connexions par HTTP, avec MFA pour les rôles privilégiés. Les accès sont conservés dans
`.local/test-access.json` (0600, ignoré par Git). `pnpm dev:totp EMAIL` affiche le code courant ;
chaque code n'est utilisable qu'une fois, attendre la fenêtre suivante si nécessaire.
Puis `pnpm dev` rend le portail disponible à `http://localhost:3000/fr/login`.
Le périmètre, les routes et les limites du LOT 5 sont décrits dans
[`docs/lot5-directories.md`](docs/lot5-directories.md).
