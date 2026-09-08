# LOT 6 — Certification du référentiel académique

Certification locale du 8 septembre 2026 dans `/home/ballo/projets/GestSchool_V3`.
Base de travail : commit LOT 5 `244cada`. Aucun commit automatique et aucun LOT 7.
Le [guide technique](lot6-academics.md) détaille les contrats et limites.

**Verdict final : GO — LOT 6 certifié, arrêt avant LOT 7.**

## 1. Fichiers créés et modifiés

Créations :

- `apps/api/src/modules/academics/academics.module.ts` ;
- `application/academic.service.ts`, `domain/{academic.repository,policy,policy.test}.ts` ;
- `infrastructure/{academic.repository,database,year-writes,catalog-writes,assignment-writes,reads,read-scopes,relations,views,dev-fixtures}.ts` ;
- `presentation/http/{academic-year,period,level,class,subject,class-subject,assignment}.controller.ts` ;
- `apps/api/tests/{academics.test,academic-e2e-fixtures}.ts` ;
- `packages/contracts/src/academics.ts` ;
- `packages/database/prisma/migrations/20260907000100_academic_lifecycle/migration.sql` ;
- `apps/web/src/features/academics/{academic-client,academic-client.test,academic-components,academic-editor,academic-list,academic-workspace}.{ts,tsx}` selon le composant ;
- `apps/web/e2e/{academic-helpers,academics.spec}.ts` ;
- `docs/lot6-academics.md` et le présent rapport.

Modifications : AppModule, dev-access, scope ASSIGNED du repository Students, fixtures HTTP
navigateur, tests LOT 1 (attente des données et liste des API autorisées), routes Classes/Subjects,
suppression de leurs anciennes fonctions mock, messages FR/EN/AR, contrats IAM/export, schéma
Prisma, seed, script racine academics:test, README et index documentaire. Les libellés de deux
étapes CI précisent désormais leur couverture académique ; leurs commandes restent inchangées.
Une interpolation rich-text préexistante de la page de connexion est également corrigée,
avec trois tests de traduction et une assertion navigateur sur le texte mis en couleur.
Next régénère `next-env.d.ts` selon le mode build/dev ; ce fichier n'est pas édité manuellement.

## 2–8. Endpoints académiques

Toutes les routes commencent par `/api/v1`. **38 endpoints** :

| Point | Ressource    | Opérations                                                                                                           |
| ----- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| 2     | Années       | GET/POST `academic-years`, GET/PATCH `academic-years/:id`, POST `:id/activate`, `:id/close`, `:id/archive`           |
| 3     | Périodes     | GET/POST `academic-years/:yearId/periods`, PATCH `academic-periods/:id`, POST `academic-periods/:id/archive`         |
| 4     | Niveaux      | GET/POST `levels`, GET/PATCH `levels/:id`, POST `:id/archive`, `:id/restore`                                         |
| 5     | Classes      | GET/POST `classes`, GET/PATCH `classes/:id`, POST `:id/archive`, `:id/restore`                                       |
| 6     | Matières     | GET/POST `subjects`, GET/PATCH `subjects/:id`, POST `:id/archive`, `:id/restore`                                     |
| 7     | Coefficients | GET/POST `classes/:classId/subjects`, PATCH/DELETE `classes/:classId/subjects/:subjectId`                            |
| 8     | Affectations | GET/POST `teaching-assignments`, PATCH `teaching-assignments/:id`, POST `:id/archive`, GET `me/teaching-assignments` |

Zod strict valide les UUID, dates, enums, tailles, séquences, coefficients, PATCH et query.
Pagination SQL par défaut 25, maximum 100 ; recherche, statut, tri stable et filtres pertinents.
Les erreurs 400/401/403/404/409 portent des codes stables et un requestId, sans Prisma brut.
Aucun contrôleur n'appelle Prisma.

## 9–11. ASSIGNED, RBAC et multi-tenant

ASSIGNED est calculé en SQL à partir du user IAM lié à l'enseignant actif et de ses affectations
actives. Classe, matière, niveau, période doivent être actifs ; l'année ne doit pas être archivée.
Les filtres sont appliqués avant pagination et comptage. Les associations à une classe non
affectée restent cachées même si une matière est partagée. Le scope élèves du LOT 5 bénéficie
de ces mêmes conditions, sans ajout de module d'inscription.

SCHOOL_ADMIN, DIRECTOR et ACADEMIC_STAFF administrent les sept ressources dans leur tenant.
TEACHER lit uniquement ASSIGNED et ne peut pas s'affecter lui-même. ACCOUNTANT/PARENT/STUDENT
n'ont pas de nouveaux droits académiques. ACADEMIC_STAFF obtient seulement la lecture Teachers
nécessaire au choix d'enseignant, pas d'écriture sur cet annuaire. Total : 26 permissions
académiques, dont six de lecture. Deny by default et contrôle PLATFORM explicite conservés.

Tenant exclusivement issu du RequestContext ; body/query tenantId et en-tête arbitraire refusés.
Les UUID cross-tenant connus, chacune des relations croisées et l'absence de fuite dans les
listes/filtres sont couverts par les tests HTTP. Les FK composites restent actives en PostgreSQL.

## 12–13. Workflows et audit

Année `DRAFT → ACTIVE → CLOSED → ARCHIVED`, une seule ACTIVE par tenant, aucune réouverture.
Clôture et modifications enfants sont sérialisées par verrou du tenant dans la transaction.
Périodes TRIMESTER/SEMESTER : dates incluses dans l'année, séquences uniques/cohérentes,
chevauchement et mélange des types actifs interdits. Année de classe immuable par PATCH.

Archivage logique des références ; aucune suppression de personne, année, période, niveau,
classe, matière ou affectation. Le seul DELETE retire un class_subject inutilisé ; une
affectation, même archivée, ou une évaluation bloque ce retrait. Coefficients Decimal(5,2)
strictement positifs sur class_subjects uniquement. Affectation limitée à la même année et à
des références actives. Les contraintes historiques ne sont pas contournées.

Les 25 actions demandées et `academic_period.archived`, soit **26 actions**, sont vérifiées
dans l'audit transactionnel : tenant, acteur, membership, ressource, requestId, timestamp et
before/after. Les triggers append-only et d'immutabilité historiques sont conservés.

## 14–18. Interfaces, langues et RTL

- Classes : cartes LOT 1, recherche serveur, filtres année/niveau/statut, création, édition,
  archivage/restauration ; détails avec matières, coefficients et affectations réelles.
- Subjects : table réelle, recherche, création, édition, archivage/restauration, aucun
  coefficient sur la matière globale.
- Années, périodes et niveaux : gestion dans la route Classes existante, sans nouvelle route.
  Activation, clôture et archivage utilisent des confirmations ; années fermées en lecture seule.
- Affectations : choix d'un lien classe/matière, d'un enseignant réel LOT 5 et d'une période ;
  modification/archivage dans le détail de classe. Vue personnelle en lecture seule pour TEACHER.
- FR/EN/AR : tous les textes ajoutés traduits, RTL, labels, formulaires, selects, focus restauré,
  navigation clavier, dialogs et tableaux à défilement interne. Détails et formulaires sont
  réinitialisés lors d'un changement de tenant/membership.

États chargement/vide/erreur/accès refusé présents. Aucune donnée mock codée en dur sur ces deux
routes : même les données fictives de démonstration sont lues via l'API et PostgreSQL.
Les données d'inscription, salles, occupation et professeur principal auparavant simulées ne
sont pas inventées pour remplir les cartes ; les enseignants réels sont affichés dans le détail.

## 19–21. Tests backend, frontend et Playwright

- **151/151 tests HTTP** réels PostgreSQL/Redis : 50 IAM + 55 annuaires LOT 5 + 46 académiques.
  Les 46 cas incluent activations concurrentes, workflow, périodes, cinq listes paginées,
  quatre relations cross-tenant, coefficients, historique, scope ASSIGNED, droits et audit.
- **109/109 tests unitaires** : API 57, Web 39, UI 6, configuration 3, infrastructure 2,
  database 1, worker 1. Nouveaux cas académiques : 35 politiques/contrats et 23 UI
  permissions/erreurs. Trois cas supplémentaires protègent le rich-text de connexion FR/EN/AR.
- **18/18 tests d'intégrité** sur la base existante et **18/18 sur une base totalement neuve**.
- Playwright ciblé LOT 6 : **6/6 réussis**, 360×800 et 1440×900, en 6,6 minutes.
  Workflow complet réel, FR/EN/AR, formulaires, clavier, focus, audits axe desktop, lecture
  TEACHER et refus HTTP 403 d'administration.
- Suite Playwright racine complète : **42 réussis, 56 déclinaisons non exécutées volontairement, 0 échec**.
  Dernière exécution après la correction de traduction : **10,7 minutes** pour Playwright,
  **11 min 36,178 s** pour la commande racine, **code de sortie 0**, **10 tâches réussies**.
  Résultat persistant `apps/web/test-results/.last-run.json` : **passed**, `failedTests: []`,
  terminé le 8 septembre à **19:41:06 Europe/Paris**, après le build final de 19:28.
  Journal local : `/tmp/gestschool-lot6-final-e2e.log`. Les deux exécutions complètes précédentes
  étaient également réussies, dont celle terminée à 08:16 après renforcement des libellés longs.
  Les fixtures couvrent un libellé de niveau de 94 caractères, dont un mot de 80 caractères.

La couverture exécutée utilise les sept tailles demandées : 360×800, 414×896, 768×1024,
1024×768, 1366×768, 1440×900 et 1920×1080. Les parcours de mutation complets sont exécutés
sur mobile et desktop ; langues et lecture enseignant le sont sur les sept tailles. Les
skips prévus ne remplacent aucun test en échec. Les audits axe ne constituent pas une
certification manuelle exhaustive WCAG.

| Résolution | Parcours réussis | Déclinaisons non exécutées |
| ---------- | ---------------- | -------------------------- |
| 360×800    | 8                | 6                          |
| 414×896    | 4                | 10                         |
| 768×1024   | 4                | 10                         |
| 1024×768   | 4                | 10                         |
| 1366×768   | 7                | 7                          |
| 1440×900   | 10               | 4                          |
| 1920×1080  | 5                | 9                          |

Les 98 déclinaisons sont les 14 scénarios sur sept résolutions. Les 42 exécutés couvrent
15 parcours LOT 1/IAM, 11 LOT 5 et 16 LOT 6. Zéro erreur console, page ou API inattendue,
zéro débordement sur les parcours certifiés. Les refus HTTP intentionnels sont vérifiés à part.

Sur la couverture exécutée, les compteurs de sécurité et d'intégrité sont nuls :
`cross-tenant leaks = 0`, `permission bypass = 0`, `invalid academic transitions = 0`
(aucune transition interdite acceptée), `destructive historical deletes = 0`,
`migration errors = 0`, `orphan records = 0`, `console errors = 0`, `page errors = 0`,
`unexpected API errors = 0`, `overflow = 0`, `test access regressions = 0`.
Ces résultats décrivent les contrôles réalisés, pas une garantie exhaustive hors couverture.

## 22–23. Migration et base neuve

Migration additive `20260907000100_academic_lifecycle` : statuts d'archivage des années,
périodes, niveaux, classes, matières et affectations, timestamp des affectations, huit CHECK
supplémentaires, un index partiel et un trigger de cohérence d'année d'affectation.
Précontrôle des données existantes, aucune perte.
Les trois migrations précédentes sont inchangées.

Base neuve créée depuis `template0` : **gestschool_lot6_cert_20260908_01**.
Avant migration : **0 table dans public**. Séquence exécutée : `migrate deploy` (quatre migrations) → seed
→ **18/18 tests d'intégrité**, puis contrôle des contraintes et des orphelins.
Les **46/46 tests HTTP académiques** ont ensuite été rejoués sur cette même base, en 98,75 secondes. Base conservée
pour inspection ; aucune base existante n'a été réinitialisée ou supprimée.

| Invariant                                                   | Base existante    | Base neuve        |
| ----------------------------------------------------------- | ----------------- | ----------------- |
| Modèles métier / total avec IAM                             | 43 / 47           | 43 / 47           |
| FK LOT 3 présentes                                          | 67/67             | 67/67             |
| CHECK LOT 3 présents                                        | 27/27             | 27/27             |
| Index explicites LOT 3 présents                             | 125/125           | 125/125           |
| Triggers LOT 3 présents                                     | 4/4               | 4/4               |
| Total FK / CHECK / index / triggers hors métadonnées Prisma | 72 / 40 / 180 / 7 | 72 / 40 / 180 / 7 |
| Contraintes non validées                                    | 0                 | 0                 |
| Migration errors                                            | 0                 | 0                 |
| Orphan records (toutes les FK)                              | 0                 | 0                 |

Empreinte SHA-256 de la migration initiale inchangée :
`ae5d52cbf5b78b1d31dffa4a968f3d127144418d3bb02ae7b1a3ff247fcb12a8`.

## 24–25. Accès de test et démonstration

`pnpm dev:access` : **7/7 connexions HTTP réussies**, tenant et rôles vérifiés, MFA réel pour
SCHOOL_ADMIN, DIRECTOR et ACCOUNTANT. Les quatre autres comptes restent utilisables sans MFA
obligatoire conformément au LOT 5. Le fichier local d'accès a été régénéré : utiliser ses
valeurs actuelles, pas un ancien mot de passe. Aucun secret n'est ajouté au dépôt/rapport.
Permissions vérifiées : `.local` 0700, `test-access.json` 0600. La commande
`pnpm dev:totp school-admin@example.invalid` a également été exécutée avec succès ; son code
éphémère n'est pas reproduit.

Démonstration ajoutée : une année, trois trimestres, un niveau, une classe, une matière,
coefficient 4 et trois affectations au compte teacher. Seconde préparation exécutée :
`created=false`, nombres de lignes identiques. Le tenant démo contient désormais
2 années, 4 périodes, 2 niveaux, 2 classes, 2 matières, 2 liens et 3 affectations, seed historique
compris. Aucune inscription ajoutée par cette préparation ; aucune année fermée rouverte.

Contrôle local supplémentaire : `pnpm dev`, web `/fr/login` HTTP 200, API `/health/live` et
`/health/ready` HTTP 200, dépendances toutes `up`, worker « GestSchool worker is ready » sans
serveur HTTP. Connexion réelle avec le compte enseignant local puis affichage de sa classe
« Sixième A — Démo » en FR 360×800 et AR 1440×900 : aucune commande de création administrative,
débordement 0, erreurs console/page 0. Captures de ces deux pages inspectées visuellement.
Le texte de connexion mis en couleur a aussi été vérifié dans le navigateur en FR/EN/AR.

## 26–31. Préservation des LOT précédents et du backup

26. LOT 1 : tokens, composants UI, thèmes, navigation, autres écrans et mocks inchangés ;
    seuls Classes/Subjects sont branchés et leurs données simulées retirées. Correction ciblée
    du rich-text de connexion préexistant, sans changement de design ni d'authentification.
27. LOT 2 : Compose et packages infrastructure inchangés ; PostgreSQL, Redis et MinIO sains,
    accès anonyme au bucket privé refusé.
28. LOT 3 : 43 modèles métier, 67 FK, 27 CHECK et toutes les contraintes historiques présents.
    Prisma, client et adapter PostgreSQL **7.10.0 GA** ; lockfile inchangé, aucun package RC.
29. LOT 4 : **50/50 tests IAM**, authentification/MFA/sessions et guards conservés.
30. LOT 5 : **55/55 tests annuaires**, API et accès locaux préservés. Seul ASSIGNED est renforcé
    par les référentiels réels ; lecture Teachers ajoutée à ACADEMIC_STAFF pour son sélecteur.
31. Backup Figma `/home/ballo/projets/GestSchool_V3_figma_backup_20260903` : **88 fichiers**,
    empreinte inchangée `87f67b645d20eeee8afaf1a103026ea01f80b52a915ce2b9dfc7cf4d41349715`.

## Commandes et versions réellement vérifiées

| Commande                                                | Résultat                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                        | OK, aucun changement de dépendance                                  |
| `pnpm infra:up`                                         | OK, trois services sains                                            |
| `pnpm infra:check`                                      | PostgreSQL, Redis, S3/MinIO et bucket privé PASS                    |
| `pnpm db:generate`                                      | OK, Prisma 7.10.0                                                   |
| `pnpm db:migrate:deploy`                                | OK sur base existante et base vide, quatre migrations               |
| `pnpm db:seed`                                          | OK sur les deux bases                                               |
| `pnpm db:test`                                          | 18/18 sur chaque base                                               |
| `pnpm dev:access`                                       | 7/7 logins HTTP et préparation académique                           |
| Seconde `prepareAcademicDemo`                           | Idempotence confirmée, aucune duplication                           |
| `pnpm format:check`                                     | OK, y compris le rapport final                                      |
| `pnpm lint`                                             | OK, zéro avertissement toléré                                       |
| `pnpm typecheck`                                        | OK, 14 tâches                                                       |
| `pnpm test`                                             | 109/109                                                             |
| `pnpm build`                                            | OK, 9 tâches, 68 pages générées                                     |
| `pnpm iam:test`                                         | 151/151, en 77,82 secondes pour les suites                          |
| Playwright ciblé academics, projets 360×800 et 1440×900 | 6/6                                                                 |
| `pnpm test:e2e`                                         | 42 réussis, 56 skips intentionnels, 0 échec ; relance finale passed |
| `pnpm dev:totp school-admin@example.invalid`            | OK, code éphémère non reproduit                                     |
| `pnpm dev` et sondes web/API/worker                     | OK, démarrage et contrôles locaux réussis                           |
| Navigateur local enseignant et connexion FR/EN/AR       | OK, affichage réel, aucun débordement ni erreur navigateur          |
| `git diff --check`                                      | OK                                                                  |
| Audit SQL invariants/orphelins et empreintes            | OK sur les deux bases                                               |

Versions installées lues localement : Node **24.20.0**, pnpm **10.24.0**, Prisma/client/adapter-pg
**7.10.0**, pg **8.23.0**, PostgreSQL **18.6**, NestJS **12.0.1**, Next.js **16.3.4**, React
**19.2.8**, next-intl **4.14.2**, TypeScript **6.0.2**, Zod **4.5.4**, Vitest **5.0.0**,
Playwright **1.62.1**, Turbo **2.10.12**, Oxlint **1.81.0**, Prettier **3.9.6**.

Les relances Turborepo réutilisent les résultats des tâches inchangées ; les tâches modifiées
sont réexécutées et Playwright n'est pas mis en cache. La certification est locale : aucun
workflow GitHub distant n'a été lancé par l'agent.

## 32. Écarts, limite locale et incidents résolus

- Structure additive nécessaire : le schéma historique ne permettait pas l'archivage demandé.
  Aucun nouveau modèle métier, aucune migration historique remplacée.
- WeeklyHours absent du schéma : non ajouté. L'unicité historique des périodes/affectations
  reste réservée après archivage ; pas de restauration d'affectation ajoutée hors demande.
- Chargements de relations Prisma 7 séquencés par pages après identification de l'avertissement
  pg de concurrence transactionnelle ; suites HTTP relancées sans cet avertissement. Aucun
  flag Preview, downgrade pg, masquage de warning ou dépendance nouvelle.
- Corrections de certification : types optionnels stricts, import devenu inutilisé, tri non
  mutant, séparation des hooks React et fonctions pures pour les tests frontend. Toutes sont
  corrigées ; aucune exclusion de test ajoutée pour ces erreurs.
- Contrôle local : une indisponibilité PostgreSQL transitoire au premier démarrage du worker
  a disparu au contrôle des dépendances et à la relance, sans modification de l'infrastructure.
  Le navigateur de développement utilise `localhost:3000` : le refus HMR de l'origine
  `127.0.0.1` n'a pas été contourné par un élargissement de la configuration Next.js.
- Limite d'environnement non bloquante : à la dernière relance, Next dev signale un système
  de fichiers lent (benchmark 241 ms). Le serveur démarre ; aucun avertissement de compilation
  ou de typage n'est présent dans le build certifié. Ce diagnostic de performance local n'est
  pas masqué et ne justifie pas de déplacer le projet ou modifier son infrastructure dans ce lot.
- Défaut préexistant de traduction de connexion : `{highlight}` recevait une fonction rich-text
  au lieu d'une valeur, supprimant le mot coloré et produisant un avertissement React en dev.
  Correction des balises ICU FR/EN/AR et de leur valeur, avec trois tests et une assertion E2E.
  Aucun warning supprimé ni changement des sessions, identifiants ou contrôles IAM.
- Bibliothèques Chromium locales déjà disponibles sous `/tmp/gestschool-pw-libs.AdvD38` utilisées
  via LD_LIBRARY_PATH ; la CI conserve l'installation officielle `--with-deps chromium`.
- Interruptions de quota de validation d'outils : reprise après renouvellement, sans contourner
  les permissions. Une lecture psql sans mot de passe a été corrigée avec le compte local ;
  elle n'avait créé ni modifié de base.

## 33–35. Hors périmètre, verdict et commit proposé

33. Aucun LOT 7 commencé : inscriptions/réinscriptions, admissions, factures, évaluations, notes,
    bulletins, présence, emploi du temps, salles, documents/PDF/QR, envoi, jobs métier et R2 réel
    restent hors périmètre. Les fixtures d'intégrité utilisent les tables historiques sans
    exposer de nouveau module métier.
34. **GO** : commandes obligatoires réussies, migration existante/neuve certifiée, contrôles
    multi-tenant/RBAC/audit et parcours navigateur réussis. Aucun échec restant dans la couverture
    exécutée ; 43 modèles métier conservés, Prisma 7.10.0 GA, aucun package RC, backup intact.
35. Message de commit proposé : `feat(lot6): connect tenant-safe academic references and teaching assignments`.
