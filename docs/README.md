# Documentation du projet

Le monorepo est organisé autour de trois applications et de cinq packages internes :

- `apps/web` : interface Next.js du LOT 1, localisée en français, anglais et arabe ;
- `apps/api` : API NestJS exposant uniquement la sonde de vie ;
- `apps/worker` : contexte applicatif NestJS sans serveur HTTP ;
- `packages/config` : configurations TypeScript communes ;
- `packages/ui` : tokens et composants visuels réutilisables du LOT 1 ;
- `packages/contracts`, `database` et `shared` : emplacements minimaux réservés aux lots
  ultérieurs.

L'audit exhaustif du prototype et les décisions de portage sont documentés dans
[`design/template-audit.md`](design/template-audit.md).

## Limites volontaires

Le LOT 1 est exclusivement visuel. Il n'intègre ni PostgreSQL, ni Prisma, ni Redis, ni
authentification réelle, ni JWT, ni RBAC, ni logique métier. Le dossier `docker` reste réservé et
ne contient aucun service à démarrer.
