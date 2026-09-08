# LOT 6 — Référentiel académique

Périmètre : années, périodes, niveaux, classes, matières, coefficients par classe et affectations
enseignants. Aucun endpoint d'inscription, de notes, d'emploi du temps ou de finance n'est ajouté.

## Architecture et contrats

`apps/api/src/modules/academics` possède les sept tables académiques et sépare les contrôleurs
HTTP, le service applicatif, les politiques du domaine, le port repository et l'implémentation
Prisma. Les contrôleurs ne connaissent pas Prisma. `packages/contracts/src/academics.ts`
centralise les schémas Zod stricts, permissions, requêtes et DTO. Aucun DTO ne contient de
tenantId fourni par le navigateur, de mot de passe ni d'identité IAM interne.

Les 38 endpoints ci-dessous sont préfixés par `/api/v1` :

| Ressource           | Endpoints                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Années              | `GET/POST /academic-years`, `GET/PATCH /academic-years/:id`, `POST /academic-years/:id/activate`, `/close`, `/archive`                        |
| Périodes            | `GET/POST /academic-years/:yearId/periods`, `PATCH /academic-periods/:id`, `POST /academic-periods/:id/archive`                               |
| Niveaux             | `GET/POST /levels`, `GET/PATCH /levels/:id`, `POST /levels/:id/archive`, `/restore`                                                           |
| Classes             | `GET/POST /classes`, `GET/PATCH /classes/:id`, `POST /classes/:id/archive`, `/restore`                                                        |
| Matières            | `GET/POST /subjects`, `GET/PATCH /subjects/:id`, `POST /subjects/:id/archive`, `/restore`                                                     |
| Matières par classe | `GET/POST /classes/:classId/subjects`, `PATCH/DELETE /classes/:classId/subjects/:subjectId`                                                   |
| Affectations        | `GET/POST /teaching-assignments`, `PATCH /teaching-assignments/:id`, `POST /teaching-assignments/:id/archive`, `GET /me/teaching-assignments` |

Les actions sans champ acceptent uniquement `{}`. Les créations répondent 201, les autres
succès 200. Erreurs stables avec requestId : validation 400, authentification 401, autorisation
403, référence absente/inaccessible 404, conflit métier 409. Les violations connues Prisma
sont traduites, pas renvoyées telles quelles.

## Tenant, droits et scope ASSIGNED

Le tenant provient exclusivement du RequestContext IAM. Les FK composites historiques restent
en place et chaque référence est vérifiée dans ce tenant avant mutation. Les écritures
académiques verrouillent la ligne tenant dans leur transaction, comme le LOT 5 : activation
concurrente, clôture et mutations enfants sont sérialisées. L'audit avant/après est écrit dans
la même transaction.

SCHOOL_ADMIN, DIRECTOR et ACADEMIC_STAFF reçoivent les 26 permissions académiques TENANT.
ACADEMIC_STAFF reçoit aussi `teachers.read` TENANT pour le sélecteur, sans aucun nouveau droit
d'écriture sur les personnes. TEACHER reçoit les six lectures académiques ASSIGNED. ACCOUNTANT,
PARENT et STUDENT ne reçoivent aucun droit académique automatique. SUPER_ADMIN conserve sa
politique PLATFORM explicite ; une permission PLATFORM usurpée sans ce rôle ne suffit pas.

ASSIGNED est calculé dans les filtres SQL : affectation ACTIVE, enseignant ACTIVE lié au user
du contexte, période, classe, niveau et matière ACTIVE, année non ARCHIVED. Les années DRAFT
restent visibles pour préparer l'année ; CLOSED reste consultable, sans mutation structurelle.
Les filtres classe/année sur une matière doivent satisfaire le même lien affecté, pas une autre
classe utilisant cette matière. Un parent non affecté est indistinguable d'un parent absent.
`/me/teaching-assignments` force toujours la restriction à soi, même pour un administrateur.
Le scope élèves ASSIGNED du LOT 5 réutilise ce filtre ; aucune inscription n'est créée via API.

## Règles et conservation historique

- Année : `DRAFT → ACTIVE → CLOSED → ARCHIVED`, jamais de retour arrière. Une seule ACTIVE
  par tenant, protégée aussi par un index PostgreSQL partiel. `startsOn < endsOn`.
- Périodes : TRIMESTER (séquences 1–3) ou SEMESTER (1–2), dates strictes incluses dans l'année,
  séquences uniques et chronologiques, aucun chevauchement entre périodes actives, aucun
  mélange des deux types actifs. Une séquence archivée reste réservée par l'unicité historique.
- Classe : année obligatoire et immuable après création, niveau du même tenant, code unique
  dans l'année/tenant. La capacité est facultative, positive et plafonnée à 10 000.
- Niveaux et matières : catalogues globaux au tenant, archivage/restauration logique. Leurs
  libellés sont des métadonnées partagées ; leur modification ne réaffecte aucune classe.
- Coefficient : uniquement sur class_subjects, Decimal(5,2), strictement positif, maximum
  999,99, au plus deux décimales. Aucun weeklyHours n'existe dans le modèle, donc aucun ajout.
- Retrait d'une matière d'une classe : DELETE du lien seulement s'il n'a aucune affectation
  (même archivée) et aucune évaluation. Sinon `ACADEMIC_HISTORY_PROTECTED`. La matière globale
  n'est jamais supprimée. Une évaluation protège aussi les changements de coefficient.
- Affectation : enseignant réel LOT 5 + classSubject + période, tous du même tenant et de la
  même année, références actives. Une modification ne déplace pas l'affectation dans une autre
  année ; les évaluations existantes bloquent sa modification. Archivage logique uniquement.
  L'unicité historique réserve le triplet enseignant/lien/période après archivage ; aucune
  restauration d'affectation ni suppression destructive n'est introduite dans ce lot.
- Année CLOSED/ARCHIVED : modifications de l'année, périodes, classes, liens et affectations
  bloquées. L'archivage d'un catalogue partagé révoque les lectures ASSIGNED correspondantes,
  mais ne supprime aucune ligne historique.

## Pagination et runtime Prisma 7 GA

Les listes appliquent WHERE, tri stable, LIMIT/OFFSET et COUNT en SQL dans une transaction
RepeatableRead. Page de 25 par défaut, maximum 100 ; recherche limitée à 100 caractères,
filtres UUID stricts selon la ressource. Aucun chargement intégral suivi de pagination mémoire.
Les sélecteurs frontend chargent au plus 25 résultats et offrent une recherche serveur.

Les lectures de relations d'une page sont groupées par identifiants, limitées à cette page et
exécutées séquentiellement. Cela évite le plan multi-include concurrent sur une connexion pg
transactionnelle, problème décrit dans [Prisma #29407](https://github.com/prisma/prisma/issues/29407).
Aucun avertissement n'est masqué, aucune dépendance changée et aucune option Preview activée.
Prisma, client et adapter-pg restent en **7.10.0 GA**.

## Migration additive

`20260907000100_academic_lifecycle` ajoute le statut ARCHIVED des années, leur archived_at,
le statut ACTIVE/ARCHIVED et archived_at des périodes/niveaux/classes/matières/affectations,
et updated_at des affectations. Aucun modèle supplémentaire : 43 métier + 4 IAM.

Elle ajoute huit CHECK, l'index d'année active unique et un trigger vérifiant l'année lors des
INSERT/UPDATE d'affectations. Un précontrôle bloque explicitement des données antérieures
incompatibles ; aucune correction silencieuse ni suppression de données. Le changement
d'année des classes/périodes n'est pas exposé par les contrats HTTP. Les migrations des LOT 3,
4 et 5, FK, CHECK et triggers historiques ne sont pas réécrits.

## Interface et démonstration locale

La route Classes garde la grille de cartes, les tokens et composants LOT 1. Elle accueille les
onglets Classes/Années/Niveaux/Affectations, les filtres année/niveau et les détails classe ou
périodes. Subjects reste une table et ne présente pas de coefficient global. Les actions
non autorisées sont absentes ; les années fermées restent en lecture seule. Les états de
chargement, vide, erreur avec requestId et accès refusé sont traduits FR/EN/AR. Les dialogs
restaurent le focus, les champs sont étiquetés, les tables défilent dans leur propre conteneur.
Un changement de tenant/membership réinitialise détails et formulaires ouverts.

`pnpm dev:access` conserve les sept comptes et leur MFA existant. Il ajoute seulement en
local/test une année démo, trois trimestres, un niveau, une classe, une matière, coefficient 4
et trois affectations à `teacher@example.invalid`. Une deuxième exécution préserve les
modifications utilisateur ; une année fermée n'est jamais rouverte. Une démo nouvelle est
DRAFT s'il existe déjà une année ACTIVE. Aucune inscription de démonstration supplémentaire.
Le seed historique préserve désormais les changements académiques au lieu de les écraser.

Les identifiants restent exclusivement dans `.local/test-access.json` ignoré (0600), avec son
répertoire 0700. Utiliser `pnpm dev:totp school-admin@example.invalid` pour le code MFA courant.

## Vérifications

`pnpm academics:test` certifie les workflows HTTP, RBAC, isolation, audit et scope ASSIGNED.
`pnpm iam:test` inclut aussi tous les tests IAM et annuaires précédents ; la CI existante
l'exécute avec PostgreSQL et Redis réels. `pnpm test:e2e` inclut les parcours LOT 6, les sept
viewports et les trois langues, en plus de la non-régression LOT 1/4/5. Le compte rendu des
exécutions et de la base neuve est séparé dans `lot6-certification.md`.
