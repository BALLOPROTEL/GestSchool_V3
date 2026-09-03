# Documentation du LOT 0

Le monorepo est organisé autour de trois applications et de cinq packages internes :

- `apps/web` : page Next.js minimale ;
- `apps/api` : API NestJS exposant uniquement la sonde de vie ;
- `apps/worker` : contexte applicatif NestJS sans serveur HTTP ;
- `packages/config` : configurations TypeScript communes ;
- `packages/contracts`, `database`, `ui` et `shared` : emplacements minimaux réservés aux lots
  ultérieurs.

## Limites volontaires

Le LOT 0 n'intègre ni PostgreSQL, ni Prisma, ni Redis, ni authentification, ni JWT, ni RBAC,
ni écran métier, ni template Figma. Le dossier `docker` est donc réservé mais ne contient aucun
service à démarrer.
