# IAM — LOT 4

## Périmètre et structure

Le LOT 4 fournit l'identité et la sécurité d'accès. Aucun CRUD Students, Parents, Teachers,
Grades ou Finance n'est exposé. Le dashboard et les écrans métier conservent leurs mocks.

```text
apps/api/src/modules/iam/
├── application/         # Auth, Users, Memberships, Sessions, Credentials, MFA
├── domain/              # RequestContext, erreurs, ScopePolicy, tests unitaires
├── infrastructure/      # repository Prisma, crypto, Redis, configuration, CLI locale
├── presentation/http/   # contrôleurs, validation, cookies, guards, filtre d'erreurs
└── iam.module.ts
```

Les contrôleurs valident les entrées avec Zod et délèguent aux services. Le repository est
l'unique point d'accès Prisma du module. Les contrats publics et la matrice système résident
dans `packages/contracts/src/iam.ts`. Les changements de rôles/permissions sont traités par
UsersService ; activation et reset partagent CredentialsService et des finalités distinctes.

## Démarrage local et comptes fictifs

Utiliser Node 24 et pnpm 10.24.0, puis :

```bash
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm iam:keys
pnpm iam:dev activation student@example.invalid
pnpm dev
```

`iam:keys` crée une seule fois `.local/iam.keys.json` (permissions 0600, dossier 0700), exclu
de Git et Prettier. Aucun secret n'est imprimé. Le seed est idempotent : huit rôles système,
permissions et comptes fictifs `super-admin`, `school-admin`, `director`, `academic-staff`,
`accountant`, `teacher`, `parent`, `student` sous `example.invalid`, sans mot de passe initial.
Il ne réinitialise pas les mots de passe ni les inscriptions MFA existantes.

La CLI écrit le lien à usage unique dans `.local/iam-delivery.json` (0600), pas dans les logs.
Lire ce fichier localement et ouvrir le lien ; son fragment `#token=…` est retiré de l'URL
par le formulaire. Pour un reset : `pnpm iam:dev reset student@example.invalid`.
La CLI refuse les modes staging/production et les adresses autres que `.invalid`.
Ne jamais versionner, partager, joindre à un ticket ou enregistrer ces fichiers dans une trace.
Aucun email n'est envoyé. En dehors du dev/test, les tokens ne sont volontairement pas livrés :
un adaptateur de livraison sécurisé reste nécessaire avant une ouverture réelle du service.

## Endpoints

Les routes ci-dessous sont préfixées par `/api/v1/auth`.
Toutes les mutations nécessitent Origin autorisée, JSON et CSRF, même les routes publiques.

| Méthode | Route              | Accès / fonction                                            |
| ------- | ------------------ | ----------------------------------------------------------- |
| GET     | `/csrf`            | Public : jeton CSRF signé, présence du cookie de session    |
| POST    | `/login`           | Identifiant et mot de passe ; session ou challenge MFA      |
| POST    | `/refresh`         | Cookie opaque : rotation et nouvel access token             |
| POST    | `/forgot-password` | Réponse générique, émission interne d'un reset              |
| POST    | `/reset-password`  | Token one-shot et nouveau mot de passe                      |
| POST    | `/activation`      | Token one-shot et premier mot de passe                      |
| GET     | `/me`              | Identité et contexte courant résolus côté serveur           |
| GET     | `/sessions`        | Sessions du seul utilisateur connecté                       |
| DELETE  | `/sessions/:id`    | Révocation d'une session possédée                           |
| POST    | `/logout`          | Révocation de la session courante et suppression du cookie  |
| POST    | `/logout-all`      | Révocation de toutes les sessions de l'utilisateur          |
| GET     | `/memberships`     | Memberships actives possédées                               |
| POST    | `/switch-tenant`   | Membership cible vérifiée, nouvelle session                 |
| POST    | `/mfa/setup`       | Session authentifiée et mot de passe, MFA facultatif        |
| POST    | `/mfa/enroll`      | Challenge : secret et URI TOTP présentés une fois           |
| POST    | `/mfa/confirm`     | Premier code : activation MFA et session                    |
| POST    | `/mfa/verify`      | Challenge de login et code TOTP                             |
| POST    | `/mfa/disable`     | Mot de passe et code frais ; interdit aux rôles privilégiés |

Administration IAM, sans CRUD métier :

| Méthode | Route                               | Permission           |
| ------- | ----------------------------------- | -------------------- |
| POST    | `/api/v1/iam/invitations`           | `users.invite`       |
| PUT     | `/api/v1/iam/memberships/:id/role`  | `roles.assign`       |
| PUT     | `/api/v1/iam/roles/:id/permissions` | `permissions.manage` |

L'invitation retourne une confirmation, jamais le token d'activation. L'affectation remplace le
rôle de la membership ciblée, uniquement dans le tenant actif. Seul SUPER_ADMIN peut attribuer
ou retirer SUPER_ADMIN. Les rôles système globaux sont gérés par le seed et non modifiables via
HTTP ; l'endpoint permissions est réservé au super-admin et aux rôles personnalisés du tenant.
Le LOT 4 n'ajoute pas d'interface d'administration de ces opérations.

## Password, activation et reset

Argon2id, sel indépendant par hash, mémoire 64 MiB, trois passes, parallélisme 1. Politique :
12 à 128 points de code Unicode, passphrases acceptées, aucun mélange de caractères imposé.
Valeurs vides, contrôles, répétitions et quelques valeurs manifestement invalides sont refusés.
Ce n'est pas une base exhaustive de mots de passe compromis. Les paramètres dépassent le
minimum de la [fiche OWASP Argon2id](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id).

Login : vérification réelle (ou hash factice si compte absent), User non désactivé, identité
activée, membership ACTIVE, tenant ACTIVE et MFA si requis. Mauvais identifiant, mot de passe
ou statut donnent une erreur générique. Forgot-password conserve la même réponse pour compte
connu/inconnu et une durée plancher de 350 ms ; cela réduit, sans prétendre éliminer tous les
canaux temporels, les différences observables.

Activation : 24 h. Reset : 15 min. Tokens aléatoires de 32 octets, SHA-256 en DB, usage unique,
finalités séparées ; une réémission invalide les précédents de même finalité. Validation et
consommation atomiques. Changement de mot de passe : révocation de toutes les sessions et
invalidation des tokens en attente, y compris challenges MFA ; audit de l'action.

## Access token, sessions et rotation

JWT EdDSA/Ed25519 signé asymétriquement, durée 5 minutes ; claims `sub`, `sid`, `tid`, `mid`,
`iat`, `exp`, `iss`, `aud`, sans permissions. Signature, algorithme, audience, émetteur et dates
sont vérifiés. Le navigateur conserve le JWT uniquement en mémoire, jamais dans localStorage
ou sessionStorage. Il restaure sa session via le refresh HttpOnly après un rechargement.

Session PostgreSQL : user, tenant, membership composite, identifiant, hash de refresh courant,
user-agent tronqué, IP de socket, createdAt, lastUsedAt, expiration absolue 7 jours, statut,
revokedAt et preuve MFA. Chaque requête protégée relit la session, l'utilisateur, la membership,
le tenant, les rôles et permissions. Une révocation rend immédiatement les futurs appels avec
l'ancien JWT invalides, sans attendre son expiration.

Refresh opaque de 32 octets, hash SHA-256 uniquement en DB. Chaque rotation consomme l'ancien
hash et conserve son historique, puis émet un nouveau token dans la même session, sans prolonger
l'expiration absolue. Le verrou PostgreSQL `FOR UPDATE` par utilisateur sérialise les rotations
et mutations sensibles. Réutilisation, y compris concurrence : révocation de toute cette famille
(la session), audit `refresh.reuse_detected`, erreur 401. La révocation est commitée avant l'erreur.
Les autres appareils restent actifs, sauf logout-all/reset. Cette stratégie s'appuie sur la
[rotation décrite par RFC 9700 §4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14),
sans faire de GestSchool un fournisseur OAuth/OIDC.

Le client sérialise les refresh dans un onglet et via Web Locks entre onglets lorsque disponible.
Sans Web Locks, une collision peut provoquer une reconnexion de sécurité : aucune tolérance de
rejeu n'est ouverte. La déconnexion inter-onglets utilise uniquement un timestamp non sensible.

## Tenant, guards et scopes

Ordre : BrowserSecurityGuard → AuthenticationGuard → SessionGuard → TenantGuard →
PermissionGuard. Sans `@Public()` ou permission explicite : DENY. `RequestContext` contient
requestId généré serveur, userId, sessionId, membershipId, tenantId, rôles et grants/scopes.

Au login le serveur choisit une membership active possédée. `switch-tenant` accepte un ID de
membership et vérifie propriétaire, statut et tenant ; il révoque l'ancienne session et crée
une nouvelle session liée à la cible. Un `X-Tenant-ID` arbitraire est rejeté. Même PLATFORM
ne contourne pas la frontière du tenant actif : un switch explicite reste nécessaire.

| Rôle           | Exemples de droits métier préparés (sans endpoints métier)               |
| -------------- | ------------------------------------------------------------------------ |
| SUPER_ADMIN    | Toutes les permissions, PLATFORM                                         |
| SCHOOL_ADMIN   | Administration scolaire, TENANT ; pas de délégation SUPER_ADMIN          |
| DIRECTOR       | Lecture, validation/publication des notes, TENANT                        |
| ACADEMIC_STAFF | Création/mise à jour/soumission des notes, TENANT                        |
| ACCOUNTANT     | Création/annulation des paiements, TENANT ; pas de modification de notes |
| TEACHER        | Notes sur ressources ASSIGNED ; pas d'annulation de paiement             |
| PARENT         | Lecture des ressources CHILDREN                                          |
| STUDENT        | Lecture des ressources OWN                                               |

La matrice exacte est `roleGrants` dans contracts. ScopePolicy exige toujours le bon tenant,
puis contrôle `PLATFORM`, `TENANT`, `ASSIGNED`, `CHILDREN`, `OWN` ou `NONE`. Les faits d'appartenance
doivent provenir du backend, jamais d'un payload client. Les tests HTTP utilisent un contrôleur
sonde exclusif aux tests. Les futurs services métier devront construire ces faits depuis des
requêtes filtrées par tenant ; cette connexion aux ressources métier n'est pas anticipée ici.
Les changements de rôles révoquent sessions/challenges ; les permissions sont relues à chaque
requête et les changements sont audités.

## MFA et secrets

TOTP RFC 6238 : SHA-1, six chiffres, période 30 s, fenêtre ±1, compteur monotone anti-rejeu en DB.
Obligatoire pour SUPER_ADMIN, SCHOOL_ADMIN, DIRECTOR, ACCOUNTANT, y compris si l'utilisateur
sélectionne une autre membership non privilégiée. En l'absence d'inscription, le mot de passe
ne donne qu'un challenge de 5 min, aucun accès au portail. L'inscription échange ce challenge
one-shot contre un autre lié au secret ; seul un premier code correct ouvre une session.
Pour les comptes non privilégiés, setup exige le mot de passe et revérifie l'état sous verrou.
Disable exige mot de passe et code frais et révoque sessions/challenges ; refusé si un rôle
privilégié actif existe. Pas de recovery codes, passkeys ou procédure de récupération admin
dans ce lot : ne pas ouvrir la production sans procédure opératoire de récupération validée.

Secret TOTP chiffré AES-256-GCM, nonce aléatoire, identité comme données authentifiées. Format
versionné par identifiant de clé ; jamais plaintext en DB. Présentation manuelle du secret
d'inscription dans l'interface, sans dépendance QR supplémentaire.

| Variable                    | Exigence staging / production                                    |
| --------------------------- | ---------------------------------------------------------------- |
| `IAM_ENV`                   | `staging` ou `production` ; `NODE_ENV=production` refuse `local` |
| `IAM_JWT_PRIVATE_KEY`       | Ed25519 PKCS8 PEM, secret manager                                |
| `IAM_JWT_PUBLIC_KEY`        | Clé publique SPKI correspondante                                 |
| `IAM_MFA_KEYS_JSON`         | Trousseau `{identifiant: clé base64 32 octets}`, secret manager  |
| `IAM_MFA_KEY_ID`            | Clé active du trousseau, identifiant alphanumérique / `_` / `-`  |
| `IAM_CSRF_KEY`              | Clé HMAC indépendante de 32 octets en base64                     |
| `IAM_ALLOWED_ORIGINS`       | Liste d'origines HTTPS exactes séparées par virgules             |
| `API_INTERNAL_URL`          | URL interne API pour le proxy Next.js                            |
| `DATABASE_URL`, `REDIS_URL` | Connexions privées, credentials dédiés hors Git                  |

Rotation MFA : ajouter une clé avec un nouvel ID en conservant les anciennes, déployer le
trousseau partout, puis changer `IAM_MFA_KEY_ID`. Les nouvelles inscriptions utilisent la
nouvelle clé ; les anciennes restent lisibles. Ne retirer une ancienne clé qu'après migration
contrôlée des ciphertexts et vérification des sauvegardes. Aucun batch de rechiffrement n'est
fourni ici. Rotation JWT : la configuration ne conserve qu'une paire active ; bascule coordonnée
des instances, anciens access tokens refusés, restauration via refresh. Rotation CSRF : remplacer
la clé sur toutes les instances ; les clients doivent renouveler leur token via GET csrf.
Ne jamais substituer automatiquement une clé locale en staging/production.

## Cookies, CSRF, CORS et limitation Redis

Cookies sans Domain, HttpOnly, SameSite=Strict. Production/staging : Secure,
`__Secure-gs_refresh` (Path `/api/v1/auth`), `__Host-gs_csrf` (Path `/`). Noms locaux sans préfixe
Secure pour HTTP. Next.js relaie `/api/v1/*` vers NestJS : déploiement attendu same-origin côté
navigateur. Une topologie cross-site exigerait une nouvelle revue, pas un assouplissement implicite.

Double-submit signé : GET csrf livre un token HMAC dans la réponse JSON et un cookie HttpOnly ;
les mutations requièrent le même token dans `X-CSRF-Token`. Origin absente/étrangère rejetée.
CORS credentials uniquement pour les origines exactes autorisées, jamais wildcard. Réponses IAM
no-store, referrer-policy no-referrer et erreurs `{code, status, requestId}`, sans stack interne.

Redis : compteurs atomiques avec TTL 60 s par endpoint et IP, et par identifiant lorsqu'il est
disponible (email/challenge, utilisateur pour refresh). Limites : 40 requêtes/IP/min et
10/identifiant/min ; refresh 120/IP/min et 60/utilisateur/min. Ralentissement de 75 à 600 ms après
trois tentatives ; 429 avec Retry-After 60 au plafond, aucun verrouillage permanent. Couverture
login, forgot/reset, activation, refresh, toutes les routes MFA. Redis indisponible : 503, refus
fermé des opérations concernées, jamais de fallback permissif.

L'IP actuelle est celle du socket ; X-Forwarded-For n'est pas cru. Avec le proxy Next local,
le budget IP est donc partagé. Avant déploiement, définir explicitement les proxies de confiance
et le transport authentifié de l'IP client, puis recalibrer les seuils sous charge. Ce lot ne
configure aucun hébergeur ni reverse proxy de production.

## Audit et évolution PostgreSQL

Migration historique LOT 3 inchangée. Migration additive `20260905000100_iam` : quatre tables
techniques AuthIdentity, AuthToken, RefreshToken, IamAuditLog ; enrichissements IAM de Session,
Membership et RolePermission, nouvelles enums/contraintes. Les 43 modèles antérieurs restent
présents (47 modèles au total), ainsi que leurs FK, CHECK, index et triggers d'immutabilité.
Les sessions historiques sans membership sont révoquées lors de la migration.

L'audit métier historique reste intact. IamAuditLog est append-only via triggers PostgreSQL
contre UPDATE, DELETE et TRUNCATE. Seuls action, requestId, identifiants et date sont acceptés,
pas de metadata libre. Actions : login success/failure significatif, activation, reset,
révocation/logout-all, changement de rôle/permission, switch, MFA enabled/disabled, refresh reuse.
Les logs d'erreur ne contiennent que code et requestId. Aucun mot de passe, token ou secret MFA.
Cela ne protège pas d'un superuser PostgreSQL capable de désactiver les triggers : utiliser
un rôle applicatif non propriétaire, un rôle distinct de migration et une politique de rétention
validée avant production. Aucun privilège de production n'est provisionné dans ce lot local.

## Frontend, tests et limites

Login, Forgot Password, Activation et Reset Password utilisent l'API, avec états loading,
erreurs FR/EN/AR, MFA et redirection vers le dashboard. AuthProvider restaure/renouvelle la
session ; SessionBoundary protège le portail, l'expiration renvoie au login, logout est réel.
Les composants et les mocks métier du LOT 1 ne deviennent pas des clients CRUD.

```bash
pnpm iam:test       # PostgreSQL + Redis, serveur HTTP éphémère et fixtures .invalid
pnpm test          # unités du monorepo
pnpm db:test       # les 18 tests d'intégrité historiques
pnpm build
pnpm test:e2e      # API réelle + Next production, Chromium, 7 tailles d'écran
```

Les tests créent leurs fixtures et secrets aléatoires dans la base locale. Les audits append-only
ne sont pas nettoyés destructivement ; préférer une base jetable en CI. Playwright écrit ses
identifiants temporaires dans `.local/iam-e2e.json` en 0600, sans traces/vidéos/screenshots d'auth.
La capture automatique du DOM en cas d'échec est désactivée. Les tests attendent `aria-busy=false`
sur les pages d'authentification et le contenu du portail avant une nouvelle navigation : une
rotation de refresh ne doit pas être interrompue par le balayage automatique des écrans.
Les ports 3000 et 3100 doivent être libres au démarrage ; Playwright gère et arrête ses serveurs.
La CI démarre PostgreSQL et Redis, génère des clés éphémères et exécute intégrité, IAM, unités,
qualité, build et E2E. Ces tests ne remplacent pas un audit de sécurité indépendant.

Hors lot : emails/Brevo/WhatsApp, recovery codes, UI d'administration IAM complète, CRUD et
requêtes de scopes métier, BullMQ métier, PDF, R2 réel, déploiements Render/Vercel/Kubernetes.
Le LOT 5 n'est pas commencé.
