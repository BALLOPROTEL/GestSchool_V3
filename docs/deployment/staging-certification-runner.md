# LOT14 — runner ponctuel Tenant A/B et worker

Checkpoint préparé depuis `315211e00e36f65f2ec1837e13f01eed9fed8f15`, sur
`feat/lot14-staging-certification`. Aucune activation Render ni certification distante
n'est effectuée par ce checkpoint. Le NO-GO LOT14 reste en vigueur.

L'opérateur confirme que le bootstrap staging a réellement retourné
`LOT14_BOOTSTRAP status=PASS created=true`, avec deux tenants et huit comptes, puis
que `LOT14_BOOTSTRAP_APPLY=false` a été restauré. Cette information vient de
l'opérateur ; elle ne constitue pas une exécution observée depuis ce workspace.
La stabilité worker déjà certifiée reste PASS ; le retry PostgreSQL existe mais
n'a pas été exercé pendant cette fenêtre, sans récupération réelle revendiquée.

## Activation future dans le runtime API

| `LOT14_CERTIFICATION_RUN` | Comportement                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------- |
| absente ou `false`        | Aucun runner ni accès à ses secrets ; démarrage normal.                            |
| `true`                    | Environnement staging exact et secrets requis, sinon refus avant création de Nest. |
| toute autre valeur        | Refus avec code fixe, sans afficher la valeur.                                     |

Le flag est indépendant de `LOT14_BOOTSTRAP_APPLY`. Il reste OFF dans ce travail.
Aucun endpoint opérateur n'est ajouté et la commande Render reste inchangée.

L'activation exige `APP_ENV=staging`, `NODE_ENV=production`, `IAM_ENV=staging` et
`APP_PUBLIC_ORIGIN=https://gestschool-v3-staging.vercel.app`, sans slash terminal.
L'URL PostgreSQL doit correspondre exactement à la cible V3 staging du bootstrap,
avec TLS `verify-full`. Le nom de base est aussi vérifié dans PostgreSQL.
Les huit variables `LOT14_BOOTSTRAP_{A|B}_{SCHOOL_ADMIN|TEACHER|PARENT|STUDENT}_PASSWORD`
existantes sont requises, distinctes et conformes aux contraintes du bootstrap.
Aucune valeur ne doit quitter Render, être collée dans le chat ou écrite dans Git.

Après écoute du serveur Nest réel, l'API lance `entry.js` compilé dans un enfant
Node sans shell. Seul le port local est passé en argument ; les credentials sont
héritées par environnement. La sortie et stderr sont capturées, puis seules les
constantes, identifiants de scénarios et compteurs autorisés sont reconstruits.
Un exit non nul, une sortie incorrecte, un scénario FAIL, un timeout ou un échec
de nettoyage refuse la certification et ferme l'API avec exit 1.

Le budget de travail est 480 s ; les requêtes HTTP sont bornées à 10 s, les sondes
d'export sont espacées de 2 s pendant au plus 120 s. Le nettoyage des sessions a
une fenêtre distincte de 20 s. L'enfant est forcé à terminer après 540 s, ses pipes
sont fermés et il est récollecté. SIGTERM/SIGINT demandent d'abord l'abandon avec
nettoyage, puis SIGKILL après 25 s si nécessaire. L'arrêt API sur échec est borné
à 5 s supplémentaires. Une interruption forcée ne garantit pas le logout distant ;
elle reste non certifiée et les sessions expirent selon la politique IAM normale.

Un HTTP 200 de readiness pendant le run ne constitue pas une certification : seul
le bilan complet PASS suivi d'un exit enfant 0 fait foi. Après un run autorisé,
l'opérateur doit restaurer le flag à `false`. Si le flag reste `true`, les fixtures
sont réutilisées sans reset MFA/password ; un nouvel export synthétique est demandé
pour prouver un nouveau passage worker. Aucun nettoyage destructif automatique.

## IAM, fixtures et lectures internes

Toutes les assertions d'autorisation empruntent le vrai HTTP Nest sur
`127.0.0.1:<port>` : cookies, CSRF, login, refresh, MFA, guards et contrôleurs réels.
Le client privé conserve les noms, chemins et rotations des cookies Secure ; leur
transport loopback est explicite. Il ne prétend pas certifier TLS/SameSite dans un
navigateur, déjà couverts par les smoke tests publics séparés. Aucun redirect HTTP
n'est suivi et aucun host/URL fourni par une réponse n'est accepté.

Les premiers logins SCHOOL_ADMIN utilisent `mfa/enroll` puis `mfa/confirm`. Pour un
rerun déjà enrôlé, l'orchestrateur lit **uniquement** l'identité MFA chiffrée, l'UUID
utilisateur et le dernier compteur des comptes synthétiques contrôlés. Il déchiffre
avec `IamCrypto` et les clés du runtime, attend le prochain pas TOTP si nécessaire
(au plus 30,2 s), produit le code en mémoire puis appelle `mfa/verify` par HTTP.
Il n'écrit jamais la seed ni le compteur, ne forge aucun token/session et ne
contourne pas la protection contre le rejeu. Il ne désactive jamais MFA.

L'inspection du bootstrap existant est réutilisée en lecture seule avant les
fixtures : marqueurs des deux tenants, huit identités/passwords, memberships,
rôles et grants exacts. Un verrou consultatif dédié empêche deux runs concurrents.
Les autres lectures internes corroborent uniquement la possession des profils et
les métadonnées du job/outbox/objet. Elles ne servent jamais de preuve RBAC.

Les profils et les données académiques sont créés par les API normales : un Student
lié et un Student témoin non lié par tenant, un Parent lié, une relation parent/enfant
avec `receivesNotifications=false`, un Teacher lié, une année/période/niveau, deux
classes dont une assignée, une matière/affectation, deux inscriptions, un type de
frais sans transaction financière et une évaluation en brouillon sans notes.
Références et noms sont préfixés `LOT14_RUN_V1_A` ou `LOT14_RUN_V1_B`. Le runner
réutilise uniquement un état exact et refuse ambiguïtés, altérations ou pagination
excédant sa borne. Aucun seed DEV, `dev-access`, SQL de fixtures métier ou DELETE.

Le champ optionnel `userId` ajouté aux créations Student/Guardian/Teacher suit les
permissions People existantes. Il nécessite une membership ACTIVE du même tenant,
un tenant actif et un utilisateur non désactivé, vérifiés sous verrou transactionnel.
La contrainte unique existante refuse les doublons ; les updates refusent ce champ.
Les DTO et audits restent sans credentials.

## Matrice HTTP

Chaque scénario produit un `LOT14_TENANT_AB_CASE` avec son identifiant fixe et
PASS/FAIL individuellement. Un prérequis/fixture invalide produit 14 FAIL, jamais
14 SKIP. Tout 5xx fait échouer l'assertion ; un simple 404 de route inexistante
n'est pas accepté à la place du code métier attendu.

| #   | Scénario       | Preuve principale attendue                                                                     |
| --- | -------------- | ---------------------------------------------------------------------------------------------- |
| 1   | A ne lit pas B | Student A 200 ; Student B 404 `PERSON_NOT_FOUND`.                                              |
| 2   | B ne lit pas A | Contrôle réciproque.                                                                           |
| 3   | UUID/IDOR      | PATCH étranger 404 ; objet étranger inchangé, dans les deux sens.                              |
| 4   | SCHOOL_ADMIN   | Liste du tenant ; switch membership étrangère 401 `AUTH_INVALID_CREDENTIALS`.                  |
| 5   | TEACHER        | Student/classe assignés 200 ; témoin non assigné 404 ; affectation HTTP exacte.                |
| 6   | PARENT         | Enfant lié 200 ; autre enfant local et étranger 404 ; liste filtrée.                           |
| 7   | STUDENT        | Soi 200 ; témoin local et étranger 404 ; liste filtrée.                                        |
| 8   | People         | Student/Parent/Teacher propres 200 et étrangers 404 `PERSON_NOT_FOUND`.                        |
| 9   | Academic       | Classe/année propres ; cible étrangère 404 `ACADEMIC_NOT_FOUND`.                               |
| 10  | Enrollments    | Inscription propre 200 ; étrangère 404 `ENROLLMENT_NOT_FOUND`.                                 |
| 11  | Finance        | Type de frais propre 200 ; étranger 404 `FINANCE_NOT_FOUND`.                                   |
| 12  | Results        | Évaluation propre 200 ; étrangère 404 `RESULT_NOT_FOUND`.                                      |
| 13  | Documents      | Source propre présente ; génération depuis une inscription étrangère 404 `DOCUMENT_NOT_FOUND`. |
| 14  | Reports        | Rapport filtré par classe propre ; filtre Student étranger 404 `REPORT_FILTER_NOT_FOUND`.      |

Les scénarios de scope et par module contrôlent les deux sens A/B. Leur étendue
reste celle de ces routes et données synthétiques, sans prétendre couvrir chaque
endpoint et chaque état métier de V3.

Anomalie constatée localement : le rapport STUDENTS valide `studentId` mais son SQL
de liste n'applique pas ce filtre. Le runner utilise donc le filtre `classId`
effectif pour ses contrôles positifs et son export. Le refus d'un `studentId`
étranger reste exercé. Aucune correction du moteur de rapports dans ce checkpoint.

## Workflow worker

Seulement après 14 PASS : `POST report-exports` pour STUDENTS/CSV avec filtre de
classe synthétique A et une nouvelle clé d'idempotence. Une répétition de la même
requête doit renvoyer le même export. Le runner n'enqueue, ne dispatch et ne génère
aucun job lui-même. Le worker Render existant doit traiter l'outbox puis BullMQ.

Le PASS exige l'état API/DB `READY`, un début/une fin, une seule tentative DB,
un unique événement outbox PROCESSED avec une seule tentative, un unique audit de
génération, le job BullMQ `completed` avec une tentative et les bons UUID internes.
L'objet privé est relu avec le stockage normal ; taille/checksum/contenu et octets
du téléchargement API sont comparés. Le téléchargement B retourne exactement 404
`REPORT_EXPORT_NOT_FOUND`. GET anonyme S3 et route publique Supabase sont refusés.
Le terminal de sortie `completed` désigne BullMQ ; l'état métier est `READY`.
Ce faisceau démontre l'absence de double traitement apparent de ce job, sans
revendiquer une garantie universelle d'exactly-once.

Aucun email, communication, invitation ou WhatsApp n'est demandé. Les données et
l'export synthétiques restent disponibles pour inspection. Les sessions créées
par ce run sont révoquées par logout HTTP, sans révoquer les autres sessions ; les
clients HTTP/PG/Prisma/Redis/S3 sont fermés et le verrou libéré.

## Validation locale

Les tests déterministes vérifient flags, ciblage, secrets absents, transport HTTP,
comptage, conservation des FAIL, blocage worker, bornes et nettoyage. Les tests
bootstrap restent conservés. `staging-certification-local-check.mjs` exige un
opt-in de **test local** et une URL localhost : création d'une base jetable UUID,
14 migrations, bootstrap IAM synthétique, puis vrai Nest/HTTP pour MFA, refresh,
fixtures, 14 scénarios, rerun et logout. Il n'active pas le flag de production,
n'utilise aucun seed DEV et supprime uniquement sa propre base jetable.

Le build Render reste exactement :

```sh
pnpm install --frozen-lockfile --prod=false && pnpm --filter @gestschool/api... build
```

Le runner est compilé avec l'API. IAM/crypto, Prisma, contrats, infrastructure et
le script bootstrap réutilisé sont présents après ce build. Les résultats finaux
locaux sont consignés dans le checkpoint LOT14 ; aucune preuve locale ne remplace
la future certification exécutée dans Render.

Résultats du checkpoint local du 26 octobre 2026 :

| Contrôle                                  | Résultat                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| Tests runner et cycle API                 | 73 PASS / 0 FAIL / 0 SKIP                                                      |
| Tests du hook bootstrap existant          | 35 PASS / 0 FAIL / 0 SKIP                                                      |
| Tests bootstrap existants                 | 10 PASS / 0 FAIL / 0 SKIP                                                      |
| Nest HTTP local et base jetable           | 14 PASS / 0 FAIL / 0 SKIP ; rerun fixtures/MFA et révocation sessions vérifiés |
| `security:test`                           | 455 PASS / 0 FAIL / 0 SKIP, dont les refus People réels                        |
| Unit                                      | 680 PASS / 0 FAIL / 0 SKIP                                                     |
| Typecheck / lint / format                 | PASS                                                                           |
| Build Render exact / build global         | PASS / PASS                                                                    |
| Artefacts runtime compilés et flag absent | PASS ; aucun runner lancé                                                      |
| Scan secrets / `git diff --check`         | PASS ; zéro signature secrète                                                  |
| Tenant A/B distant / worker E2E distant   | NOT RUN / NOT RUN                                                              |

Les premiers passages locaux ont identifié un filtre Students non appliqué
(anomalie documentée ci-dessus) et un contexte de test local trop largement
propagé à la suite sécurité. Le contexte de test explicite est désormais limité
au seul harnais local ; la validation finale complète est verte, sans affaiblir
les assertions ou les garde-fous de production.
