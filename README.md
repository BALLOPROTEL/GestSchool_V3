# GestSchool

GestSchool V3 est un SaaS scolaire multi-tenant en staging avancé. Les LOTS 0 à 17 couvrent
le socle technique, IAM/MFA/RBAC, annuaires élèves/parents/enseignants, référentiel académique,
inscriptions/réinscriptions/transferts, finance, évaluations/notes/moyennes/rangs/bulletins,
documents PDF/QR, messagerie/notifications, dashboards/rapports/exports, sécurité,
préparation d'exploitation, continuité d'identité V2 → V3 et finalisation des parcours visibles
sans mocks métier.

Le LOT17 est clôturé avec CI, sécurité, Codex et recette staging PASS. Le chantier courant est
le [LOT18](https://github.com/BALLOPROTEL/GestSchool_V3/issues/118) : **stabilisation fonctionnelle
et UX du cœur existant**, fondé sur la recette réelle du propriétaire. Les nouveaux grands domaines
(emploi du temps, calendrier, devoirs, vie scolaire, admissions) sont planifiés au LOT19 ; RH,
bibliothèque, cantine, transport, inventaire et paiement en ligne au LOT20.

GestSchool V3 reste **staging uniquement** : aucune mise en production réelle, aucun cutover V2 → V3
et aucun onboarding d'établissement réel ne sont autorisés sans décision explicite du propriétaire.
La source de vérité fonctionnelle courante est
[docs/functional-roadmap.md](docs/functional-roadmap.md).

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
pnpm academics:test
pnpm enrollments:test
pnpm finance:test
pnpm results:test
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
pnpm security:test
pnpm security:secrets --history
pnpm security:bundle
pnpm audit --prod
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
Le durcissement et ses limites sont documentés dans
[`docs/security-hardening.md`](docs/security-hardening.md), avec le
[modèle de menace](docs/security-threat-model.md), l'[audit LOT13](docs/security-audit-lot13.md)
et la [checklist production future](docs/security-production-checklist.md).
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
Le référentiel académique et ses règles sont décrits dans
[`docs/lot6-academics.md`](docs/lot6-academics.md).
Le cycle d'inscription et sa certification sont décrits dans
[`docs/lot7-enrollments.md`](docs/lot7-enrollments.md) et
[`docs/lot7-certification.md`](docs/lot7-certification.md).
Le domaine financier et sa certification sont décrits dans
[`docs/lot8-finance.md`](docs/lot8-finance.md) et
[`docs/lot8-certification.md`](docs/lot8-certification.md).
Les évaluations, résultats et bulletins sont décrits dans
[`docs/lot9-results.md`](docs/lot9-results.md), avec le compte rendu des 65 points demandés
dans [`docs/lot9-certification.md`](docs/lot9-certification.md).
