# LOT 5 — Certification des annuaires PostgreSQL

Certification locale du 7 septembre 2026, dans `/home/ballo/projets/GestSchool_V3`.
Périmètre : élèves, parents, enseignants et relations parent/enfant uniquement.
Le [guide technique](lot5-directories.md) précise les contrats et choix d'implémentation.

## 1. Fichiers créés et modifiés

Créations backend :

- `apps/api/src/modules/students/` : module Nest, ports `student.repository.ts` et
  `guardian-links.repository.ts` dans `domain/`, services correspondants dans `application/`,
  repositories Prisma dans `infrastructure/`, contrôleurs dans `presentation/http/` ;
- `apps/api/src/modules/guardians/` et `teachers/` : module Nest et, pour chaque entité,
  port de repository, service, repository Prisma et contrôleur selon les mêmes quatre couches ;
- `apps/api/src/modules/people/domain/policy.ts` et `infrastructure/people-database.ts` :
  scopes, connexion, transactions, références et audit communs ;
- `apps/api/src/modules/iam/infrastructure/dev-access.ts` et `dev-totp.ts` : accès locaux ;
- `apps/api/tests/people.test.ts` : tests HTTP réels ;
- `packages/contracts/src/people.ts` : validation Zod et DTO ;
- `packages/database/prisma/migrations/20260906000100_guardian_contact_flags/migration.sql`.

Créations frontend :

- `apps/web/src/features/directory/people-client.ts`, `people-hooks.ts`, `people-pages.tsx`,
  `person-editor.tsx`, `guardian-links.tsx`, `people-client.test.ts` ;
- `apps/web/src/features/profiles/student-profile-page.tsx` ;
- `apps/web/e2e/people.spec.ts` et `fixtures.ts`.

Modifications :

- API : `src/app.module.ts`, `src/modules/iam/presentation/http/security.ts`,
  `tests/e2e-server.ts` ;
- Web : les quatre routes Students/Student Profile/Parents/Teachers, `auth-provider.tsx`,
  retrait de leurs anciennes implémentations dans `directory-pages.tsx` et `profile-pages.tsx`,
  `messages/{fr,en,ar}.json`, `e2e/{lot1,iam}.spec.ts`, `playwright.config.ts` ;
- Contrats : `src/iam.ts`, `src/index.ts`, `package.json`, `tsconfig.json` ;
- Database : uniquement les deux champs de lien dans `prisma/schema.prisma` ;
- UI : pagination bornée dans `src/navigation.tsx` et son test dans `src/components.test.tsx` ;
- Racine : `package.json`, `pnpm-lock.yaml`, `turbo.json`, `README.md`, `docs/README.md` ;
- Documentation nouvelle : `docs/lot5-directories.md` et le présent compte rendu.

La CI existante n'est pas modifiée : `pnpm iam:test` découvre aussi les tests LOT 5 et
`pnpm test:e2e` découvre les nouveaux parcours. Aucun accès de démonstration n'est imprimé en CI.
La relance de Next en développement régénère aussi `apps/web/next-env.d.ts` vers ses types dev ;
ce fichier généré n'a pas été restauré ou modifié manuellement.

## 2–4. Endpoints Students, Guardians et Teachers

Les trois préfixes sont `/api/v1/students`, `/api/v1/guardians`, `/api/v1/teachers`.
Chacun expose les six opérations suivantes, soit 18 routes :

| Méthode | Suffixe        | Fonction                         |
| ------- | -------------- | -------------------------------- |
| GET     | vide           | Liste paginée dans la portée IAM |
| POST    | vide           | Création, sans User obligatoire  |
| GET     | `/:id`         | Détail                           |
| PATCH   | `/:id`         | Modification partielle           |
| POST    | `/:id/archive` | Archivage                        |
| POST    | `/:id/restore` | Restauration                     |

Cinq routes supplémentaires gèrent les liens : GET et POST `students/:id/guardians`,
PATCH et DELETE `students/:id/guardians/:guardianId`, GET `guardians/:id/students`.
Total : **23 routes**. Aucun contrôleur n'appelle Prisma directement.

## 5–8. Validation, pagination, archivage et relations

Zod strict refuse champs inconnus, UUID/date/email/téléphone invalides, chaînes trop longues,
enums inconnues, PATCH vide et booléens de lien non booléens. Les erreurs 400/401/403/404/409
portent un code stable et un requestId, sans erreur Prisma brute.

Les trois annuaires utilisent `page`, `pageSize` (25 par défaut, maximum 100), `search`,
`status` et `sort`. Filtrage, recherche, tri stable, comptage et pagination sont effectués en SQL.
Les références sont uniques par tenant ; les références automatiques sont générées sous verrou
transactionnel du tenant. La concurrence de 12 créations est couverte par les tests HTTP.

L'archivage conserve la personne et son historique, renseigne `archivedAt`, l'exclut des listes
ACTIVE et interdit sa modification jusqu'à restauration. Aucun DELETE de personne n'existe.
DELETE d'une association ne retire que `student_guardians`.

Les liens portent `relationship`, `isPrimary`, `isFinancialContact`, `receivesNotifications`.
Une modification partielle préserve les booléens non fournis. Les deux personnes doivent appartenir
au même tenant ; les listes de liens sont paginées et filtrées par les portées du lecteur.

## 9–11. RBAC, multi-tenant et audit

SCHOOL_ADMIN reçoit les CRUD/archivages TENANT. DIRECTOR lit les trois annuaires.
Les droits existants ACADEMIC_STAFF sur Students sont conservés, sans nouveaux droits Parents
ou Teachers ; ACCOUNTANT conserve la lecture Students. TEACHER lit son profil OWN et ses élèves
ASSIGNED ; PARENT lit son profil OWN et ses enfants CHILDREN ; STUDENT lit son profil OWN.
SUPER_ADMIN conserve PLATFORM mais les requêtes restent bornées au tenant de sa session.
Deny by default ; pas de CRUD administratif implicite pour les lecteurs à portée restreinte.

Le tenant vient exclusivement du RequestContext IAM. Le body, la query ou `X-Tenant-ID` ne
peuvent pas le remplacer. Les tests vérifient les refus malgré un UUID cross-tenant connu,
l'absence de fuite dans les listes/recherches et la confidentialité des autres parents d'un enfant.
L'association exige à la fois `students.update` et `guardians.update` TENANT/PLATFORM.

Les 15 actions demandées sont auditées dans la transaction de mutation : création, modification,
archivage et restauration des trois personnes, puis association/modification/dissociation du lien.
Tenant, membership, userId, resourceId, requestId, timestamp et before/after sont conservés.
Les triggers append-only existants restent actifs. Aucun secret IAM dans cet audit métier.

## 12–13. Frontend, langues et RTL

Students, Student Profile, Parents et Teachers sont branchés sur PostgreSQL via l'API IAM.
Listes, recherche, filtres, formulaires, détails, liaisons, archivage/restauration, chargement,
états vides, erreurs traduites et permissions sont intégrés au design existant.
Les autres écrans du LOT 1 restent des démonstrations ; leurs mocks ne sont pas étendus.

Toutes les nouvelles chaînes sont disponibles en FR/EN/AR. Le cache de lecture dépend aussi
du tenant et de la membership, pour ne pas afficher les données de la session précédente.
Le contrôle de pagination reste borné même pour de grandes listes.

## 14–16. Tests backend, frontend et Playwright

- **105/105 tests HTTP** avec PostgreSQL/Redis : 50 IAM historiques et 55 LOT 5.
  Couverture des trois CRUD, doublons intra-tenant, références identiques inter-tenants,
  création sans User, scopes positifs/négatifs, refus d'accès, validation, archive/restore,
  liens, audit et génération concurrente. Le cas ASSIGNED utilise uniquement des fixtures SQL
  du modèle existant, sans implémenter de module académique.
- **48/48 tests unitaires** : API 22, Web 13, UI 6, configuration 3, infrastructure 2,
  database 1, worker 1. Les 13 Web incluent 9 nouveaux cas permissions/erreurs.
- **18/18 tests d'intégrité PostgreSQL** sur la base principale et sur une base neuve.
- Playwright ciblé LOT 5 en 360×800 : **3/3 réussis**.
- Suite Playwright complète finale : **26 réussis, 51 skips intentionnels, 0 échec**, en 7,2 minutes.
  La commande racine se termine avec le code 0 (10 tâches Turborepo réussies).

Les 77 déclinaisons correspondent à 11 scénarios déclarés sur sept résolutions. Les 51 skips
évitent de répéter certains parcours sur chaque taille ; aucun n'a été ajouté pour contourner
un échec. Les 26 parcours exécutés comprennent 15 parcours LOT 1/IAM et 11 parcours LOT 5.

| Résolution | Parcours réussis | Déclinaisons non exécutées |
| ---------- | ---------------- | -------------------------- |
| 360×800    | 5                | 6                          |
| 414×896    | 2                | 9                          |
| 768×1024   | 2                | 9                          |
| 1024×768   | 2                | 9                          |
| 1366×768   | 5                | 6                          |
| 1440×900   | 7                | 4                          |
| 1920×1080  | 3                | 8                          |

Les sept résolutions configurées sont 360×800, 414×896, 768×1024, 1024×768, 1366×768,
1440×900 et 1920×1080. Les parcours de mutation complets ciblent mobile et desktop ; les trois
langues, annuaires, profils, formulaires, clavier et focus sont exercés sur les sept résolutions.
Les audits axe couvrent les écrans historiques représentatifs et les neuf formulaires
annuaire/langue en desktop. Il ne s'agit pas d'une certification manuelle exhaustive WCAG.

## 17. Commandes réellement exécutées

| Commande                               | Résultat enregistré                       |
| -------------------------------------- | ----------------------------------------- |
| `pnpm install --frozen-lockfile`       | OK, lockfile cohérent                     |
| `pnpm infra:up`                        | OK, PostgreSQL/Redis/MinIO sains          |
| `pnpm infra:check`                     | OK, trois services et stockage S3 local   |
| `pnpm db:generate`                     | OK, client Prisma 7.10.0                  |
| `pnpm db:migrate:deploy`               | OK, trois migrations appliquées           |
| `pnpm db:seed`                         | OK                                        |
| `pnpm db:test`                         | 18/18                                     |
| `pnpm dev:access`                      | 7/7 logins HTTP, MFA compris              |
| `pnpm format:check`                    | OK                                        |
| `pnpm lint`                            | OK, aucun warning accepté                 |
| `pnpm typecheck`                       | OK, 14 tâches réussies                    |
| `pnpm test`                            | 48/48, 12 tâches réussies                 |
| `pnpm build`                           | OK, 9 tâches, 68 pages statiques          |
| `pnpm test:e2e`                        | OK, 26 réussis, 51 skips intentionnels    |
| `pnpm people:test`                     | 54/54 avant ajout du cas ASSIGNED positif |
| `pnpm iam:test`                        | 105/105, dont la suite LOT 5 finale 55/55 |
| Playwright ciblé `people`, 360×800     | 3/3                                       |
| Audit SQL des FK et objets historiques | Aucun orphelin ni contrainte manquante    |
| `git diff --check`                     | OK                                        |

Base totalement vide créée pour la certification : `gestschool_lot5_cert_20260907_01`.
Existence préalable exclue avant création ; **trois migrations → seed → 18/18 tests**.
Cette base est conservée. Aucune base existante n'a été réinitialisée.

La qualité, les tests unitaires et le build ont été rejoués après les corrections Playwright.
Turborepo réutilise les résultats valides des packages inchangés ; la suite navigateur est
toujours exécutée réellement, sans cache de tests E2E. Le dernier audit SQL après Playwright
confirme à nouveau les contraintes historiques, les empreintes, zéro orphelin et zéro migration
en erreur. Aucun snapshot d'échec ne reste dans les résultats de la dernière exécution.

Résultat final **sur la couverture certifiée**, après corrections :

```text
cross-tenant leaks = 0
authorization bypass = 0
destructive person deletes = 0
Prisma migration errors = 0
orphan records = 0
console errors = 0
page errors = 0
unexpected API errors = 0
overflow = 0
test login failures = 0
frontend regressions = 0
```

Ces résultats décrivent les tests exécutés, pas une preuve de sécurité exhaustive ni une mesure
de performance de production. Le contrôle de débordement tolère uniquement l'arrondi subpixel
jusqu'à un pixel.

Versions effectivement installées, sans montée de version dans ce lot :

| Technologie                     | Version           |
| ------------------------------- | ----------------- |
| Node.js / pnpm                  | 24.20.0 / 10.24.0 |
| Prisma / client / adaptateur pg | 7.10.0 GA chacun  |
| Next.js / React                 | 16.3.4 / 19.2.8   |
| NestJS / Zod                    | 12.0.1 / 4.5.4    |
| TypeScript / Turborepo          | 6.0.2 / 2.10.12   |
| Vitest / Playwright             | 5.0.0 / 1.62.1    |
| Oxlint / Prettier               | 1.81.0 / 3.9.6    |

Zod est désormais une dépendance explicite de `contracts`, à la version déjà utilisée par l'API.
Packages Prisma RC : **0**.

## 18–23. Migration et préservation des LOTS 1 à 4

- **LOT 1** : shell, tokens, typographies et composants réutilisés. Les colonnes des annuaires
  correspondent désormais aux champs réels du modèle ; les KPI académiques simulés de la fiche
  élève deviennent des états indisponibles dans ce lot. Pas de refonte ni prétention de comparaison
  pixel par pixel ; certification fonctionnelle, responsive et axe sur la couverture décrite.
- **LOT 2** : Docker et clients d'infrastructure inchangés, sondes réexécutées avec succès.
- **LOT 3** : 43 modèles métier conservés, plus les quatre modèles IAM existants, soit 47 modèles
  Prisma. Nouvelle migration additive de deux booléens seulement, sans suppression ni remplacement.
  Les 67 FK, 27 CHECK, 125 index explicites et quatre triggers historiques sont présents ;
  les 43 clés primaires historiques sont aussi conservées.
- **LOT 4** : modèles et migration IAM conservés, 50 tests HTTP historiques passent.
  Authentification, CSRF, sessions et MFA non contournés ; ajout des permissions annuaire,
  de PATCH au CORS et de la synchronisation de session frontend.
- **État total PostgreSQL** après IAM et LOT 5 : 72 FK, 32 CHECK, 179 index, six triggers,
  zéro contrainte non validée, zéro orphelin et zéro migration en erreur.
- **Backup Figma intact** : 88 fichiers source contrôlés, hors `.git`, `node_modules`, `dist`.

SHA-256 de la migration initiale LOT 3, inchangé :
`ae5d52cbf5b78b1d31dffa4a968f3d127144418d3bb02ae7b1a3ff247fcb12a8`.

Empreinte du backup `/home/ballo/projets/GestSchool_V3_figma_backup_20260903`, inchangée :
`87f67b645d20eeee8afaf1a103026ea01f80b52a915ce2b9dfc7cf4d41349715`.
Calcul : parcours récursif trié par nom, concaténation des chemins relatifs et contenus.

## 24. ACCÈS DE TEST À UTILISER

Pour obtenir de nouveaux accès locaux :

```bash
cd /home/ballo/projets/GestSchool_V3
pnpm dev:access
```

La commande affiche ROLE, EMAIL, PASSWORD, MFA REQUIRED et vérifie les sept logins HTTP :
`school-admin@example.invalid`, `director@example.invalid`, `academic-staff@example.invalid`,
`accountant@example.invalid`, `teacher@example.invalid`, `parent@example.invalid`,
`student@example.invalid`. Les mots de passe sont aléatoires, hashés Argon2id en base.
Tenant, comptes et memberships sont actifs avec les rôles attendus.

Ouvrir `http://localhost:3000/fr/login` avec le serveur `pnpm dev` démarré.
À la remise, `pnpm dev` a été relancé et laissé actif : page de connexion HTTP **200**,
`/health/live` et `/health/ready` **OK**, PostgreSQL/Redis/stockage **up** ;
le worker a écrit `GestSchool worker is ready`, sans serveur HTTP public.
Les accès déjà générés restent dans `.local/test-access.json`, permissions **0600**,
répertoire **0700**, ignoré par Git. Ils ne sont pas reproduits dans ce rapport.
Relancer `dev:access` renouvelle les secrets et révoque les anciennes sessions fictives.

SCHOOL_ADMIN, DIRECTOR et ACCOUNTANT conservent le MFA obligatoire. Un authentificateur peut
importer le `mfaUri` local ; un code courant peut aussi être obtenu ainsi :

```bash
pnpm dev:totp school-admin@example.invalid
```

Chaque code est à usage unique. Attendre la fenêtre suivante si le login de vérification vient
de consommer le code courant. Aucun raccourci MFA de production n'a été ajouté.

## 25. Écarts et corrections pendant la certification

- Aucun champ arbitraire ajouté aux personnes : sexe, lieu de naissance, adresse, téléphone élève
  et contacts enseignant restent absents car le schéma LOT 3 ne les prévoit pas.
- Les deux nouveaux booléens de `student_guardians` nécessitent une migration additive documentée.
- Les nouveaux CRUD Parents/Teachers sont réservés à SCHOOL_ADMIN, sans extension implicite
  des droits ACADEMIC_STAFF ou des rôles de lecture.
- `dev:access` reste local, hors logs CI ; les fixtures automatiques couvrent les logins CI.
- Correction d'un cast PostgreSQL dans la génération de référence, de la préservation des flags
  dans un PATCH de lien, d'une fixture Prisma imbriquée et de générations Prisma concurrentes
  dans Turborepo. Les suites correspondantes ont été rejouées avec succès.
- Une première exécution complète Playwright était bloquée par les ports du serveur de travail.
  Après leur libération, quatre dépassements de délai ont été observés avec deux navigateurs sur
  la machine chargée ; cette tentative a été arrêtée, pas certifiée. Exécution désormais à un seul
  navigateur, comme en CI, avec budgets explicites 60/180 secondes et attentes de 10 secondes.
  Aucun nouveau skip, aucune assertion supprimée, aucun retry local ajouté.
- La désactivation des snapshots DOM d'échec a été déplacée de la configuration à une fixture
  exécutée dans chaque worker : elle ne s'appliquait pas aux workers auparavant. Les captures
  automatiques pouvaient contenir des accès fictifs ; aucun de ces artefacts n'est versionné.
- Chromium utilise les bibliothèques Linux déjà disponibles sous un répertoire temporaire local,
  via `LD_LIBRARY_PATH`. Aucun changement système ni dépendance applicative supplémentaire.

## 26–28. Limites, verdict et commit

Aucun LOT 6 commencé : pas d'API académique, classe/niveau/matière, inscription, finance,
notes, présence, emploi du temps, affectation, BullMQ métier, Brevo, PDF, R2 réel ni déploiement.

**Verdict : GO — LOT 5 certifié sur la couverture décrite.** Toutes les commandes obligatoires
ont réussi après corrections ; les accès locaux et les trois applications sont disponibles.
Arrêt du travail à la fin du LOT 5, sans commencer le LOT 6.

Message de commit proposé, aucun commit créé :

```text
feat(lot5): connect tenant-safe student guardian and teacher directories
```
