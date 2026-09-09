# Documentation du projet

Le monorepo est organisé autour de trois applications et de six packages internes :

- `apps/web` : interface Next.js du LOT 1, localisée en français, anglais et arabe ;
- `apps/api` : sondes de santé, IAM LOT 4, annuaires LOT 5, référentiel académique LOT 6 et inscriptions LOT 7 ;
- `apps/worker` : contexte applicatif NestJS sans serveur HTTP ;
- `packages/config` : configurations TypeScript communes ;
- `packages/ui` : tokens et composants visuels réutilisables du LOT 1 ;
- `packages/database` : propriétaire unique du schéma Prisma 7.10, des migrations, du client, du
  seed et des tests d'intégrité PostgreSQL du LOT 3 ;
- `packages/contracts` : contrats IAM et Zod des annuaires, rôles, permissions et scopes ; `shared` reste sans logique métier ;
- `packages/infrastructure` : clients techniques de santé PostgreSQL, Redis et stockage S3.

L'audit exhaustif du prototype et les décisions de portage sont documentés dans
[`design/template-audit.md`](design/template-audit.md).
Le modèle relationnel, les frontières de tenant et la politique de suppression sont documentés
dans [`database/data-model.md`](database/data-model.md).
Les flux d'authentification, les guards, les secrets et les limites sont documentés dans
[`security/iam-auth.md`](security/iam-auth.md).
Le compte rendu des commandes, des 50 tests IAM et de la certification navigateur est dans
[`security/lot4-certification.md`](security/lot4-certification.md).
Le LOT 5 et ses accès locaux sont documentés dans [`lot5-directories.md`](lot5-directories.md).
Son compte rendu de certification est dans [`lot5-certification.md`](lot5-certification.md).
Le référentiel académique est documenté dans [`lot6-academics.md`](lot6-academics.md).
Les inscriptions et leur historique sont documentés dans [`lot7-enrollments.md`](lot7-enrollments.md).
Le compte rendu LOT 7 est dans [`lot7-certification.md`](lot7-certification.md).

## Limites volontaires

Le LOT 1 fournit le contrat visuel. Le LOT 2 ajoute PostgreSQL, Redis et MinIO. Le LOT 3 ajoute
Prisma et le socle de données multi-tenant. Le LOT 4 branche l'authentification réelle
et protège l'entrée du portail. Le LOT 5 fournit uniquement les annuaires élèves, parents,
enseignants et les relations parent/enfant. Le LOT 6 fournit le référentiel académique et les
affectations enseignants. Le LOT 7 fournit le cycle d'inscription et ses historiques. Les autres écrans restent en mocks : aucun LOT 8,
file de travaux, connecteur d'envoi ou calcul académique/financier n'est implémenté. Consultez
[`infrastructure/local-development.md`](infrastructure/local-development.md) pour le workflow local.
