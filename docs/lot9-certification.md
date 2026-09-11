# LOT 9 — Certification des résultats académiques

Certification du 11 septembre 2026 : **GO local pour le LOT 9**.
La nouvelle exécution GitHub reste à vérifier après publication du commit, non effectuée ici.
Périmètre exclusif : évaluations, notes, workflow, moyennes, rangs et bulletins métier.
Les règles détaillées et endpoints sont dans [lot9-results.md](lot9-results.md). Aucun LOT 10.

## Résultats vérifiés

| Commande ou contrôle                                   | Résultat observé                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                       | PASS, aucun package ajouté, lockfile inchangé                                                                               |
| `pnpm infra:up` / `pnpm infra:check`                   | PASS, PostgreSQL, Redis, MinIO et bucket privé                                                                              |
| `pnpm db:generate`                                     | PASS, Prisma 7.10.0 GA                                                                                                      |
| `pnpm db:migrate:deploy` / `pnpm db:seed`              | PASS sur base LOT 8 et base vide                                                                                            |
| `pnpm db:test`                                         | PASS, 18/18 sur les deux bases                                                                                              |
| `pnpm dev:access`                                      | PASS, 7/7 connexions HTTP réelles, MFA des rôles privilégiés                                                                |
| `pnpm dev:totp school-admin@example.invalid`           | PASS, code non publié                                                                                                       |
| Deux appels supplémentaires de préparation Results DEV | PASS, compteurs inchangés                                                                                                   |
| `pnpm format:check` / `pnpm lint`                      | PASS après les correctifs                                                                                                   |
| `pnpm typecheck`                                       | PASS, 14 tâches après les correctifs                                                                                        |
| `pnpm test`                                            | PASS, 296 tests unitaires (dont 186 API et 97 web)                                                                          |
| `pnpm build`                                           | PASS, 9 tâches, reconstruction après les correctifs UI                                                                      |
| Intégration LOT 9 sur base fraîche                     | PASS, 55/55 HTTP/SQL, dont classe de 301 élèves et cumul enseignant/parent                                                  |
| `pnpm results:test`                                    | PASS, 55/55, rejoué après redémarrage en 28,14 s                                                                            |
| `pnpm iam:test`                                        | PASS, 300/300, non-régression des LOT 4 à 9                                                                                 |
| Playwright ciblé desktop                               | PASS, parcours complet et parcours de lecture FR/EN/AR/familles/comptable                                                   |
| `pnpm test:e2e`                                        | PASS, suite complète de 161 cas déclarés sur sept résolutions ; verdict Playwright persistant `passed`, aucun test en échec |
| Prisma migrate diff datasource → schema                | PASS, migration vide, aucune dérive                                                                                         |
| Audit de toutes les FK / doublons / workflow           | PASS sur les deux bases                                                                                                     |
| Backup Figma                                           | PASS, empreinte strictement identique                                                                                       |

Les résultats en cache Turbo concernent les packages inchangés. Les tests HTTP, d'intégrité et
Playwright s'exécutent réellement. Le dernier rejeu des 296 tests unitaires a également été
forcé avec `pnpm test --force --concurrency=2` : 12 tâches réussies, zéro tâche en cache.
Les échecs intermédiaires ont été conservés comme tels,
pas convertis en réussites : fixture de code trop long, imports/types en cours de modification,
boutons de formulaire sans `type="submit"`, et prérequis Chromium absents du chemin système.
La première campagne navigateur complète a été arrêtée après trois échecs : une réponse
proxy 500/ECONNRESET du LOT 6 sous exécutions lourdes concurrentes, les nouveaux endpoints
absents de la liste autorisée LOT 1, et deux h1 dans le profil élève. Les deux derniers points
sont corrigés ; le premier ne s'est pas reproduit lors de son rejeu séquentiel. La campagne
finale complète est exécutée seule, sans retry local ni exclusion de ces assertions.

Le poste/WSL a ensuite redémarré. Le résultat final Playwright, daté du 11 septembre à
12:31:11 (Europe/Paris), a survécu dans `apps/web/test-results/.last-run.json` :
`{"status":"passed","failedTests":[]}`. Le reporter installé écrit bien ce statut dans
`onEnd`, depuis le résultat final de la suite. Une copie privée est conservée dans
`.local/lot9-certification-tnEsFO/playwright-last-run.json`. Le journal terminal final dans
`/tmp` a disparu : aucun nombre exact de tests réussis/sautés ni code de sortie du wrapper
Turbo n'est reconstitué artificiellement. Les 161 cas déclarés incluent les ciblages de
résolutions préexistants ; le workflow complet LOT 9 tourne sur mobile et desktop, ses
parcours de lecture/localisation sur les sept résolutions. Les tests ne sont pas affaiblis.

## Socle, migrations et conservation

Node 24.20.0 ; pnpm 10.24.0 ; Prisma/client/adapter-pg 7.10.0 GA ; PostgreSQL 18.6 ;
Next.js 16.3.4 ; React 19.2.8 ; TypeScript 6.0.2 ; Vitest 5.0.0 ; Playwright 1.62.1 ;
Turborepo 2.10.12 ; Oxlint 1.81.0 ; Prettier 3.9.6. Aucune dépendance RC ou nouvelle dépendance.

| Contrôle                                  | Base LOT 8 migrée | Base initialement vide |
| ----------------------------------------- | ----------------: | ---------------------: |
| Modèles/tables métier                     |                49 |                     49 |
| Modèles historiques initiaux conservés    |                43 |                     43 |
| FK vérifiées                              |                90 |                     90 |
| CHECK                                     |                55 |                     55 |
| Index applicatifs                         |               202 |                    202 |
| Triggers non internes                     |                56 |                     56 |
| Erreurs de migration                      |                 0 |                      0 |
| Orphelins, toutes FK composites comprises |                 0 |                      0 |
| Doublons assessment/student               |                 0 |                      0 |
| Décalages de statut note/évaluation       |                 0 |                      0 |

La base `gestschool` a été sauvegardée avant migration, puis les empreintes de toutes les
données préexistantes des 49 tables ont été comparées, avant seed/fixtures : **49/49 identiques**.
Seules les nouvelles colonnes LOT 9 sont exclues de cette comparaison. Aucune donnée supprimée.
Les dumps pré-migration et comparaisons avaient été enregistrés dans
`/tmp/gestschool-lot9.sAapeh`, puis ont disparu lors du redémarrage du poste. Le résultat
49/49 a été réellement observé avant ce redémarrage et reste consigné ici ; ces dumps
pré-migration ne sont plus disponibles. Une nouvelle sauvegarde de l'état LOT 9 courant,
`lot9-current.dump`, et les nouveaux journaux sont conservés dans
`.local/lot9-certification-tnEsFO/` (répertoire privé, dump 0600, ignorés par Git).
Cette sauvegarde courante n'est pas présentée comme une sauvegarde de l'état LOT 8.
La base `gestschool_lot9_fresh_final` comportait zéro table publique avant ses neuf migrations,
son seed, les 18 tests d'intégrité et la suite HTTP LOT 9.

La migration initiale conserve le SHA-256
`ae5d52cbf5b78b1d31dffa4a968f3d127144418d3bb02ae7b1a3ff247fcb12a8`.
Aucune des sept migrations antérieures n'est modifiée. Les deux migrations LOT 9 sont additives.
Les notes non numériques deviennent possibles par outcome explicite : le NOT NULL numérique
est remplacé par un CHECK conditionnel imposant une valeur pour SCORED et NULL pour les autres
cas. Les CHECK, FK et triggers historiques sont préservés ; le trigger des bulletins publiés
n'est pas désactivé ou remplacé.

## Indicateurs de certification

Après certification, `pnpm dev` a été relancé : `/health/live` et `/health/ready` répondent
`ok`, PostgreSQL/Redis/stockage sont `up`, `/fr/login` répond HTTP 200, et le worker affiche
`GestSchool worker is ready`. Les sept connexions HTTP et le TOTP ont été revérifiés après
le redémarrage. Les serveurs DEV sont laissés disponibles ; aucun LOT 10 n'est commencé.

Résultats observés sur les scénarios automatisés et les deux bases contrôlées, et non
affirmation d'absence absolue de tout défaut hors de ce périmètre :

```text
calculation errors = 0
cross-tenant leaks = 0
unauthorized grade access = 0
ASSIGNED bypass = 0
OWN bypass = 0
CHILDREN bypass = 0
invalid workflow transitions = 0
duplicate grades = 0
published grade silent mutations = 0
locked grade mutations = 0
historical grade changes lost = 0
report card snapshot mutations = 0
ranking population leaks = 0
migration errors = 0
orphan records = 0
console errors = 0
page errors = 0
unexpected API errors = 0
overflow = 0
dev access regressions = 0
```

Les zéros de la campagne frontend correspondent au rejeu final réussi, pas aux premiers
essais en échec explicitement documentés plus haut. L'upgrade a également confirmé
`data loss = 0` lors de la comparaison des 49 empreintes avant/après migration.

## Compte rendu demandé

1. **Fichiers.** Nouveau module `apps/api/src/modules/grades/` (15 fichiers), contrats
   `packages/contracts/src/results.ts`, tests `apps/api/tests/results.test.ts`, interface
   `apps/web/src/features/grades/` (7 fichiers), `apps/web/e2e/results.spec.ts`, deux migrations
   et documentation LOT 9. Modifications d'AppModule, des permissions/exports Contracts,
   du schéma, d'une fixture d'intégrité, de `dev-access`, des fixtures E2E, des catalogues
   FR/EN/AR, de la route Grades et du profil élève. Suppression des mocks Grades inutilisés.
   PageHeader accepte un niveau h2 sans changement visuel ; le test LOT 1 autorise les nouveaux
   endpoints réels et attend leur chargement, en conservant ses assertions d'erreurs/overflow.
   Script `results:test`, noms d'étapes CI et README mis à jour ; aucun secret suivi.
2. **Architecture.** Module Grades propriétaire des cinq tables, séparé en application,
   domaine pur, infrastructure Prisma et présentation HTTP. Aucun Prisma dans le contrôleur.
3. **Endpoints.** Tableau exhaustif dans le document fonctionnel ; préfixe `/api/v1`.
4. **Évaluation.** Modèle existant, classe-matière/période réelles, date, barème, poids,
   version, auteur/soumetteur, statut et archivage. Année et tenant contrôlés.
5. **Bulk.** Une requête HTTP et des opérations SQL groupées, transaction atomique,
   contrôle d'éligibilité datée et version optimiste ; doublons rejetés aussi en base.
6. **Barèmes.** NUMERIC et chaînes décimales ; 0 ≤ score ≤ maxScore ; normalisation
   sur l'échelle de l'établissement, 20 par défaut.
7. **Absence/non-noté.** ABSENT et NOT_GRADED rendent les résultats incomplets ; EXCUSED
   est exclu. Aucun zéro automatique. Le zéro réellement saisi reste une note valide.
8. **Workflow.** DRAFT → SUBMITTED → VALIDATED → PUBLISHED → LOCKED, atomique avec les notes.
9. **Soumission.** Saisie requise pour tous les élèves éligibles, puis édition normale fermée.
10. **Validation.** Rôle autorisé et personne différente du soumetteur ; aucun bypass enseignant.
11. **Publication.** Uniquement après validation ; ouvre la lecture aux familles autorisées.
12. **Verrouillage.** Notes/évaluations physiquement LOCKED, toute correction refusée.
    Bulletin : événement d'audit unique, état logique LOCKED sans altérer sa ligne publiée.
13. **Corrections.** Raison obligatoire, ancien/nouveau score/outcome/commentaire, acteur,
    date et requestId ; historique append-only et audit transactionnel.
14. **Coefficients.** Coefficient réel de class_subjects, jamais dupliqué sur Subject.
15. **Poids.** Pondération de chaque évaluation distincte du coefficient matière.
16. **Moyenne matière.** Σ(score/maxScore × échelle × poids) / Σ(poids applicables).
17. **Moyenne générale.** Σ(moyenne matière exacte × coefficient) / Σ(coefficients applicables).
18. **Arrondi.** Fractions BigInt exactes, aucun arrondi intermédiaire ; HALF_UP final à deux décimales.
19. **Rangs.** Population de classe à la fin de période, tenant/année/période/classe stricts.
20. **Ex æquo.** Compétition sur moyenne affichée : 1, 2, 2, 4 ; incomplets sans rang.
21. **Bulletin.** Génération en masse en DRAFT et publication de classe/période atomique ;
    les résultats incomplets ou évaluations non publiées empêchent la finalisation.
22. **Snapshot.** Identité, matricule, inscription, classe, année/période, matières,
    coefficients, moyennes, rang, effectif, appréciations, règles de calcul et date de publication.
23. **Immutabilité.** Ligne et lignes-matières figées ; aucune correction de note ne recalcule
    silencieusement un bulletin. Les anciens snapshots non LOT 9 restent intacts.
24. **RBAC.** Deny by default. Gestionnaires TENANT ; enseignant ASSIGNED ; familles
    CHILDREN/OWN en lecture publiée ; comptable sans notes.
25. **ASSIGNED.** Affectation active exacte sur classe-matière-période et userId enseignant.
    Le cumul enseignant/parent ne transforme pas CHILDREN en lecture de toute la classe.
26. **CHILDREN.** Relation parent/enfant réelle, parent actif ; révocation immédiatement effective.
27. **OWN.** Student.userId réel ; connaître un autre UUID ne donne aucun accès.
28. **Multi-tenant.** Toutes les ressources, joins, agrégats et mutations utilisent le tenant
    du contexte ; absence et refus indiscernables pour une ressource étrangère.
29. **Audit.** Toutes les créations, mises à jour et transitions requises, sans secret IAM.
30. **Grades UI.** Vraies listes et filtres, fin des moyennes et classements simulés.
31. **Saisie UX.** Tableau élèves/matricules, validation inline, sauvegarde bulk, état sale,
    Tab/Shift+Tab et déplacement Enter/Shift+Enter ; barème/poids/statut visibles.
32. **Validation UI.** Actions selon permission/statut, confirmations explicites avant
    publication, réouverture motivée et verrouillage.
33. **Bulletin UI.** Prévisualisation des données historiques et appréciations ; aucun PDF.
34. **Profil élève.** Onglet académique connecté, inscriptions et Finance conservées.
35. **Familles.** Même interface, données publiées propres/liées uniquement, aucune mutation.
36. **i18n/RTL.** FR, EN et AR pour toutes les nouvelles chaînes ; chiffres isolés en RTL.
37. **Responsive/a11y.** Sept résolutions historiques dans Playwright, tables à défilement
    local, labels, focus, clavier et contrôles Axe ; résultat global PASS.
    Le bloc académique embarqué dans le profil utilise un h2 : le nom de l'élève reste
    l'unique h1. Les assertions de non-régression LOT 5 sont conservées.
38. **Calculs.** Tests de moyennes, pondérations, barèmes, coefficients, décimales, arrondis,
    zéro/max/hors plage, absence, dispense et matière sans note.
39. **Workflow tests.** Toutes les transitions permises et les sauts/réouvertures interdits.
40. **RBAC tests.** Enseignant, direction, staff, parent, élève, comptable, tenant étranger et multi-rôles.
41. **Correction tests.** 12 → 14 avec raison/historique/audit, PATCH publié et correction LOCKED refusés.
42. **Snapshot tests.** Libellé Subject/identité modifiés et autre contexte coefficient 7 :
    snapshot inchangé ; UPDATE/DELETE et insertion de ligne après publication refusés.
43. **Classement tests.** Ex æquo, vrai zéro, incomplets, plusieurs classes et tenants.
44. **HTTP.** 55 scénarios ciblés sur base fraîche, vraies connexions IAM/MFA et PostgreSQL ;
    campagne globale IAM/People/Academics/Enrollments/Finance/Results : 300/300 réussis.
45. **Unitaires.** 296 tests au total, dont 54 de domaine LOT 9 et 21 de client web LOT 9.
46. **Playwright.** Parcours complets mobile et desktop réussis ; campagne globale PASS,
    sept résolutions, verdict final persistant confirmé. Le détail de récupération est ci-dessus.
47. **Migration.** Deux ajouts versionnés, aucun reset/db push ni réécriture d'historique.
48. **Upgrade LOT 8.** Sauvegarde préalable et 49 empreintes identiques après migration.
49. **Base vide.** Neuf migrations → seed → 18/18 intégrité → 55/55 LOT 9.
50. **DEV/TEST.** Jeux idempotents DRAFT/SUBMITTED/PUBLISHED et bulletin publié avec ex æquo.
51. **Accès.** Sept connexions HTTP vérifiées, TOTP fonctionnel, secrets uniquement locaux.
52. **LOT 1.** Composants/tokens UI inchangés ; page Notes conserve la structure visuelle existante.
53. **LOT 2.** Infrastructure inchangée et sondes vérifiées.
54. **LOT 3.** Prisma 7.10 GA, 43 modèles d'origine et contraintes historiques conservés.
55. **LOT 4.** IAM existant utilisé, nouvelles permissions seulement ; aucune authentification parallèle.
56. **LOT 5.** Identités/liens réels réutilisés ; annuaires inchangés.
57. **LOT 6.** Affectations/coefficient par classe réutilisés, calendrier existant préservé.
58. **LOT 7.** Inscriptions/événements datés utilisés ; aucun transfert historique réécrit.
59. **LOT 8.** Aucun code financier modifié ; tests financiers inclus dans la campagne globale.
60. **CI.** Workflow conservé, `iam:test` et `test:e2e` incluent LOT 9 ; libellés adaptés.
    Aucun push effectué : la nouvelle exécution GitHub ne peut être déclarée verte avant publication.
61. **Backup Figma.** SHA-256 agrégé identique :
    `e6045bf5ccc18cf913756be7dadf5e4c0a6f3b2fc77bffe8c96b21923978abff`.
62. **Écarts/limites.** Module Grades unique équivalent aux deux modules proposés ; verrouillage
    bulletin par audit pour préserver le trigger LOT 3 ; limites 1 000 élèves/100 matières ;
    absence bloquante, révision de bulletin publié hors MVP. Chromium a utilisé les bibliothèques
    Linux locales préparées sous `/tmp`, supprimées au redémarrage. Elles sont maintenant
    restaurées depuis les dépôts Ubuntu sous
    `.local/lot9-certification-tnEsFO/browser-libs/usr/lib/x86_64-linux-gnu`, sans installation
    système ni dépendance npm nouvelle. Le navigateur démarre à nouveau. LD_LIBRARY_PATH
    et `TURBO_ENV_MODE=loose` les transmettent pour la commande racine locale.
    En CI, l'installation officielle `playwright install --with-deps chromium` reste inchangée.
    Au redémarrage DEV, Next a signalé un benchmark de système de fichiers lent (256 ms)
    sur ce poste WSL ; c'est un avertissement de performance local, pas un avertissement
    TypeScript/build. Aucun avertissement n'a été désactivé pour le cacher.
63. **LOT 10.** PDF, QR, cartes et documents officiels explicitement non commencés.
64. **Verdict.** GO local LOT 9 ; résultat de la nouvelle CI distante non encore disponible,
    car aucun commit/push n'a été effectué. Aucun démarrage du LOT 10.
65. **Commit proposé.** `feat(results): implement assessments, grade workflows and immutable report cards (lot 9)`.
