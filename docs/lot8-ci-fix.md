# LOT 8 — Correctif du seed CI

Audit du 10 septembre 2026, limité au workflow `quality`. Aucun LOT 9.

## Cause confirmée

Le [run GitHub en échec](https://github.com/BALLOPROTEL/GestSchool_V3/actions/runs/34482893151)
porte sur le commit `541841ee1208b9ace7921156023d701d1b5db6ef`.
L'installation, la génération Prisma et les sept migrations réussissent. Le seed échoue ensuite
avec `ERR_MODULE_NOT_FOUND` sur
`packages/database/node_modules/@gestschool/config/dist/environment.js`.

`prisma/seed.ts` importe `@gestschool/config/environment`. Son export ESM pointe vers
`dist/environment.js`, mais l'ancienne commande racine `db:seed` ne compilait que `contracts`.
Ni l'installation, ni `db:generate`, ni `iam:keys`, ni `db:migrate:deploy` ne compilent `config`.
Un `dist` préexistant après un build local masquait donc le défaut d'ordonnancement.

L'erreur se produit pendant la résolution des imports, avant toute requête du seed :
ce n'est ni un défaut de disponibilité PostgreSQL, ni un mot de passe ou une URL incorrects,
ni une incompatibilité Prisma, ni un conflit de fixtures DEV/TEST.
Le message indiquant l'absence de `.env` est normal : les variables CI restent prioritaires
sur les valeurs par défaut de `.env.example`.

## Correctif

La commande racine construit maintenant les dépendances workspace directes et transitives du
package database, dans leur ordre de dépendance, avant d'exécuter le seed :

```sh
pnpm --filter @gestschool/database^... build && pnpm --filter @gestschool/database db:seed
```

Le [sélecteur pnpm](https://pnpm.io/10.x/filtering)
sélectionne actuellement `config` puis `contracts`, sans compiler toute l'application.
Le `&&` conserve la propagation des erreurs de compilation et de seed. Le checkout propre de
la CI exerce ce chemin à chaque exécution, sans préparation manuelle ni cache de `dist` requis.

Les trois actions passent à des versions stables déclarant le runtime Node.js 24 :

- [actions/checkout v5](https://github.com/actions/checkout/blob/v5/README.md) ;
- [pnpm/action-setup v5](https://github.com/pnpm/action-setup/releases/tag/v5.0.0) ;
- [actions/setup-node v6](https://github.com/actions/setup-node/blob/v6/README.md).

Le runner observé est en version `2.337.0`, au-dessus du minimum `2.327.1` de ces actions.
Node applicatif reste `24.20.0`, pnpm `10.24.0`, Prisma/client/adapter-pg `7.10.0` GA.
Aucune variable de contournement de la dépréciation Node.js 20 n'est ajoutée.

Après correction du seed, la reproduction complète a révélé un second échec : le test Argon2
dépasse son timeout existant de 5 secondes lorsque tous les packages de tests sont lancés en
parallèle. La suite API isolée réussit ses 132 tests ; le test Argon2 prend alors 2,549 secondes.
La CI limite donc les tâches Turbo simultanées à deux avec `pnpm test --concurrency=2`.
Toutes les suites restent exécutées : aucun timeout, assertion ou paramètre cryptographique
(`m=65536`, `t=3`, `p=1`) n'est modifié. Ce réglage concerne uniquement l'ordonnancement CI.

## Reproduction isolée

Une copie du commit est exécutée sous Ubuntu 24.04, avec le même répertoire racine
`/home/runner/work/GestSchool_V3/GestSchool_V3`, les versions Node/pnpm épinglées, les images
`postgres:18.6-trixie` et `redis:8.10.1-alpine3.23`, leurs contrôles de santé et les variables CI :

```sh
CI=true
NODE_ENV=test
IAM_ENV=local
DATABASE_URL=postgresql://gestschool:gestschool-ci-only@127.0.0.1:5432/gestschool
REDIS_URL=redis://127.0.0.1:6379
```

Le mot de passe ci-dessus est la valeur publique réservée au service CI, pas un secret déployé.
Les conteneurs partagent un réseau isolé : ces ports n'utilisent pas les services de développement.
Aucun `.env`, fichier d'accès local, `dist` ou cache Turbo du poste n'est repris.
Ubuntu conteneurisé reproduit les dépendances pertinentes, pas la totalité de l'image VM GitHub.

Avant correctif, la séquence réelle installation → génération → clés IAM → migrations → seed
reproduit le même import introuvable et le même code de sortie 1. La base était initialement
vide (zéro table publique) ; après l'échec, la table des tenants contient toujours zéro ligne.

Pour le passage corrigé, cette première base est conservée sous un autre nom, une nouvelle base
`gestschool` vide est créée et les artefacts produits lors du premier essai sont écartés.
Les dépendances installées peuvent être réutilisées, mais pas les compilations workspace.

## Préservation du périmètre

Le code métier, le seed et ses données, les modèles Prisma, les sept migrations historiques,
le lockfile et les assertions des tests ne sont pas modifiés. Aucun `continue-on-error`, saut
de contrôle ou traitement transformant un échec en succès n'est ajouté.
Les services et données du développement local restent intacts.

## Certification locale du workflow corrigé

La chaîne complète se termine avec le code de sortie **0**. Les fichiers `package.json` et
`.github/workflows/ci.yml` de la reproduction ont les mêmes SHA-256 que ceux du correctif.

| Commande / contrôle                                   | Résultat observé                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| PostgreSQL / Redis, versions et healthchecks de la CI | PASS, base neuve : zéro table publique                                              |
| `pnpm install --frozen-lockfile`                      | PASS, lockfile inchangé                                                             |
| `pnpm db:generate`                                    | PASS, Prisma 7.10.0                                                                 |
| `pnpm iam:keys`                                       | PASS, clés éphémères de reproduction, aucun accès local repris                      |
| `pnpm db:migrate:deploy`                              | PASS, 7/7 migrations, zéro erreur                                                   |
| `pnpm db:seed`                                        | PASS, construction de config puis contracts avant le seed                           |
| `pnpm db:test`                                        | PASS, 18/18 tests d'intégrité                                                       |
| `pnpm format:check`                                   | PASS                                                                                |
| `pnpm lint`                                           | PASS, zéro erreur et zéro warning Oxlint                                            |
| `pnpm typecheck`                                      | PASS, 14/14 tâches                                                                  |
| `pnpm test --concurrency=2 --force`                   | PASS, 221/221 tests, aucun résultat de test repris du cache                         |
| `pnpm build`                                          | PASS, 9/9 tâches, 68 pages Next.js générées                                         |
| `pnpm iam:test`                                       | PASS, 245/245 tests HTTP PostgreSQL/Redis                                           |
| `pnpm exec playwright install --with-deps chromium`   | PASS                                                                                |
| `pnpm test:e2e`                                       | PASS, 74 réussites, 66 répétitions déjà exclues par les tests existants, zéro échec |
| Audit SQL après les tests                             | PASS, 7 migrations sans erreur, 88 FK et 50 CHECK conservés                         |
| `git diff --check` et contrôle du périmètre           | PASS, aucun changement métier, Prisma ou migration                                  |

Les 14 tâches TypeScript ont d'abord été exécutées sans cache ; le dernier passage réutilise
13 résultats inchangés. Les tests unitaires ont ensuite tous été forcés. Les tests DB, HTTP
et navigateur sont réellement exécutés et ne dépendent pas d'un succès de test en cache.
Le test Argon2 de la suite complète termine en 3,708 secondes avec le parallélisme CI borné.

Les deux échecs de diagnostic sont conservés comme tels : import ESM manquant avant correctif,
puis timeout Argon2 avec le parallélisme initial. Aucun n'est transformé en réussite.
Le job CI n'ajoute ni retry ni exclusion de test.

Avertissements non bloquants préexistants consignés : pnpm n'autorise pas les scripts optionnels
de `@parcel/watcher` et `@swc/core` ; Turbo attend des sorties pour le build UI qui fait
`tsc --noEmit`. Next.js signale aussi l'absence normale de cache lors du premier build propre.
Le correctif ne modifie pas les autorisations de scripts de dépendances ni ne masque ces messages.

## Statut GitHub et livraison

**Seed test database : PASS local. Workflow équivalent à quality : PASS local.**
La mise à jour des actions est vérifiée dans leurs manifestes officiels (`using: node24`).
Une exécution locale ne certifie toutefois pas l'exécution des actions sur GitHub.
Aucun commit, push ou PR n'a été effectué : **CI GitHub GREEN reste à confirmer après publication
et exécution du correctif**. Relancer l'ancien commit ne peut pas appliquer ce correctif.

Fichiers livrés : `package.json`, `.github/workflows/ci.yml`, `docs/lot8-ci-fix.md`.
Commit proposé : `fix(ci): build seed dependencies and stabilize quality on Node 24`.
Arrêt avant LOT 9.
