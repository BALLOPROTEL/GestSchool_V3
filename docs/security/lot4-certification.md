# Certification finale LOT 4 — 6 septembre 2026

Statut : **GO pour le périmètre LOT 4**. Certification navigateur terminée. Aucun LOT 5 commencé.

L'implémentation et les choix détaillés sont dans [IAM — LOT 4](iam-auth.md). Ce relevé ne vaut
pas certification production ni audit de sécurité indépendant.

## Architecture et fonctionnalités

Module NestJS séparé en application, domain, infrastructure et presentation/http. Contrôleurs
sans accès Prisma ; repository dédié. Services Auth, Users (rôles/permissions), Memberships,
Sessions, MFA et Credentials (activation/reset). Contrats partagés typés, aucun CRUD métier.

Login réel, JWT Ed25519 de 5 min, refresh opaque 32 octets/7 jours/hash SHA-256 avec historique,
rotation atomique et révocation de la famille sur rejeu. Sessions liées à utilisateur, membership
et tenant, IP/user-agent/dates/révocation/preuve MFA ; état et permissions relus à chaque appel.
Tenant résolu serveur et switch limité aux memberships actives possédées. Default DENY,
huit rôles système et six scopes. Argon2id 64 MiB / trois passes / parallélisme 1 ; passphrases
Unicode de 12 à 128 caractères. Activation one-shot 24 h, reset 15 min et révocation globale.

MFA TOTP obligatoire pour SUPER_ADMIN, SCHOOL_ADMIN, DIRECTOR, ACCOUNTANT : enrollment,
confirmation, login, anti-rejeu et désactivation contrôlée. Secret AES-256-GCM avec clé dédiée.
Redis : limites IP/identifiant par endpoint, ralentissement progressif, refus fermé si indisponible.
Cookies HttpOnly, Strict, Secure hors local ; CSRF signé et allowlist CORS/Origin exacte.
Audit IAM append-only, erreurs standardisées et logs assainis.

Pages branchées : Login, Forgot Password, Activation et Reset Password, FR/EN/AR, challenge MFA,
loading, erreur, état connecté, expiration, déconnexion et protection d'entrée du portail.
Les parcours navigateur réels sont certifiés, avec conservation des mocks métier.

Rôles : SUPER_ADMIN, SCHOOL_ADMIN, DIRECTOR, ACADEMIC_STAFF, ACCOUNTANT, TEACHER, PARENT,
STUDENT. Scopes : PLATFORM, TENANT, ASSIGNED, CHILDREN, OWN, NONE. Les cas ACCOUNTANT
payments.create/grades.update, TEACHER grades.create/payments.cancel, PARENT CHILDREN et
STUDENT OWN sont explicitement testés. La [liste des endpoints](iam-auth.md#endpoints), la
matrice des grants, les secrets requis et leur rotation figurent dans le guide IAM.

## Versions installées

| Composant                        | Version                                |
| -------------------------------- | -------------------------------------- |
| Node.js / pnpm                   | 24.20.0 / 10.24.0                      |
| Prisma CLI / client / adapter-pg | 7.10.0 GA ; aucun package Prisma RC    |
| PostgreSQL / Redis serveur       | 18.6 / 8.10.1, infrastructure du LOT 2 |
| NestJS                           | 12.0.1                                 |
| Next.js / React                  | 16.3.4 / 19.2.8                        |
| TypeScript / Turborepo           | 6.0.2 / 2.10.12                        |
| Vitest / Playwright              | 5.0.0 / 1.62.1                         |
| Oxlint / Prettier                | 1.81.0 / 3.9.6                         |
| Argon2 / jose / otpauth          | 0.45.1 / 6.2.12 / 9.5.2                |
| redis client / Zod / pg          | 6.2.1 / 4.5.4 / 8.23.0                 |

## Commandes réellement exécutées

| Commande                                 | Résultat                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`         | PASS, lockfile à jour                                                            |
| `pnpm infra:up`                          | PASS, services sains et bucket privé                                             |
| `pnpm infra:check`                       | PASS PostgreSQL, Redis, S3/MinIO, confidentialité du bucket                      |
| `pnpm db:generate`                       | PASS, client Prisma 7.10.0                                                       |
| `pnpm db:migrate:deploy`                 | PASS, aucune migration en attente sur la base existante                          |
| `pnpm db:seed`                           | PASS                                                                             |
| `pnpm db:test`                           | PASS, 18/18                                                                      |
| `pnpm format` puis `pnpm format:check`   | PASS                                                                             |
| `pnpm lint`                              | PASS, `--deny-warnings`                                                          |
| `pnpm typecheck`                         | PASS, 14 tâches                                                                  |
| `pnpm test`                              | PASS, 38 tests unitaires, 12 tâches                                              |
| `pnpm build`                             | PASS, neuf tâches, aucun warning TypeScript/build masqué                         |
| `pnpm --filter @gestschool/api test:iam` | PASS, 50/50 PostgreSQL/Redis/HTTP                                                |
| `pnpm test:e2e`                          | PASS, 15 scénarios, aucun échec, 41 variantes exclues prévues ; 2,7 min de tests |
| `git diff --check`                       | PASS                                                                             |

Turborepo a utilisé son cache pour les tâches inchangées ; les tâches modifiées ont été
réexécutées. Les scripts directs PostgreSQL/IAM et le test E2E ne sont pas validés par un cache.
Le script racine `pnpm iam:test` reconstruit ses dépendances avant de lancer la même suite IAM.
Son rejeu complet réussit également : **50/50**. Le dernier passage direct après élargissement
de la capture aux logs informatifs, warnings et erreurs a aussi réussi **50/50**, en 57,79 s.
La dernière reprise conserve aussi les logs de l'indisponibilité Redis volontaire dans le
contrôle d'absence de secrets, au lieu de vider la capture.

Les premiers échecs de mise au point ont été corrigés : configuration de transformation des
décorateurs pour les tests NestJS, relation Prisma imbriquée des fixtures, assertion sur l'ordre
des paramètres PHC Argon2 et libellés français des sélecteurs E2E. Les bibliothèques Chromium
absentes ont été extraites dans `/tmp/gestschool-pw-libs.AdvD38`, sans installation système.
Le prochain lancement peut utiliser son sous-dossier `extracted/usr/lib/x86_64-linux-gnu` dans
`LD_LIBRARY_PATH`. En CI, `playwright install --with-deps chromium` installe ces prérequis.
Le conflit d'environnement `NO_COLOR` / `FORCE_COLOR` a été résolu pour le dernier lancement,
qui ne présente pas ces warnings. La CI GitHub est mise à jour ; aucun run distant ni déploiement
n'a été lancé. Les résultats de ce rapport proviennent des commandes locales réellement exécutées.

Après les dernières corrections frontend : `pnpm typecheck` PASS (14 tâches, 1 min 27 s),
`pnpm test` PASS (38 tests, 12 tâches), `pnpm lint` PASS. Le build final est également exécuté
par la dépendance de `pnpm test:e2e` : dix tâches réussies au total, dont huit inchangées en cache,
durée globale 3 min 6,67 s. Playwright est réexécuté sans cache et sans retry sur ce passage local.

## Détail IAM

### Reprise de la certification navigateur

Après libération des ports, le premier passage a exécuté 11 scénarios avec succès et rencontré
quatre échecs : navigation interrompant la restauration de session, raccourci clavier avant
montage du portail, mauvais libellé du menu logout et délai global insuffisant pour sept audits
axe. Corrections : état `aria-busy`, attentes explicites de disponibilité, libellé « Se déconnecter »
et délai de 90 secondes réservé aux scénarios agrégeant 23 pages ou sept audits. Les délais
d'assertion et les contrôles de sécurité ne sont pas assouplis.

Le deuxième passage a réussi 14 scénarios et révélé une erreur console dans le champ du token :
le tiret de sa classe de caractères devait être échappé pour le mode `v` du
[`pattern` HTML](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/pattern).
La correction est accompagnée d'un contrôle natif navigateur des valeurs interdites et des
caractères base64url `-` et `_`, ainsi que du suivi console/pageerror du parcours complet.
Aucune modification du schéma ou des règles IAM serveur n'a été nécessaire pendant cette reprise.

Le troisième passage complet réussit : **15 passed, 41 skipped, 0 failed**, en 2,7 minutes.
Les 41 exclusions sont les déclinaisons non ciblées des tests d'interaction ; aucun scénario
en échec n'a été retiré. Le balayage des pages, lui, s'exécute sur les sept viewports.

| Couverture navigateur                                              | Résultat                                  |
| ------------------------------------------------------------------ | ----------------------------------------- |
| 23 routes × 7 viewports : 360, 414, 768, 1024, 1366, 1440, 1920 px | 7/7 scénarios, 161 couples route/viewport |
| Navigation mobile et desktop, dont Ctrl+K et persistance du menu   | 2/2                                       |
| Thème, FR/EN/AR et RTL                                             | 1/1                                       |
| Login, forgot, activation, reset et validation native du token     | 1/1                                       |
| Inscription MFA, premier code, logout et portail anonyme refusé    | 1/1                                       |
| Quatre formulaires auth dans trois langues                         | 1/1                                       |
| Catalogue de composants et interactions clavier                    | 1/1                                       |
| Sept audits axe WCAG A/AA, dont l'arabe                            | 1/1, aucune violation automatisée         |

Les ports 3000 et 3100 sont libres après la fin : Playwright a arrêté ses serveurs temporaires.

### Intégration PostgreSQL/Redis

| Catégorie                              | Tests réussis |
| -------------------------------------- | ------------- |
| Auth                                   | 6/6           |
| Sessions                               | 4/4           |
| Rotation refresh, rejeu et concurrence | 3/3           |
| Activation / reset                     | 4/4           |
| Multi-tenant                           | 3/3           |
| RBAC                                   | 5/5           |
| Scopes                                 | 3/3           |
| MFA                                    | 7/7           |
| CSRF / CORS / cookies                  | 3/3           |
| Rate limit et Redis indisponible       | 11/11         |
| Audit                                  | 1/1           |
| Total                                  | 50/50         |

Sur cette couverture : aucun auth bypass, accès cross-tenant, permission bypass ou rejeu refresh
non détecté observé. Les secrets de test sont comparés à la capture de logs. Ce sont des résultats
bornés par les scénarios exécutés, pas une garantie universelle. Sur les parcours frontend
certifiés, aucune erreur console/pageerror ni aucun débordement hors tolérance de 1 px n'est
observé. Il ne s'agit pas d'une comparaison pixel à pixel avec Figma.

```text
auth bypass = 0
cross-tenant access = 0
permission bypass = 0
refresh reuse undetected = 0
secrets leaked in logs = 0
migration errors = 0
orphan records = 0
frontend overflow = 0
console errors = 0
page errors = 0
frontend regressions = 0 (sur la couverture certifiée)
```

## Conservation des LOTS 1 à 3 et de Figma

- LOT 1 : composants/tokens, mocks métier et pages métier conservés ; seules l'authentification,
  l'entrée du portail et la déconnexion sont branchées. Certification responsive, navigation,
  localisation, composants et accessibilité réussie.
- LOT 2 : aucun changement des services Docker, des adaptateurs de santé ou du worker.
  Contrôles PostgreSQL, Redis et MinIO réussis.
- LOT 3 : 43 modèles historiques présents, 67/67 FK, 27/27 CHECK, 125/125 index explicitement
  créés et 4/4 triggers historiques retrouvés dans le catalogue PostgreSQL. Avec leurs 43 index
  de PK, les 168 index historiques sont conservés. Migration initiale inchangée.
- Extension additive IAM : 47 modèles au total, 72 FK, 32 CHECK, 179 index et six triggers
  applicatifs. Aucune contrainte non validée. Aucun remplacement de migration historique.
- Backup Figma : 88 fichiers, empreinte identique à celle de départ ; aucune écriture.

SHA-256 de `20260904000100_initial_schema/migration.sql` :
`ae5d52cbf5b78b1d31dffa4a968f3d127144418d3bb02ae7b1a3ff247fcb12a8`.

Backup `/home/ballo/projets/GestSchool_V3_figma_backup_20260903` :
`87f67b645d20eeee8afaf1a103026ea01f80b52a915ce2b9dfc7cf4d41349715`
(parcours trié, chemins relatifs puis contenu ; hors node_modules, .git et dist).

Base totalement neuve `gestschool_lot4_cert_20260906` : CREATE DATABASE → migration initiale →
migration additive IAM → seed → **18/18 tests d'intégrité**. Aucun reset ni suppression de base
existante. Base de certification conservée localement. Rejeu du seed : mêmes comptes, memberships,
rôles, permissions, grants et nombre d'audits. Audit générique des 72 FK : **0 référence orpheline** ;
catalogue des migrations : **0 migration en erreur**.

## Écarts et limites

Le blocage initial des ports et les échecs E2E décrits ci-dessus sont levés. Aucun écart
bloquant restant pour le LOT 4. Le statut GO ne vaut pas autorisation de mise en production.

Limites documentées et hors périmètre : aucun email réel, livraison des liens uniquement par
CLI locale/test, aucune récupération MFA admin/recovery codes, aucune UI d'administration IAM
complète. Avant production : secrets manager, procédure de récupération, rôles PostgreSQL non
propriétaires, stratégie de proxies de confiance et seuils Redis adaptés. Les scopes métier
utilisent des faits serveur dans les policies et les sondes de test, pas des CRUD inexistants.

Reportés sans implémentation : endpoints Students/Parents/Teachers/Finance/Grades, suppression des
mocks, BullMQ métier, WhatsApp/Brevo, PDF, R2 réel, hébergement et orchestration. LOT 5 non commencé.

Message de commit proposé (aucun commit créé automatiquement) :
`feat(iam): implement tenant-scoped authentication, rotating sessions, RBAC and TOTP MFA`
