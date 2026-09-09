# Certification LOT 7 — Inscriptions

Date : 9 septembre 2026. Périmètre : LOT 7 uniquement, à partir du commit LOT 6
`babeb0a`. **Verdict final : GO.** Certification navigateur complète et démarrage local validés.
Le détail des décisions et des règles se trouve dans [le guide technique](lot7-enrollments.md).

## 1. Fichiers créés et modifiés

```text
apps/api/src/modules/enrollments/
├── application/enrollment.service.ts
├── domain/{enrollment.repository,policy,policy.test}.ts
├── infrastructure/{database,dev-fixtures,enrollment.repository,reads,views,writes}.ts
├── presentation/http/enrollment.controller.ts
└── enrollments.module.ts
apps/api/tests/{enrollments.test,enrollment-e2e-fixtures}.ts
apps/web/src/features/enrollments/
├── enrollment-client.ts / enrollment-client.test.ts
├── enrollment-components.tsx
├── enrollment-page.tsx
├── enrollment-wizard.tsx
├── enrollment-actions.tsx
└── enrollment-history.tsx
apps/web/e2e/enrollments.spec.ts
packages/contracts/src/enrollments.ts
packages/database/prisma/migrations/20260909000100_enrollment_workflow/migration.sql
docs/lot7-enrollments.md
docs/lot7-certification.md
```

Modifiés : AppModule, garde de capacité Academics, préparation DEV IAM, serveur de fixtures E2E,
test visuel LOT 1, route Enrollments, onglet Student Profile, retrait des mocks et du badge 89,
messages FR/EN/AR, présentation de l'erreur de capacité Academics, exports/grants contracts,
schema.prisma, script racine `enrollments:test`, libellés CI, README et index documentaire.
`next-env.d.ts` est régénéré par Next entre modes build/dev. Aucun package applicatif ajouté,
aucun changement de lockfile ou migration historique.

## 2–8. Architecture et workflow

2. **Architecture** : présentation HTTP → application/contrats → port de repository → infrastructure.
   Le domaine porte les règles ; aucun contrôleur ne dépend de Prisma.
3. **Endpoints** : les huit routes demandées sont présentes ; s'ajoutent GET événements,
   POST complete et GET classes/capacités administratives. Préfixe `/api/v1`, aucun DELETE.
   Tableau exhaustif des onze routes dans le guide technique.
4. **Workflow réel** : création PENDING ; PATCH seulement PENDING ; confirmation ACTIVE ;
   transfert ACTIVE → ACTIVE ; annulation PENDING/ACTIVE → WITHDRAWN ; complétion ACTIVE → COMPLETED.
   États terminaux et années CLOSED/ARCHIVED en lecture seule.
5. **NEW** : tenant et références contrôlés, élève non archivé, année ouverte, classe/niveau actifs,
   dates et capacité valides. Unicité élève/année conservée, y compris après annulation.
6. **RE_ENROLLMENT** : antécédent confirmé pertinent dans une année strictement antérieure,
   cible différente et non déjà inscrite. L'ancien enrollment reste intact.
7. **TRANSFER** : opération atomique dans la même année, même tenant, classe différente et active,
   capacité disponible, raison/date/acteur obligatoires. Identifiant et type d'origine conservés.
   L'événement TRANSFERRED conserve source et destination ; pas de second enrollment.
8. **Annulation** : raison, date, acteur et événement conservés ; aucune suppression, place libérée,
   aucune réactivation arbitraire.

## 9–17. Historique, capacité et sécurité

9. **Historique métier** : table append-only distincte des audits, snapshots des noms de classe
   et d'acteur, statuts, type, date effective, raison, requestId et date d'enregistrement.
   Les inscriptions pré-LOT 7 reçoivent uniquement un état initial BASELINE honnête.
10. **Capacité** : champ LOT 6 réutilisé ; null = illimité ; PENDING réserve, ACTIVE occupe ;
    annulation/complétion libèrent. Agrégats réservées/actives/disponibles réels.
11. **Concurrence** : transaction PostgreSQL et verrou du tenant partagé avec Students/Academics ;
    protections contre inscription/transfert de dernière place et baisse de capacité concurrente.
12. **Pagination/recherche** : SQL, 25 par défaut/100 maximum, tous les filtres demandés et tri
    déterministe. Recherche nom/prénom/matricule et nom/code de classe.
13. **Multi-tenant** : contexte IAM seul faisant autorité, FK composites, filtrage tenant dans chaque
    lecture/écriture ; UUID hors périmètre non divulgués. Aucune autorité donnée au tenant client.
14. **RBAC** : sept permissions TENANT pour SCHOOL_ADMIN/DIRECTOR/ACADEMIC_STAFF ;
    aucun CRUD pour Parent/Student, aucun droit implicite Teacher/Accountant. Deny by default.
15. **OWN/CHILDREN** : liens réels User→Student et User→Guardian→StudentGuardian ;
    restrictions avant pagination, compteurs, détail et événements. Révocation après suppression du lien testée.
16. **Validation** : objets Zod stricts, UUID/dates civiles/type/raison/filtres/pagination,
    refus des champs inconnus, traductions des erreurs et requestId, aucune erreur Prisma brute.
17. **Audit** : les six actions demandées sont testées. Transfert contient anciennes/nouvelles classes,
    raison/date/acteur/requestId. Audit et événement dans la même transaction.

## 18–22. Frontend

18. **Enrollments** : vraie liste, recherche/filtres/tri/pagination, compteurs, consultation,
    préparation/modification, confirmation, transfert, annulation, complétion et historique.
    Loading, empty, forbidden, erreurs/conflict/duplicate/full/closed pris en charge.
19. **Assistant** : trois étapes réutilisant les composants LOT 1 ; élève/type → année/niveau/classe/
    capacité/date → récapitulatif. Préparation puis confirmation explicite depuis la liste.
    Sélecteurs serveur, années fermées désactivées, classe pleine bloquée avant soumission.
20. **Student Profile** : onglet d'historique réel avec année/niveau/classe/type/statut et événements ;
    annuaire et relations parents LOT 5 inchangés.
21. **i18n/RTL** : mêmes clés FR/EN/AR, texte métier traduit, direction arabe et contrôles RTL.
22. **Responsive/accessibilité** : les sept viewports passent avec navigation clavier, labels,
    focus/restauration, dialogs, select et contrôle d'overflow. Audit Axe WCAG A/AA passé sur les
    formulaires desktop et les écrans représentatifs historiques. Captures AR mobile et desktop
    inspectées visuellement ; aucun débordement horizontal constaté.

## 23–27. Tests

23. **Backend** : **192/192 HTTP**, dont IAM 50, annuaires 55, Academics 46 et Enrollments **41**.
    **95/95 unités API**, dont 38 règles domaine LOT 7. Contrôle des erreurs serveur intégré.
24. **Concurrence** : deux créations pour la dernière place → un 201 et un 409 ; deux transferts
    → un 200 et un 409 ; baisse de capacité concurrente → une seule opération compatible réussit.
    Contrôle des occupations finales et des rollbacks.
25. **Historique** : chaîne A → B → C avec dates, raisons, acteurs ; snapshots résistants au renommage ;
    UPDATE/DELETE et hard-delete refusés ; FK événement tenant/année/acteur réellement testées ;
    27 événements paginés 25 + 2 sans perte ni répétition.
26. **Frontend unités** : **61/61**, dont 22 LOT 7 : grants, états terminaux, années figées,
    crédit de réservation/capacité illimitée, erreurs traduites et distinction panne réseau/validation.
    Total monorepo **169/169**.
27. **Playwright** : trois scénarios LOT 7 ciblés sur 1440×900 passent. Matrice racine complète
    terminée : **58 cas actifs réussis, 61 exclusions intentionnelles, 0 échec** sur 119 cas déclarés.
    Les exclusions évitent de répéter certains workflows à toutes les tailles, sans masquer un échec.
    LOT 7 représente 16 cas actifs : deux workflows mobile/desktop, sept parcours langues et sept scopes.
    Résultat final retrouvé dans `apps/web/test-results/.last-run.json` : `status: passed`,
    `failedTests: []`, écrit le 09/09/2026 à **10:33:47 Europe/Paris**, après la fin des processus E2E.
    Les 58/61 correspondent aux cas actifs/exclus de la matrice explicite des tests.
    Le scénario négatif de doublon exige précisément un 409 et tolère uniquement son diagnostic
    réseau Chromium attendu ; les parcours nominaux exigent zéro erreur console/page/API.
    Aucun token/MFA/mot de passe dans les traces ; seules des captures d'un wizard fictif sont enregistrées.

| Résolution | Cas actifs réussis | FR/EN/AR + OWN/CHILDREN LOT 7 | Workflow mutation LOT 7 |
| ---------- | ------------------ | ----------------------------- | ----------------------- |
| 360×800    | 11                 | PASS                          | PASS                    |
| 414×896    | 6                  | PASS                          | Non répété              |
| 768×1024   | 6                  | PASS                          | Non répété              |
| 1024×768   | 6                  | PASS                          | Non répété              |
| 1366×768   | 9                  | PASS                          | Non répété              |
| 1440×900   | 13                 | PASS                          | PASS                    |
| 1920×1080  | 7                  | PASS                          | Non répété              |

## 28–30. Migrations et PostgreSQL

28. **Migration additive** : ajout du type d'origine nullable historiquement, d'un modèle d'événements,
    de quatre FK composites, quatre CHECK, sept index et quatre triggers.
    Les 43 modèles métier initiaux sont préservés ; **44 métier + 4 IAM = 48 modèles**.
    Les 223 objets nommés de l'initiale (FK/CHECK/index/triggers) sont présents, aucun manquant.
    Prisma `migrate diff --from-config-datasource --to-schema ... --exit-code` retourne 0,
    « No difference detected ». Les CHECK/triggers sont vérifiés séparément via les catalogues SQL.
29. **Upgrade DB LOT 6 existante** : avant l'upgrade, empreintes du contenu des 47 tables ; après
    migration, mêmes 47 contenus, zéro divergence (comparaison sans le nouveau champ type).
    Les **6 inscriptions existantes restent 6**, avec **6 BASELINE** ajoutés, sans données inventées.
    Puis seed, **18/18 intégrité**, **192/192 HTTP** et audit SQL. Aucun reset ni remplacement de DB.
30. **DB totalement neuve** : `gestschool_lot7_cert_20260909_01`, créée avec `template0`, **0 table
    public vérifiée avant migration**. Les cinq migrations → seed → **18/18 intégrité** →
    **41/41 HTTP LOT 7** → audit SQL passent. Base conservée pour inspection, aucune DB existante supprimée.

| Contrôle SQL                                | Base existante     | Base neuve         |
| ------------------------------------------- | ------------------ | ------------------ |
| FK / CHECK / index / triggers               | 76 / 44 / 187 / 11 | 76 / 44 / 187 / 11 |
| Objets historiques manquants                | 0                  | 0                  |
| Migration errors                            | 0                  | 0                  |
| Orphan records, toutes FK inspectées        | 0                  | 0                  |
| Doublons élève/année                        | 0                  | 0                  |
| Classes dépassant capacité PENDING + ACTIVE | 0                  | 0                  |
| Inscription workflow typée sans événement   | 0                  | 0                  |

SHA-256 initiale inchangée :
`ae5d52cbf5b78b1d31dffa4a968f3d127144418d3bb02ae7b1a3ff247fcb12a8`.
L'absence d'événements pour d'anciennes fixtures SQL non typées créées **après** l'upgrade
n'est pas présentée comme un historique inventé : le workflow HTTP crée systématiquement son événement.

## 31–38. Accès et préservation des LOT précédents

31. **Accès de test** : `pnpm dev:access` exécuté deux fois, **7/7 connexions HTTP/MFA** à chaque fois.
    Deuxième exécution : démos Academics/Enrollments conservées. Empreintes identiques des 4 inscriptions,
    11 événements, 5 classes, 3 années et 2 relations parent/enfant ; pas de doublon.
    Les timestamps de liaison des annuaires et identifiants de connexion sont rafraîchis par le helper
    préexistant ; les mots de passe sont volontairement renouvelés. `dev:totp` fonctionne,
    fichier local mode **0600**, ignoré par Git. Ne pas copier ces secrets dans un commit.
32. **LOT 1** : composants UI, styles/tokens, thèmes et backup inchangés. Enrollments et l'onglet
    d'historique sont branchés ; les autres mocks restent en place. Les 23 routes historiques passent
    sur les sept tailles, ainsi que thèmes, navigation, catalogue et accessibilité préexistants.
33. **LOT 2** : Compose et infrastructure inchangés, PostgreSQL/Redis/MinIO/accès privé vérifiés PASS.
34. **LOT 3** : Prisma/client/adapter **7.10.0 GA**, **zéro package Prisma RC**, migrations historiques
    et contraintes initiales conservées. Seed et 18 tests d'intégrité préservés.
35. **LOT 4** : **50/50 HTTP IAM**, authentification réelle, CSRF, MFA et RequestContext conservés.
36. **LOT 5** : **55/55 HTTP annuaires**, liaisons réelles, données locales et Student Profile préservés.
37. **LOT 6** : **46/46 HTTP Academics**, capacité renforcée sans duplication des référentiels ;
    la préparation locale ne réinitialise pas les classes/années déjà modifiées.
38. **Backup Figma** : `/home/ballo/projets/GestSchool_V3_figma_backup_20260903`, **88 fichiers**,
    empreinte inchangée `87f67b645d20eeee8afaf1a103026ea01f80b52a915ce2b9dfc7cf4d41349715`.

## Commandes réellement exécutées

| Commande                                                                        | Résultat                                                          |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                | OK ; lockfile inchangé                                            |
| `pnpm infra:up`                                                                 | OK ; services healthy                                             |
| `pnpm infra:check`                                                              | PostgreSQL, Redis, S3 et bucket privé PASS                        |
| `pnpm db:generate`                                                              | OK ; client Prisma 7.10.0                                         |
| `pnpm db:migrate:deploy`                                                        | OK sur existante et neuve ; réexécution sans migration en attente |
| `pnpm db:seed`                                                                  | OK sur les deux bases                                             |
| `pnpm db:test`                                                                  | 18/18 sur chacune                                                 |
| `pnpm dev:access`                                                               | 7/7 comptes HTTP deux fois ; démos idempotentes                   |
| `pnpm dev:totp school-admin@example.invalid`                                    | OK ; sortie secrète masquée dans la certification                 |
| `pnpm format:check`                                                             | OK                                                                |
| `pnpm lint`                                                                     | OK ; zéro warning autorisé                                        |
| `pnpm typecheck`                                                                | 14 tâches réussies                                                |
| `pnpm test`                                                                     | 169 unités validées ; 12 tâches réussies                          |
| `pnpm build`                                                                    | 9 tâches réussies ; Next compile et génère 68 pages               |
| `pnpm iam:test`                                                                 | 192/192 HTTP réels                                                |
| `pnpm --filter @gestschool/api test:iam tests/enrollments.test.ts` sur DB neuve | 41/41                                                             |
| Playwright ciblé LOT 7 desktop                                                  | 3/3                                                               |
| `pnpm test:e2e`                                                                 | PASS ; 58 actifs réussis, 61 exclusions intentionnelles, 0 échec  |
| Prisma format puis migrate diff read-only                                       | OK ; aucune dérive                                                |
| Audit SQL des contraintes/FK/orphelins/capacités et hash backup                 | OK sur les deux bases                                             |
| `pnpm dev`                                                                      | Web, API et worker démarrés ; environnement laissé disponible     |
| GET `/health/live` et `/health/ready`                                           | HTTP 200, statut ok ; PostgreSQL/Redis/stockage up                |
| GET `/fr/login`                                                                 | HTTP 200                                                          |
| GET `/api/v1/enrollments` sans authentification                                 | HTTP 401 attendu                                                  |

Dernier démarrage local contrôlé le 09/09/2026 vers 15:15 Europe/Paris. Web disponible à
`http://localhost:3000/fr/login`, API sur `127.0.0.1:3100`. Worker : log
`GestSchool worker is ready`, dépendances up, aucun port HTTP d'écoute.

Sur le périmètre certifié : doublons d'inscription = 0, accès cross-tenant autorisé = 0,
contournement de permission = 0, surcapacité = 0, perte d'historique = 0, suppression destructive = 0,
perte de données d'upgrade = 0, erreur de migration = 0, orphelin = 0, régression des accès DEV = 0.
Parcours navigateur nominaux : erreurs console/page/API inattendues = 0 et overflow détecté = 0.
Les 409 et diagnostics réseau du test négatif de doublon sont attendus et vérifiés séparément.

Les tâches sans modification peuvent être rejouées depuis le cache local Turborepo ; les suites
HTTP, intégrité et Playwright sont réellement exécutées et ne sont pas remplacées par un cache.
Les unités API/WEB/DB modifiées ont été exécutées dans ce lot. Les 12 unités Config/UI/Infrastructure/
Worker ont aussi été rejouées directement hors cache et passent toutes.

Versions installées inchangées : Node **24.20.0**, pnpm **10.24.0**, Prisma/client/adapter-pg
**7.10.0**, PostgreSQL **18.6**, pg **8.23.0**, NestJS **12.0.1**, Next **16.3.4**, React **19.2.8**,
next-intl **4.14.2**, TypeScript **6.0.2**, Zod **4.5.4**, Vitest **5.0.0**, Playwright **1.62.1**,
Turbo **2.10.12**, Oxlint **1.81.0**, Prettier **3.9.6**.

## 39–42. Écarts, limites et verdict

39. **Décisions explicites** : type historique nullable au lieu d'une reclassification inventée ;
    un modèle métier additionnel nécessaire ; transfert interne historisé sans changer le type d'origine ;
    réservation PENDING incluse dans la capacité ; wizard préparant puis confirmation distincte ;
    dates effectives non planifiées ; verrou par tenant adapté au LOT 7.
    Les tentatives initiales ont identifié puis corrigé des attentes de tests (403 tenant falsifié,
    attente de chargement avant Tab, Bearer manquant dans une assertion HTTP), des imports inutilisés,
    la notation des agrégats Prisma pour Oxlint et des signatures d'assertions Playwright.
    La commande Prisma directe sans environnement a été relancée avec `.env.example`.
    La première matrice racine a été arrêtée proprement (19 réussites, un scénario interrompu)
    pour reconstruire après la correction du libellé d'erreur réseau ; elle ne vaut pas certification
    complète. Le code final est ensuite vérifié par une nouvelle exécution racine.
    Aucun échec ni warning TypeScript/build n'est ignoré. Bibliothèques Chromium manquantes
    extraites dans `/tmp/gestschool-lot7-pw-libs.gv46nU` et utilisées via LD_LIBRARY_PATH,
    sans dépendance applicative ni changement système ; la CI conserve `--with-deps chromium`.
40. **Reporté** : Finance entière au LOT 8 ; notes, évaluations, présence, emploi du temps et envois
    ne sont pas développés. Documents officiels/cartes/QR restent au LOT 10.
41. **Verdict** : **GO — LOT 7 certifié**, commandes demandées et contrôles additionnels réussis.
    Prisma GA, intégrité DB, isolation, historique, capacité, langues et régressions préservés.
    Arrêt au LOT 7 ; le LOT 8 n'est pas commencé.
42. **Commit proposé** : `feat(lot7): implement tenant-safe enrollment lifecycle and immutable history`.
    Aucun commit, push ou déploiement de production effectué.
