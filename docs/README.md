# Documentation du projet

Le monorepo est organisé autour de trois applications et de cinq packages internes :

- `apps/web` : interface Next.js du LOT 1, localisée en français, anglais et arabe ;
- `apps/api` : API NestJS exposant uniquement la sonde de vie ;
- `apps/worker` : contexte applicatif NestJS sans serveur HTTP ;
- `packages/config` : configurations TypeScript communes ;
- `packages/ui` : tokens et composants visuels réutilisables du LOT 1 ;
- `packages/database` : propriétaire unique du schéma Prisma 7.10, des migrations, du client, du
  seed et des tests d'intégrité PostgreSQL du LOT 3 ;
- `packages/contracts` et `shared` : emplacements minimaux réservés aux lots ultérieurs ;
- `packages/infrastructure` : clients techniques de santé PostgreSQL, Redis et stockage S3.

L'audit exhaustif du prototype et les décisions de portage sont documentés dans
[`design/template-audit.md`](design/template-audit.md).
Le modèle relationnel, les frontières de tenant et la politique de suppression sont documentés
dans [`database/data-model.md`](database/data-model.md).

## Limites volontaires

Le LOT 1 reste exclusivement visuel. Le LOT 2 ajoute PostgreSQL, Redis et MinIO. Le LOT 3 ajoute
Prisma et le socle de données multi-tenant sans API métier, authentification, JWT, moteur RBAC,
files de travaux ni logique de calcul. Consultez
[`infrastructure/local-development.md`](infrastructure/local-development.md) pour le workflow local.
