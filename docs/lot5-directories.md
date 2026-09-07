# LOT 5 — Annuaires PostgreSQL

## Périmètre et architecture

Les modules `apps/api/src/modules/students`, `guardians` et `teachers` séparent chacun
`domain`, `application`, `infrastructure` et `presentation/http`. Les contrôleurs n'utilisent
pas Prisma. Les ports de repository appartiennent au domaine ; les services appliquent les
permissions et les contrats Zod ; les implémentations Prisma possèdent les écritures de leur entité.
Les liaisons appartiennent à Students, avec lecture des profils Guardian et réutilisation de leur
filtre de portée. Aucun autre module ne modifie un Guardian ou Teacher.

Le dossier technique `modules/people` mutualise seulement connexion, transactions, sérialisation,
audit et vérification des grants. `packages/shared` reste sans logique métier.

## Routes

Pour chacun des préfixes `/api/v1/students`, `/api/v1/guardians`, `/api/v1/teachers` :

| Méthode | Suffixe        | Opération                               |
| ------- | -------------- | --------------------------------------- |
| GET     | vide           | Liste paginée                           |
| POST    | vide           | Création sans compte User               |
| GET     | `/:id`         | Fiche visible dans la portée du lecteur |
| PATCH   | `/:id`         | Modification partielle                  |
| POST    | `/:id/archive` | Archivage, sans suppression physique    |
| POST    | `/:id/restore` | Restauration à ACTIVE                   |

Relations :

| Méthode | Route                                        | Opération                                  |
| ------- | -------------------------------------------- | ------------------------------------------ |
| GET     | `/api/v1/students/:id/guardians`             | Parents visibles, paginés                  |
| GET     | `/api/v1/guardians/:id/students`             | Enfants visibles, paginés                  |
| POST    | `/api/v1/students/:id/guardians`             | Association via `guardianId`               |
| PATCH   | `/api/v1/students/:id/guardians/:guardianId` | Modification du lien                       |
| DELETE  | `/api/v1/students/:id/guardians/:guardianId` | Dissociation, jamais suppression du parent |

Les trois annuaires utilisent `page=1`, `pageSize=25` (maximum 100), `search`, `status`, `sort`.
Les statuts acceptés sont ACTIVE (défaut), INACTIVE, ARCHIVED et ALL.
Les tris sont `name`, `-name`, `reference`, `-reference`, `createdAt`, `-createdAt`, avec UUID
comme dernier critère déterministe. Recherche insensible à la casse sur prénom, nom et référence,
plus email/téléphone pour les parents. `skip`, `take` et `count` sont exécutés en SQL dans une
transaction RepeatableRead pour obtenir des lignes et un total cohérents. Aucun chargement intégral
pour paginer en mémoire. Les listes de liaisons sont elles aussi paginées.

## Données, validation et migration additive

Prisma, son client et l'adaptateur PostgreSQL restent en **7.10.0 GA**. Aucun package RC ajouté.
Les 43 modèles métier et les quatre modèles IAM sont conservés.

Seule évolution du schéma : migration `20260906000100_guardian_contact_flags`, ajout de
`is_financial_contact BOOLEAN NOT NULL DEFAULT false` et
`receives_notifications BOOLEAN NOT NULL DEFAULT true` dans `student_guardians`.
Elle ne remplace ni la migration initiale LOT 3 ni celle du LOT 4 ; aucune contrainte historique
n'est retirée. Les liens existants gardent les notifications, sans désignation financière implicite.

Student expose prénom, nom, matricule, date de naissance et statut. Guardian expose prénom, nom,
référence, email, téléphone et statut. Teacher expose prénom, nom, numéro employé et statut.
**Sexe, lieu de naissance, adresse, téléphone élève, email/téléphone enseignant sont absents du
modèle LOT 3** : aucune colonne arbitraire ni valeur simulée n'a été ajoutée pour les représenter.
Le rattachement à User n'est pas modifiable par les endpoints d'annuaire.

Les objets Zod sont stricts : champs inconnus refusés, UUID validés, noms 1–100 caractères,
références 1–40 caractères, email ≤254, téléphone ≤30 avec au moins cinq chiffres,
date ISO civile valide entre 1900 et aujourd'hui. PATCH vide refusé ; champs non fournis préservés,
y compris les trois booléens d'un lien. Les dates et contacts optionnels acceptent `null`.
L'archivage ne passe jamais par PATCH ; il exige la permission dédiée.

Références automatiques : `MAT-AAAA-000001`, `PAR-AAAA-000001`, `EMP-AAAA-000001`.
Les créations explicites et automatiques passent par un verrou transactionnel sur le tenant.
Le maximum inclut les références archivées ; calcul exact PostgreSQL numeric/BigInt, sans perte
de précision. Les contraintes UNIQUE composites restent la dernière défense. Aucun compteur
supplémentaire ni changement de modèle nécessaire. Cette sérialisation volontaire des écritures
d'annuaire par tenant privilégie la simplicité et un audit exact pour ce lot.

## Sécurité et audit

Le tenant provient uniquement de `RequestContext`, établi par les guards IAM et une membership
active. Le header `X-Tenant-ID` est refusé ; les listes refusent les paramètres arbitraires ; les
bodies refusent `tenantId` et `userId`. Une fiche inexistante ou hors portée retourne le même 404.
Les scopes restreignent les requêtes SQL **avant** recherche, pagination et comptage.

| Rôle           | Élèves                                           | Parents                 | Enseignants             |
| -------------- | ------------------------------------------------ | ----------------------- | ----------------------- |
| SCHOOL_ADMIN   | CRUD + archivage TENANT                          | CRUD + archivage TENANT | CRUD + archivage TENANT |
| DIRECTOR       | Lecture TENANT                                   | Lecture TENANT          | Lecture TENANT          |
| ACADEMIC_STAFF | Lecture/création/modification TENANT, inchangées | Aucun nouveau droit     | Aucun nouveau droit     |
| ACCOUNTANT     | Lecture TENANT, inchangée                        | Aucun                   | Aucun                   |
| TEACHER        | Lecture ASSIGNED                                 | Aucun                   | Lecture OWN             |
| PARENT         | Lecture CHILDREN                                 | Lecture OWN             | Aucun                   |
| STUDENT        | Lecture OWN                                      | Aucun                   | Aucun                   |

SUPER_ADMIN conserve les grants PLATFORM, mais un annuaire est toujours limité au tenant de sa
session. L'association exige à la fois `students.update` et `guardians.update` en TENANT/PLATFORM.
La lecture des liaisons exige les deux permissions read et filtre chaque extrémité ; un parent
ne peut pas obtenir les contacts d'autres parents via son enfant. Un enseignant ne voit que les
élèves avec une inscription ACTIVE dans une classe couverte par ses affectations existantes.
Sans affectation, ASSIGNED donne une liste vide. Aucun endpoint d'affectation n'est créé.

Chaque mutation et son audit partagent une transaction. Actions :
`student.created/updated/archived/restored`, `guardian.created/updated/archived/restored`,
`teacher.created/updated/archived/restored`, `student.guardian.linked/updated/unlinked`.
`audit_logs` contient tenant, membership, ressource, horodatage et les métadonnées userId,
requestId, before/after de DTO explicitement sérialisés. Aucun secret IAM. Les triggers append-only
existants restent actifs. Répéter archive/restore sans changement est idempotent.

Erreurs JSON `{ code, status, requestId }` : 400 validation, 401 authentification,
403 permission insuffisante, 404 fiche invisible, 409 référence/lien en conflit ou fiche archivée.
Aucune erreur Prisma brute ne sort de l'API. La configuration CORS autorise désormais PATCH,
sans modifier les contrôles Origin, CSRF ou l'authentification.

## Interface et limites

Students, Student Profile, Parents et Teachers utilisent les vraies API. Les composants, tokens,
typos, shell, cartes, tableaux scrollables, dialogs et styles RTL du LOT 1 sont réutilisés.
Le nombre de boutons de pagination est borné pour rester utilisable sur mobile avec une grande liste.
Les lectures sont indexées par tenant/membership pour ne pas réafficher les données de la session
précédente. Chargement, liste vide, erreur traduite avec requestId et boutons selon permissions
sont prévus. Les sélecteurs de liaison recherchent côté serveur et proposent au maximum 25 résultats.

Les champs non prévus par le schéma et les anciennes statistiques simulées de la fiche élève ne
sont pas présentés comme des données réelles. Les cartes/onglets académiques restent des états
« non disponible dans ce lot ». Aucun export simulé sur les annuaires réels.
Tous les nouveaux libellés et codes d'erreur sont traduits FR/EN/AR.

## Accès de test à utiliser

```bash
cd /home/ballo/projets/GestSchool_V3
pnpm infra:up
pnpm db:migrate:deploy
pnpm db:seed
pnpm iam:keys
pnpm dev:access
pnpm dev
```

Ouvrir `http://localhost:3000/fr/login`. `dev:access` affiche ROLE, EMAIL, PASSWORD,
MFA REQUIRED et le résultat du login HTTP pour les sept comptes `@example.invalid` :
school-admin, director, academic-staff, accountant, teacher, parent et student.

Commande réservée à `IAM_ENV=local`, `NODE_ENV=development|test` et PostgreSQL sur loopback.
Elle génère des mots de passe aléatoires et des hashes Argon2id, active tenant/users/memberships,
rétablit les rôles attendus et révoque sessions et jetons précédents des seuls comptes fictifs.
Le seed standard reste sans mot de passe. Les profils locaux parent/enfant sont liés ; l'enseignant
local a son propre profil, mais aucune affectation académique n'est générée par cette commande.

Les comptes school-admin, director et accountant gardent le MFA obligatoire. Importer leur
`mfaUri` depuis `.local/test-access.json` dans un authentificateur, ou exécuter :

```bash
pnpm dev:totp school-admin@example.invalid
```

Les codes TOTP ne sont utilisables qu'une fois ; attendre la fenêtre suivante de 30 secondes
si le code courant a déjà servi à la vérification HTTP de `dev:access`.
`.local/` est ignoré par Git, répertoire 0700 et fichier `test-access.json` 0600.
Ne jamais copier ces accès dans un commit, une documentation, une capture ou les logs CI.
Relancer `dev:access` renouvelle les secrets. Le mécanisme ne crée aucune route de contournement.

## Vérification

`pnpm people:test` exécute les tests HTTP PostgreSQL/Redis des annuaires.
`pnpm iam:test` exécute toute la suite HTTP, IAM historique compris ; la CI existante inclut donc
automatiquement le LOT 5. Les scénarios Playwright utilisent des fixtures éphémères, sans trace,
vidéo ou capture de secrets. Le rôle de lecture visuelle a des grants TENANT read explicites,
sans CRUD ; les parcours administratifs passent par login et enrôlement MFA réels.
La fixture commune désactive les snapshots DOM d'échec dans chaque processus de test, où cette
protection doit effectivement s'appliquer. Un seul navigateur est lancé à la fois, localement
comme en CI ; délai standard 60 secondes, 180 secondes pour les parcours multi-pages longs,
assertions asynchrones limitées à 10 secondes. Aucun scénario ni assertion n'est retiré.

Les tâches Turborepo database typecheck/test attendent désormais database build : cela évite
deux générations Prisma simultanées sur le même répertoire. Aucun warning n'est masqué.

LOT 6 non commencé : pas de CRUD académique, inscription, finance, notes, présence, emploi du
temps, BullMQ métier, Brevo, PDF, stockage externe réel ou déploiement cloud.
Le compte rendu chiffré se trouve dans [la certification LOT 5](lot5-certification.md).
