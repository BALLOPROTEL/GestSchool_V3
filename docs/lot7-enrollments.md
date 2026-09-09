# LOT 7 — Inscriptions et historique scolaire

Prisma reste en **7.10.0 GA** avec PostgreSQL 18. Aucun traitement Finance, document, carte,
QR, notes ou LOT 8 n'est ajouté. Les annuaires LOT 5 et référentiels LOT 6 restent propriétaires
des élèves, parents, enseignants, années, niveaux et classes.

## Architecture

`apps/api/src/modules/enrollments` possède le workflow. Les contrôleurs HTTP utilisent le
`RequestContext` IAM, les permissions et l'application ; ils n'appellent pas Prisma.
L'application valide les contrats Zod stricts de `packages/contracts/src/enrollments.ts` et
utilise le port `EnrollmentRepository`. Le domaine porte transitions, dates, capacité et scopes.
L'infrastructure effectue les lectures filtrées, transactions, événements métier et audits.
Le module ne recrée aucun CRUD Students ou Academics.

## Routes

Toutes les routes ci-dessous sont préfixées par `/api/v1`.

| Méthode | Route                              | Permission                                |
| ------- | ---------------------------------- | ----------------------------------------- |
| GET     | `/enrollments`                     | `enrollments.read`                        |
| POST    | `/enrollments`                     | `enrollments.create`                      |
| GET     | `/enrollments/:id`                 | `enrollments.read`                        |
| PATCH   | `/enrollments/:id`                 | `enrollments.update`                      |
| GET     | `/enrollments/:id/events`          | `enrollments.read`                        |
| POST    | `/enrollments/:id/confirm`         | `enrollments.confirm`                     |
| POST    | `/enrollments/:id/cancel`          | `enrollments.cancel`                      |
| POST    | `/enrollments/:id/transfer`        | `enrollments.transfer`                    |
| POST    | `/enrollments/:id/complete`        | `enrollments.complete`                    |
| GET     | `/students/:studentId/enrollments` | `enrollments.read`                        |
| GET     | `/enrollment-classes`              | `enrollments.create`, scope administratif |

Aucune route DELETE. POST création retourne 201 ; les commandes de transition retournent 200.
Erreurs 400/401/403/404/409 structurées, codes traduisibles et requestId, sans message Prisma brut.

## Modèle et migration additive

Le schéma LOT 6 contenait les relations étudiant/année/classe/tenant et les statuts
`PENDING`, `ACTIVE`, `TRANSFERRED`, `WITHDRAWN`, `COMPLETED`, mais **aucun champ type ni historique
de transfert**. La migration `20260909000100_enrollment_workflow` ajoute :

- `Enrollment.type` et l'enum `NEW / RE_ENROLLMENT / TRANSFER` ;
- `EnrollmentEvent` / `enrollment_events`, ses FK composites, CHECK, index et snapshots ;
- la clé composite enrollment/tenant/année permettant de rattacher correctement les événements ;
- les protections UPDATE/DELETE/TRUNCATE de l'historique et DELETE/TRUNCATE des inscriptions.

Le type reste nullable **uniquement pour les données historiques dont la provenance est inconnue**.
Toutes les créations HTTP LOT 7 exigent NEW ou RE_ENROLLMENT. L'interface rend `null` comme
« Type historique non renseigné ». La migration ne transforme pas arbitrairement les anciennes
inscriptions en NEW. Elle crée un événement BASELINE par inscription préexistante, avec l'état
réellement connu, sans inventer des transferts, acteurs ou raisons historiques.

Les 43 modèles métier antérieurs restent présents ; l'historique ajoute un 44e modèle métier.
Avec les quatre modèles IAM, le schéma compte donc **48 modèles**. Les quatre migrations antérieures
sont inchangées. Pas de `db push`, reset, suppression ou réécriture de migration historique.

## Workflow autorisé

| État courant                             | Action                 | Résultat                                                          |
| ---------------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| Absence d'inscription                    | NEW / RE_ENROLLMENT    | PENDING ; réservation d'une place                                 |
| PENDING                                  | PATCH type/date/classe | PENDING ; nouvelle version historisée                             |
| PENDING                                  | confirm                | ACTIVE ; même inscription et même place                           |
| PENDING ou ACTIVE                        | cancel                 | WITHDRAWN ; place libérée                                         |
| ACTIVE                                   | transfer               | ACTIVE ; même inscription, nouvelle classe, événement TRANSFERRED |
| ACTIVE                                   | complete               | COMPLETED ; place libérée                                         |
| WITHDRAWN, COMPLETED, ancien TRANSFERRED | Mutation               | Refus                                                             |
| Année CLOSED ou ARCHIVED                 | Toute mutation         | Refus ; lecture historique autorisée                              |

Le type décrit l'origine de l'inscription. Un transfert interne conserve son type NEW ou
RE_ENROLLMENT et son identifiant ; **il ne crée pas une seconde inscription ni ne remplace son
type par TRANSFER**. La valeur TRANSFER du type est réservée à une éventuelle provenance
historique/import ; aucun workflow de transfert externe n'est développé dans ce lot.
Le statut TRANSFERRED préexistant reste consultable et terminal, sans être réaffecté à un sens nouveau.

NEW exige un élève du tenant non archivé, une année DRAFT/ACTIVE, une classe et un niveau actifs,
la concordance classe/année, une date dans l'année, l'absence d'inscription élève/année et une place.
La contrainte unique historique interdit également de recréer une inscription annulée la même année.
Le même élève peut être inscrit dans une autre année.

RE_ENROLLMENT ajoute la preuve d'une inscription ACTIVE, COMPLETED ou anciennement TRANSFERRED
dans une année différente terminant **avant** le début de la cible. PENDING et WITHDRAWN ne sont
pas des antécédents suffisants. L'inscription précédente est conservée ; aucune donnée courante
n'est recopiée aveuglément. La preuve est vérifiée à la préparation, à la modification et à la confirmation.

Le transfert impose une autre classe active de la même année et du même tenant, une place,
une date et une raison de 3 à 1000 caractères. Les dates de transfert/annulation/complétion ne
peuvent précéder le dernier événement effectif et restent dans l'année. Les dates sont civiles,
sans conversion de fuseau. Elles servent à l'historique : **les commandes s'appliquent immédiatement**,
même si leur date d'effet saisie est future ; aucun ordonnanceur n'est introduit.

## Capacité et concurrence

La capacité nullable du LOT 6 est réutilisée : `null` signifie illimitée. PENDING réserve une place,
ACTIVE l'occupe. `occupiedPlaces = pendingEnrollments + activeEnrollments` ; les statuts terminaux
ne comptent plus. La confirmation et la modification d'une préparation créditent la réservation
courante pour ne pas la compter deux fois. Les compteurs sont agrégés en SQL par classe/tenant.

Chaque écriture verrouille la ligne du tenant avec PostgreSQL `FOR UPDATE`, dans la même transaction
que validations, écriture, événement et audit. Students et Academics utilisent déjà ce verrou :
archivage, fermeture d'année, changement de capacité et inscriptions sont donc sérialisés entre eux.
L'édition de capacité Academics refuse de passer sous l'occupation réservée + active.
Les tenants différents ne partagent pas ce verrou. Le choix favorise la simplicité et la cohérence
au LOT 7 ; il sérialise les mutations d'un même établissement et pourra être affiné après mesure.
Pas de verrou Redis ni de trigger de capacité : les imports SQL directs doivent respecter ce workflow.

## Historique, audit, isolation

Chaque événement conserve inscription, année, anciennes/nouvelles classes et leurs **noms en snapshot**,
ancien/nouveau statut, type, date d'effet, raison, acteur et nom en snapshot, requestId et date UTC
d'enregistrement. Un renommage ultérieur de classe n'altère pas les snapshots précédents.
Les événements sont ordonnés par `recordedAt`, puis UUIDv7, et paginés par SQL. Les FK composites
enrollment/année, classes/année et acteur/tenant empêchent les références croisées.

Les six actions auditées sont `enrollment.created`, `.updated`, `.confirmed`, `.cancelled`,
`.transferred`, `.completed`. L'audit append-only préexistant est conservé, mais n'est pas la source
unique de l'historique métier. Une erreur fait annuler l'intégralité de la transaction.

SCHOOL_ADMIN, DIRECTOR et ACADEMIC_STAFF ont les sept permissions TENANT. Teacher et Accountant
ne reçoivent aucun droit d'inscription implicite. PARENT dispose uniquement de read CHILDREN,
STUDENT de read OWN. Le super-administrateur conserve la politique PLATFORM IAM existante.
Toutes les autorisations restent vérifiées côté serveur, indépendamment de l'interface.

OWN filtre via `Student.userId`. CHILDREN filtre via le parent actif lié à l'utilisateur et
`StudentGuardian`. Un lien supprimé cesse immédiatement d'autoriser la lecture. Ces restrictions
sont appliquées **avant** count, groupBy et pagination, également aux détails et événements.
L'UUID d'une ressource hors périmètre répond 404 sans divulgation. Un faux tenant dans headers,
corps ou query est refusé ; seul le RequestContext validé fait autorité.

La liste supporte page, pageSize (25 par défaut, 100 maximum), search (100 caractères), status,
type, academicYearId, classId, levelId, studentId et sort. Recherche matricule, prénom, nom,
nom/code de classe ; ordre stable avec identifiant comme départage. Aucun chargement complet
suivi d'une pagination JavaScript. Les sélecteurs prennent 25 résultats et proposent d'affiner
la recherche pour accéder aux autres ; les années fermées et les combinaisons invalides sont désactivées.

## Frontend et accès locaux

La route Enrollments et l'onglet historique de Student Profile utilisent la vraie API.
Les composants, tokens, tableaux, dialogs, sélecteurs et styles LOT 1 sont réutilisés.
Le faux badge 89 et les mocks spécifiques d'inscription sont retirés ; les autres démonstrations
restent inchangées. Le nouvel assistant réutilise les composants de formulaire existants en trois
étapes : élève/type ; année/niveau/classe/date/capacité ; récapitulatif. Sa soumission prépare
l'inscription ; une action explicite de la liste la confirme. Aucun paiement n'est demandé.

Loading, vide, accès refusé, erreur avec requestId, conflit, doublon et classe pleine sont traduits
en FR/EN/AR. Les composants sont remontés lors d'un changement de tenant/membership pour ne pas
conserver les données du contexte précédent. Parent/Student ne chargent pas les référentiels et
agrégats administratifs : ils voient uniquement leurs inscriptions et événements autorisés.

`pnpm dev:access` conserve les sept comptes et crée une seule fois par année de démonstration
les élèves non inscrit/réinscriptible/déjà inscrit, les classes disponible/quasi pleine/pleine,
une année historique terminée et un transfert pour l'élève lié au compte Student et au Parent.
La préparation emploie les mêmes commandes métier ; seule la clôture de l'année historique est
un import DEV explicite pour ne pas modifier l'année active existante. Un marqueur d'audit
transactionnel rend le jeu idempotent et évite de réinitialiser les modifications manuelles.
Le helper exige IAM local, NODE_ENV development/test et une DB loopback.
Les mots de passe/MFA restent dans `.local/test-access.json` ignoré par Git, permission 0600.
La commande d'accès les régénère et révoque les sessions, comme au LOT 4.

Tests ciblés : `pnpm enrollments:test`. Tous les tests HTTP : `pnpm iam:test`.
La CI conserve migration → seed → intégrité, puis qualité, tests HTTP et Playwright avec Prisma GA.
Consulter [la certification LOT 7](lot7-certification.md) pour les résultats réellement exécutés.
