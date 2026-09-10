# LOT 8 — Certification Finance

Certification locale du 10 septembre 2026. **GO — LOT 8 certifié.**
Périmètre : frais, factures, paiements, reçus métier et caisse. Aucun LOT 9.
Les conventions détaillées sont dans [lot8-finance.md](./lot8-finance.md).

## Commandes réellement exécutées

| Commande / contrôle                                                                                  | Résultat final observé                                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                     | PASS, lockfile inchangé                                                        |
| `pnpm infra:up`                                                                                      | PASS, PostgreSQL / Redis / MinIO sains                                         |
| `pnpm infra:check`                                                                                   | PASS, PostgreSQL, Redis, S3 local et bucket privé                              |
| `pnpm db:generate`                                                                                   | PASS, client Prisma 7.10.0                                                     |
| `pnpm db:migrate:deploy`                                                                             | PASS, deux migrations LOT 8 additives                                          |
| `pnpm db:seed`                                                                                       | PASS                                                                           |
| `pnpm db:test`                                                                                       | PASS, 18/18 sur la base locale et la base neuve                                |
| `pnpm dev:access`                                                                                    | PASS, 7/7 connexions HTTP, MFA des rôles privilégiés                           |
| `pnpm dev:totp school-admin@example.invalid`                                                         | PASS, code masqué dans le compte rendu                                         |
| Double préparation des fixtures Finance                                                              | PASS, aucun doublon ni changement des compteurs                                |
| `pnpm format:check`                                                                                  | PASS                                                                           |
| `pnpm lint`                                                                                          | PASS, zéro warning accepté                                                     |
| `pnpm typecheck`                                                                                     | PASS, 14 tâches                                                                |
| `pnpm test`                                                                                          | PASS, 221/221 tests unitaires                                                  |
| `pnpm build`                                                                                         | PASS, 9 tâches, dernier passage après corrections effectué                     |
| `pnpm iam:test`                                                                                      | PASS, 245/245 tests HTTP des cinq modules                                      |
| Finance sur PostgreSQL neuf                                                                          | PASS, 52/52 tests HTTP / SQL / concurrence                                     |
| `pnpm test:e2e`                                                                                      | PASS, 74 scénarios réussis, 66 répétitions volontairement ignorées, zéro échec |
| Audit SQL des deux bases                                                                             | PASS, zéro orphelin / erreur de migration                                      |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code` | PASS, migration vide / aucune dérive                                           |
| `git diff --check`                                                                                   | PASS                                                                           |

Les commandes interrompues ou échouées pendant les corrections ne sont pas comptées comme des
réussites. Les caches Turbo des packages inchangés sont conservés ; le dernier `pnpm test` a
néanmoins rejoué les 221 tests sans cache. Les tests HTTP/DB et Playwright s'exécutent réellement
et ne sont pas mis en cache.

## Socle et préservation SQL

Versions installées : Node.js 24.20.0, pnpm 10.24.0, Prisma / client / adaptateur PostgreSQL
7.10.0 GA, PostgreSQL 18.6, Next.js 16.3.4, React 19.2.8, TypeScript 6.0.2,
Vitest 5.0.0, Playwright 1.62.1, Turborepo 2.10.12, Oxlint 1.81.0 et Prettier 3.9.6.
Aucun package ajouté pour LOT 8, aucune dépendance RC introduite.

| Audit du catalogue                            | Base locale | Base neuve |
| --------------------------------------------- | ----------: | ---------: |
| Modèles Prisma                                |          49 |         49 |
| FK                                            |          88 |         88 |
| CHECK                                         |          50 |         50 |
| Index applicatifs                             |         199 |        199 |
| Triggers non internes                         |          43 |         43 |
| Objets historiques initiaux conservés         |     223/223 |    223/223 |
| Erreurs de migration                          |           0 |          0 |
| Orphelins, toutes FK contrôlées               |           0 |          0 |
| Inscriptions dupliquées / classes surchargées |       0 / 0 |      0 / 0 |
| Inscriptions du workflow sans événement       |           0 |          0 |

Les 43 modèles d'origine sont conservés ; les six ajouts cumulés sont quatre modèles IAM,
EnrollmentEvent (LOT 7) et FeeInstallment (LOT 8).
SHA-256 de la migration initiale inchangée :
`ae5d52cbf5b78b1d31dffa4a968f3d127144418d3bb02ae7b1a3ff247fcb12a8`.

## Résultats obligatoires

Dans la couverture effectivement exécutée (tests unitaires, HTTP/SQL, concurrence et navigateur) :

```text
monetary precision errors = 0
cross-tenant leaks = 0
permission bypass = 0
duplicate payment = 0
overpayment = 0
corrupted invoice balances = 0
duplicate invoice refs = 0
duplicate receipt refs = 0
destructive payment deletes = 0
orphan financial records = 0
migration errors = 0
console errors = 0
page errors = 0
unexpected API errors = 0
overflow = 0
dev access regressions = 0
```

Les refus métier/sécurité attendus sont testés comme tels, pas comptés comme des erreurs inattendues.
Ces résultats ne constituent pas une garantie exhaustive contre tout scénario futur non testé.

## Compte rendu demandé

1. **Fichiers créés/modifiés.** Nouveau module `apps/api/src/modules/finance/` (service, port,
   règles, infrastructure, contrôleur, module, fixtures publiques et tests unitaires), contrats
   `packages/contracts/src/finance.ts`, tests HTTP `apps/api/tests/finance.test.ts` et
   `apps/api/tests/finance-helpers.ts`, interface
   `apps/web/src/features/finance/`, `apps/web/e2e/finance.spec.ts`, deux migrations et deux documents
   LOT 8 et liens depuis les README. Modifications d'AppModule, des permissions IAM/CORS, de `dev-access`, des seules fixtures
   locales Academics/Enrollments, du schéma Prisma, des exports Contracts, du script `finance:test`,
   de la CI, des fixtures E2E, des tests de lecture du comptable, des trois catalogues i18n, de la route
   Finance et du profil élève. Le client HTTP commun accepte l'en-tête d'idempotence lors des reprises.
   Suppression du composant Finance simulé devenu inutilisé dans `administration-pages.tsx`.
   `next-env.d.ts` est régénéré par Next, sans édition manuelle. Les fichiers `.local/` restent ignorés.
2. **Architecture.** Controller → service applicatif → port de repository → infrastructure Finance.
   Aucun Prisma dans le contrôleur. Le module possède ses douze tables, dont les échéances additives.
   `finance.dev.ts` est son entrée publique de préparation locale ; aucun module tiers n'importe
   ses repositories internes.
3. **Fee types.** Création, lecture, modification, archivage et restauration tenant-scoped.
   Un type utilisé historiquement n'est pas supprimé physiquement.
4. **Fee schedules.** Grilles par année/devise, niveau et classe optionnels ; tarifs CRUD,
   références académiques réelles et protection contre les relations cross-tenant.
5. **Échéanciers.** Table additive `fee_installments`, montant positif, date, ordinal unique.
   La somme d'un échéancier complet est exactement le tarif. Dates ordonnées dans l'année.
   Sans échéancier, une échéance unique correspond au tarif intégral.
6. **Réductions/adjustments.** DISCOUNT, SCHOLARSHIP, CREDIT, DEBIT, CORRECTION.
   Montant signé, devise de facture, raison, acteur et date ; append-only, sans réécriture des lignes.
   Les réductions ne peuvent abaisser le total sous le net encaissé. Pas de pourcentage implicite.
7. **Factures.** Émission atomique pour une inscription ACTIVE et des références académiques
   valides ; snapshot de l'élève, classe, année et grille. Pas de nouvelle facture sur une inscription
   terminée/retirée. Recouvrement historique autorisé après clôture de l'année.
8. **Numérotation factures.** `FAC-annéeUTC-séquence`, unique par tenant, UUID distinct.
   Génération SQL sous verrou du tenant, testée avec des créations concurrentes.
9. **Lignes.** Copie du libellé et des échéances à l'émission. Quantité × prix unitaire exact.
   Une modification ultérieure de grille ou de frais ne change pas la facture historique.
10. **Paiements.** Montants BIGINT, devises explicites, CASH / BANK_TRANSFER / CHECK / OTHER.
    Saisie PENDING puis validation explicite COMPLETED. Un PENDING erroné peut passer FAILED par
    rejet motivé et audité, sans suppression. Aucun prestataire externe.
11. **Paiements partiels.** Exemple testé : facture 300 000 XOF, encaissements 100 000 puis 50 000,
    restes 200 000 puis 150 000. L'interface reprend les valeurs calculées par l'API.
12. **Allocations.** Une ou plusieurs factures du même élève/tenant/devise. Convention LOT 8 :
    paiement entièrement ventilé, aucun portefeuille de crédits non affectés. Contrôles atomiques
    du montant du paiement et du disponible de chaque facture.
13. **Idempotence.** `Idempotency-Key` obligatoire, contextualisée tenant/opération et empreinte
    SHA-256 du payload normalisé. Dix requêtes simultanées identiques produisent un seul paiement ;
    même clé et autre contenu donnent 409. Reprise navigateur avec la même clé et le même contenu.
14. **Validation.** Recontrôle du disponible sous verrou, allocations finalisées, statut et audit,
    création du reçu. Les paiements PENDING ne réservent pas le solde. Double validation protégée.
15. **Reversals/annulations.** Demande motivée puis confirmation motivée ; acteur/date conservés.
    Contre-écriture intégrale, statut REVERSED, paiement/allocations/reçu conservés. Double annulation
    protégée. Aucun DELETE correctif de paiement.
16. **Reçus.** Donnée métier produite atomiquement à la validation, montant exact du paiement,
    protection append-only ; le reçu indique encore le paiement annulé via son statut.
17. **Numérotation reçus.** `REC-annéeUTC-séquence`, unique dans le tenant, immutable et race-safe.
    Deux émissions concurrentes sont réellement testées.
18. **Caisse.** Une caisse ouverte par caissier/tenant, devise unique, CASH réservé à la caisse
    ouverte de l'acteur. Clôture : ouverture + encaissements − remboursements, déclaré/attendu/écart
    et raison. PENDING interdit la clôture. Une annulation après clôture utilise une caisse ouverte
    disposant des fonds, sans réécrire la clôture historique.
19. **Soldes/calculs.** `total = lignes + ajustements`, `reste = total − allocations nettes`.
    Entiers BigInt de bout en bout, JSON monétaire en chaînes, regroupement par devise.
    Agrégats SQL tenant-scoped, encaissements du jour, impayés et échéances en retard.
20. **Concurrence.** Verrou partagé du tenant pour les écritures financières et scolaires.
    Triggers SQL également verrouillants, contraintes différées au commit, lectures RepeatableRead.
    Dernier solde disponible, doubles validations/annulations et références concurrentes testés.
21. **RBAC.** SCHOOL_ADMIN/ACCOUNTANT : finance TENANT ; DIRECTOR : lecture et validation.
    ACADEMIC_STAFF/TEACHER : pas d'administration financière. ACCOUNTANT peut lire les références
    de facturation mais ne peut toujours ni modifier les académies/inscriptions ni les notes.
22. **OWN/CHILDREN.** Student OWN et Parent CHILDREN : seules factures, paiements, reçus et
    agrégats autorisés. Filtrage de propriété appliqué avant pagination et agrégation.
23. **Multi-tenant.** Tenant exclusivement issu du RequestContext IAM. Contrats stricts,
    X-Tenant-ID rejeté, FK composites. Les UUID d'une autre école ne divulguent pas l'existence.
24. **Audit.** Les treize actions requises sont vérifiées, avec tenant, acteur, ressource, requête,
    date et contexte financier ; raisons sur les corrections. Audit append-only, aucun secret loggé.
25. **Frontend Finance.** Page réelle : synthèse, listes paginées, filtres serveur, détails,
    formulaires frais/grilles/échéances, facturation, paiements, validation, annulation, reçus et caisse.
    Composants UI existants réutilisés. Aucun total fourni par le navigateur ne fait autorité.
26. **Student Profile.** Onglet « Situation financière » branché sur la vraie API, avec factures,
    paiements, échéances, total payé et reste. Profil People et historique Enrollment conservés.
27. **Portails Parent/Student.** Consultation financière dans la surface existante, sans action
    administrative, sans caisse ni paiement en ligne. Tests OWN/CHILDREN et agrégats non divulgués.
28. **i18n/RTL.** FR/EN/AR pour toutes les nouveautés, erreurs stables traduites, formats monétaires
    localisés sans float ; tests au-delà de 2^53 et sur les fractions/signes, direction RTL vérifiée.
29. **Responsive/accessibilité.** Matrice 360×800, 414×896, 768×1024, 1024×768, 1366×768,
    1440×900 et 1920×1080 validées. Contrôles automatiques axe WCAG A/AA, noms accessibles,
    focus des dialogs, clavier, Escape et limites de tableaux/dialogs ; pas de certification manuelle
    sur un lecteur d'écran physique.
30. **Tests unitaires.** 221/221 : API 132 (dont Finance 37), Web 76 (dont Finance 15), UI 6,
    configuration 3, infrastructure 2, database 1, worker 1.
31. **Tests HTTP.** `pnpm iam:test` : 245/245, IAM/People/Academics/Enrollments/Finance sur
    PostgreSQL et Redis réels. Finance 52/52, y compris refus 400/401/403/404/409.
32. **Invariants Finance.** Tests SQL directs : allocations plafonnées, devises cohérentes,
    total/statut/lignes de facture protégés, paiement validé non éditable, reçu/adjustment/reversal
    non effaçables arbitrairement. Contrôle global des doublons, dépassements et liens orphelins.
33. **Tests concurrence.** Dix créations même clé ; collisions de dernier solde ; numéros facture
    et reçu ; double validation et double annulation. Pas de mocks PostgreSQL pour ces tests.
34. **Playwright.** Dernière commande racine : **74 réussites, zéro échec, 66 skips intentionnels**,
    140 scénarios déclarés, un worker, aucun retry local, durée Playwright 13,9 min.
    Les 74 exécutés comprennent 16 scénarios Finance et 58 scénarios des LOT 1–7.
    Les skips sont uniquement les répétitions de mutations/interactions réservées à certains formats ;
    les trois langues, RTL et scopes financiers sont vérifiés aux sept résolutions.
    Le workflow Finance complet est exécuté en 360×800 et 1440×900. `.last-run.json` indique
    `status: passed` et `failedTests: []`.
35. **Migration additive.** `20260909000100_finance` et
    `20260909000200_finance_workflow_guards`, après les cinq migrations précédentes. Provenances
    historiques nullables sans inventer d'inscription ni de snapshot ancien.
36. **Upgrade LOT 7.** Empreintes de toutes les anciennes colonnes/lignes des 48 tables avant et
    immédiatement après migration, avant seed : 48 comparées, zéro différence. Les onze tables
    Finance d'origine étaient vides. Aucune migration certifiée n'a été modifiée.
37. **Base neuve.** `gestschool_lot8_cert_20260909_01`, création TEMPLATE0 et contrôle initial
    zéro table publique, sept migrations → seed → 18/18 intégrité → 52/52 Finance, puis audit FK.
    Base conservée ; aucune base existante effacée ou réinitialisée.
38. **DEV/TEST.** Trois factures de 300 000 XOF (ISSUED, PARTIALLY_PAID, PAID), deux paiements,
    deux reçus, trois échéances et une caisse. Double appel de préparation : compteurs identiques,
    un seul marqueur. Parent lié et même élève OWN. Les modifications historiques de la démo locale
    sont respectées ; un nouveau cycle additif a été nécessaire après une inscription terminée.
39. **Accès préservés.** Sept rôles authentifiés par HTTP, MFA vérifié quand requis, TOTP opérationnel.
    Fichier `.local/test-access.json` en 0600 et ignoré par Git. Les mots de passe ont été renouvelés
    par `dev:access` : utiliser ce fichier local, jamais les anciennes sélections de l'IDE.
40. **LOT 1.** Design system et composants partagés non modifiés ; mocks Finance remplacés dans
    leur seule surface. Tests unitaires LOT 1 conservés ; matrice navigateur globale validée,
    dont les 23 routes aux sept résolutions.
41. **LOT 2.** Infrastructure locale saine et contrôles PostgreSQL/Redis/MinIO/bucket privé PASS.
    Aucun ajout de service externe.
42. **LOT 3.** Prisma GA, modèles d'origine, 223 objets initiaux, historique de migrations et
    18 tests d'intégrité conservés ; audits des deux bases sans orphelin.
43. **LOT 4.** Authentification et protections IAM conservées, tests HTTP PASS. Seuls ajouts :
    permissions Finance, lectures de références du comptable, CORS Idempotency-Key et fixtures locales.
44. **LOT 5.** API People inchangée et tests HTTP PASS. Student Profile réutilisé, sans création
    d'élève artificiel dans le domaine Finance.
45. **LOT 6.** Workflow académique inchangé, tests HTTP PASS. Assertions mises à jour uniquement
    pour les lectures explicites du comptable et test ajouté d'interdiction des mutations.
46. **LOT 7.** Workflow/historique d'inscription, capacité, transitions et audit conservés.
    Aucun changement du SQL LOT 7 ; ajustement limité à la préparation locale du cycle de démo.
47. **Backup Figma.** 88 fichiers intacts dans
    `/home/ballo/projets/GestSchool_V3_figma_backup_20260903` ; SHA-256 agrégé inchangé :
    `87f67b645d20eeee8afaf1a103026ea01f80b52a915ce2b9dfc7cf4d41349715`.
48. **Écarts/décisions.** Échéancier complet à somme exacte ; paiement entièrement ventilé ;
    annulation intégrale ; workflow des enums existants COMPLETED/REVERSED ; verrou par tenant MVP.
    Bibliothèques Chromium fournies via le répertoire temporaire déjà utilisé au LOT 7, sans ajout
    applicatif ni installation système ; CI conserve `playwright install --with-deps chromium`.
    La commande racine locale utilise `TURBO_ENV_MODE=loose` pour transmettre `LD_LIBRARY_PATH`.
    Les essais initiaux ont corrigé validations BigInt, types optionnels, hydratation Prisma/pg,
    assertions RBAC devenues anciennes, fixture déjà terminée et libellé d'onglet Playwright.
    La première matrice racine a été arrêtée après découverte de l'allowlist LOT 1 qui excluait
    encore l'API Finance (17 réussites, un échec, un scénario interrompu). La suivante a été
    arrêtée après une attente de chargement Finance dépassant 10 s sous charge locale
    (41 réussites, un échec, un scénario interrompu). L'attente asynchrone ciblée est portée à
    30 s ; aucune assertion supprimée, aucun retry local ajouté, aucune règle applicative changée.
    Aucun échec ni warning TypeScript/build n'est ignoré. CI distante non déclenchée depuis cet agent.
    Au redémarrage local après certification, Next dev signale un système de fichiers lent
    (benchmark 266 ms). Ce diagnostic environnemental est conservé, non masqué ; le build de
    production est réussi. API live/ready et dépendances sont saines, worker prêt sans serveur HTTP.
49. **Reporté.** LOT 9 : notes, évaluations, moyennes, classements et bulletins, non commencés.
    LOT 10 : PDF officiels, reçus PDF finaux, QR et cartes, non commencés. Aucun Stripe, Mobile Money,
    Brevo ou R2 réel ; aucun moteur Reporting générique.
50. **Verdict.** **GO — LOT 8 certifié.** Commandes obligatoires, intégrité, base neuve,
    scénarios financiers, accès locaux et non-régression des LOT 1–7 validés.
    Le lockfile, l'infrastructure et l'audit SQL/backup ont été revérifiés après Playwright.
    Arrêt ici : aucun LOT 9 commencé.
51. **Commit proposé.** `feat(lot8): implement tenant-safe finance, payments, receipts and cash sessions`.
    Aucun commit créé automatiquement.
