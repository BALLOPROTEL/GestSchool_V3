# Runbook LOT14 — staging strictement gratuit

Point de reprise du **26 octobre 2026, Europe/Paris** : **14 migrations appliquées et checksums vérifiés**, API readiness trois dépendances up, commandes normales restaurées, API live sur `b5a791f`, worker live sur `818ad43`. Worker : les trois runtimes et readiness ont réussi après migration, un réveil a échoué avec ConnectionTimeoutError Redis ; le nouveau déploiement a une readiness PASS après un échec PostgreSQL ponctuel, stabilité non certifiée. **Vercel staging READY**, pages FR/EN/AR accessibles ; 49 smoke en attente de l'accès réseau de l'environnement de test. **NO-GO LOT14**, quatre documents non committés.

Décision du 25 octobre 2026 : zéro paiement, zéro carte, aucun R2. Supabase Storage Free, Upstash Redis Free, API et worker Render Web Free, PostgreSQL Render Free existant, Vercel Hobby. Les limites Free sont acceptées pour staging ; elles ne dispensent pas des preuves de sécurité/fonctionnement. V2 exclue, aucun merge, tag LOT14 ou LOT15.

## Stockage réel et secrets

Projet Supabase existant `gestschool-v3-staging` / `rwmuksaafbnphurxaofq`, organisation PROTEL's vérifiée Free, région réelle `eu-west-1`. Le projet est réutilisé ; ne pas réutiliser `gestschool_v2BD`. Bucket `gestschool-v3-staging-private`, public=false confirmé. API Render cible `srv-dbei87lg1s2s73fmb7h0` dans workspace `tea-d50tlb24d50c73cbo9m0`.

```text
S3_ENDPOINT=https://rwmuksaafbnphurxaofq.storage.supabase.co/storage/v1/s3
S3_REGION=eu-west-1
S3_BUCKET=gestschool-v3-staging-private
S3_FORCE_PATH_STYLE=true
```

Ces quatre paramètres non secrets sont enregistrés dans Render. S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY et REDIS_URL TCP rediss sont signalés enregistrés par le propriétaire dans les secrets API Render. Ne jamais les lire pour les mettre dans un outil local, les sortir dans des logs, `.env`, Git ou le chat. Copier/partager uniquement dans les mécanismes Render avec le futur worker. Aucun secret via Docker ARG ou image.

## Exécution du diagnostic S3 dans Render

1. Publier uniquement la branche LOT14 après revue explicite des fichiers, en conservant l'interdiction de merge/tag. Le hook API est dans `scripts/staging-storage-build-probe.mjs` et la sonde dans `scripts/staging-storage-probe.mjs`. Avant publication, ne pas prétendre qu'ils sont disponibles au provider.
2. Définir temporairement `LOT14_STORAGE_PROBE=true` sur l'API staging via fusion de variables. Le build existant `pnpm install --frozen-lockfile --prod=false && pnpm --filter @gestschool/api... build` compile puis exécute le hook avec les clés **uniquement dans Render**. La sonde n'a pas besoin de DB, Redis, clés IAM ou envoi Brevo. Une cible autre que le projet exact ou APP_ENV différent de staging est refusée avant toute écriture.
3. Suivre le deploy ID et lire uniquement les événements sûrs `LOT14_STORAGE_PROBE`. Exiger PASS pour HeadBucket, PutObject, GetObject/checksum/MIME, GET/LIST/PUT S3 anonymes refusés, absence de modification, route publique refusée et DeleteObject vérifié. Objet PDF jetable à UUID aléatoires ; aucune suppression d'objet utilisateur. Un statut 404 ou redirect ne prouve pas le refus S3 anonyme.
4. En cas d'échec, garder FAIL, nettoyer seulement la probe et investiguer sans afficher le secret. Ne modifier l'adaptateur qu'après incompatibilité démontrée. Désactiver ensuite le flag par `LOT14_STORAGE_PROBE=false` pour les builds habituels. Le démarrage de l'API peut rester bloqué par d'autres dépendances : un diagnostic S3 PASS ne signifie pas API healthy.

## Worker Render Web Service Free

Après publication de la branche, créer `gestschool-v3-worker-staging`, runtime Docker, plan **free**, région `frankfurt`, branche `feat/lot14-staging-certification`, contexte racine, Dockerfile `docker/worker/Dockerfile`, auto-deploy désactivé pour la certification. Le CMD démarre le worker réel, pas un serveur health isolé. Définir APP_ENV staging, NODE_ENV production, IAM_ENV staging, WORKER_HTTP_HEALTH_ENABLED true ; Render fournit PORT. Sonde `/health/ready`, écoute 0.0.0.0 après démarrage des trois runtimes, réponses génériques 200/503, GET/HEAD, no-store. `/health` équivaut readiness, `/health/live` vérifie seulement le processus. Aucun endpoint métier.

Installer dans les stores Render les mêmes connexions DB/Redis/S3 et configurations Brevo nécessaires ; ne pas extraire les clés via le chat. Vérifier migrations avant workers. Garder le refus de config prod, pas de mode DEV/local ou seed DEV forcé. Le worker Free peut dormir : le réveiller manuellement via HTTPS avant tests, vérifier readiness, tester ensuite reprises/leases/outbox. Ne pas promettre que Redis le réveillera, ne pas ajouter de keepalive permanent ou option payante.

Image : Node 24.20.0, pnpm 10.24.0 frozen, Chromium Playwright et bibliothèques installés, runtime non root, SIGTERM reçu directement. `.dockerignore` exclut secrets/artefacts. Validation locale avec CA de proxy en secret BuildKit facultatif, jamais incorporée dans les couches. Aucun secret applicatif au build Docker.

## Limites et prérequis restants

Supabase Free : 1 GB, plafond fichier 50 MB, pause possible après inactivité, sans production/HA. Render Web Free : sommeil, redémarrages, stockage local éphémère, quota partagé 750 heures/mois. PostgreSQL Free existant : 1 GB, temporaire, expiration 23 novembre 2026, sans backup fournisseur. Upstash Free : quotas/polling, TCP TLS requis, pas d'URL REST, pas d'upgrade. Vérifier l'éviction désactivée et le comportement au plafond dans la console ; aucune configuration provider n'est attestée par la seule déclaration de l'URL. Limites acceptées pour ce staging uniquement.

Préparer encore les clés IAM/crypto dans les stores, les credentials/templates Brevo (aucun email sans recipient autorisé), les migrations deploy et un bootstrap fictif A/B sécurisé sans seed DEV. Lier le projet Vercel staging et configurer seulement la Preview LOT14. La commande d'ignorance de build précédemment rejetée n'est pas appliquée. Auth/MFA/RBAC/tenant/worker complet et 49 smoke distants restent à exécuter. Voir les 45 points dans `../lot14-certification.md`.

## Variables : séparation web / API / worker

| Variable                                                       | Web                                                  | API / worker                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `APP_ENV`                                                      | `staging`                                            | `staging`                                                                                      |
| `NODE_ENV`                                                     | `production`                                         | `production`                                                                                   |
| `IAM_ENV`                                                      | `staging` (validation de cohérence, pas de clés IAM) | `staging`                                                                                      |
| `APP_PUBLIC_ORIGIN`                                            | Origine HTTPS staging stable                         | Même origine web                                                                               |
| `API_INTERNAL_URL`                                             | Origine API HTTPS explicite, au build                | Inutile                                                                                        |
| `DOCUMENT_PUBLIC_ORIGIN`                                       | Inutile                                              | Origine web staging pour les QR                                                                |
| `API_HOST` / `PORT`                                            | Inutiles                                             | API : `0.0.0.0` / port fourni ; `API_PORT` prioritaire si explicite                            |
| `TRUST_PROXY`                                                  | Inutile                                              | API : `direct` tant que la chaîne réelle n'est pas validée ; jamais `true` ou hops arbitraires |
| `IAM_ALLOWED_ORIGINS`                                          | Inutile                                              | Origine web exacte, sans wildcard                                                              |
| `DATABASE_URL`                                                 | Interdit                                             | Secret dédié, `postgresql:` + `sslmode=verify-full`, CA vérifiée                               |
| `REDIS_URL`                                                    | Interdit                                             | Secret dédié `rediss:`, mot de passe, DB/instance staging                                      |
| `IAM_REDIS_PREFIX`                                             | Inutile                                              | `gestschool:iam:staging` ; n'isole pas les queues BullMQ                                       |
| `IAM_JWT_PRIVATE_KEY`, `IAM_JWT_PUBLIC_KEY`                    | Interdits                                            | Secrets Ed25519 PKCS8/SPKI correspondants                                                      |
| `IAM_MFA_KEYS_JSON`, `IAM_MFA_KEY_ID`, `IAM_CSRF_KEY`          | Interdits                                            | Trousseau MFA et HMAC CSRF aléatoires/distincts                                                |
| `MESSAGING_PROVIDER`, `MESSAGING_TOKEN_KEY`                    | Interdits                                            | `brevo`, clé AES-GCM 256 bits canonique base64, indépendante et identique API/worker           |
| `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET`                        | Interdits                                            | Secrets distincts ; webhook bearer dédié                                                       |
| `BREVO_EMAIL_SENDER`, `BREVO_EMAIL_SENDER_NAME`                | Inutiles                                             | Sender réel vérifié pour tests                                                                 |
| `BREVO_WHATSAPP_SENDER`, `BREVO_WHATSAPP_TEMPLATE_IDS_JSON`    | Inutiles                                             | Staging : facultatifs, WhatsApp interdit ; production : sender et FR/EN/AR obligatoires        |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` | Interdits                                            | Endpoint HTTPS et bucket privé dédiés, paramètres provider exacts                              |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                     | Interdits                                            | Secrets minimaux dédiés                                                                        |
| `PLAYWRIGHT_BROWSERS_PATH`                                     | Inutile                                              | Worker : chemin Chromium installé, lisible par l'UID runtime                                   |

Aucune variable cliente `NEXT_PUBLIC_*` ne doit contenir un secret. Les clés et URLs de DB ne sont même pas nécessaires au build web. Le graphe Turbo transmet les modes et origines explicitement pour éviter un build mis en cache avec une autre cible.

API : build `pnpm --filter @gestschool/api... build`, start depuis la racine `node apps/api/dist/main.js`. Worker : build `pnpm --filter @gestschool/worker... build`, start `node apps/worker/dist/main.js`. Installer Node/pnpm aux versions du repository. Pour le worker, une image/runtime doit fournir Chromium Playwright et ses librairies système (version Playwright du lockfile), les fontes des packages et les permissions de sandbox nécessaires. L'image de stockage locale `docker/ci-storage` n'est pas une image API/worker de staging et ne doit pas être réutilisée pour cela. Une image de déploiement reproductible reste à construire/valider après sélection du provider ; les commandes seules ne certifient pas son OS.

`BREVO_TEST_RECIPIENT` est une variable API/worker de staging, jamais cliente : elle contient uniquement l'adresse contrôlée autorisée. Absence, `<EMAIL_TEST>` ou adresse invalide : tous les emails staging sont bloqués avant appel réseau. WhatsApp staging reste bloqué, même avec des templates approuvés. Une adresse valide différente est également refusée. Ne renseigner aucune adresse réelle avant autorisation du propriétaire ; les tests du verrou utilisent uniquement un fetch simulé.

## Sondes et contrôles distants

- API HTTPS `/health/live` : 200/status ok. `/health/ready` : 200, postgres/redis/storage up ; configurer la sonde fournisseur sur ready. Aucun credential/hostname/version dans la réponse.
- Web via Vercel : HTTPS, réécriture `/api/v1/auth/csrf`, cookie `__Host-gs_csrf` Secure/HttpOnly/Strict/Path=/ ; refresh `__Secure-gs_refresh` Path=/api/v1/auth ; pas de Domain. Vérifier aussi login, refresh, logout, révocation et MFA, pas seulement la page de connexion.
- CORS : origine exacte admise, étrangères/null/suffixes refusées. CSRF absent/invalide refusé. Vérifier la transmission réelle de Origin/Set-Cookie à travers Vercel et le proxy API.
- Stockage : objet de probe à clé serveur valide, authentifié puis LIST/GET/PUT anonymes refusés. Vérifier que le PUT refusé n'a pas modifié le checksum ; supprimer seulement la probe. Pas de scan, bucket public, URL signée persistée ou action sur un objet utilisateur.
- Quotas : burst limité dans un namespace/compte de test, 429 puis isolation d'un autre tenant/utilisateur, panne Redis → fail closed. Ne pas appliquer de charge à V2.
- Worker : requête document, export CSV/XLSX/PDF et message de test via les vraies APIs ; observer outbox, job, lease, stockage/provider et état terminal. Tester retry et SIGTERM contrôlés sans perdre de job ; journaliser uniquement IDs/codes/compteurs.
- Brevo : un destinataire autorisé, pas de masse ; callback `/api/v1/webhooks/brevo`, bearer valide/invalide, événement périmé, doublon/replay et statut delivery. Le bearer n'est pas un HMAC du body.

## Smoke E2E distant livré

Définir uniquement les deux origines publiques non secrètes `STAGING_WEB_ORIGIN` et `STAGING_API_ORIGIN`, puis lancer `pnpm staging:test:e2e`. La configuration refuse HTTP/local/V2, ne démarre aucun serveur localhost, n'importe aucune fixture DEV et ne capture ni trace, screenshot ni vidéo. Elle découvre 49 tests : 3 langues × 2 thèmes × 7 viewports, plus 7 sondes API/CORS. Elle vérifie login prêt, langue/RTL, overflow, headers, cookie CSRF, compteurs console/page/API à zéro et annote une durée observée.

Cette suite est un **smoke public non destructif**, pas la certification complète d'auth/MFA/RBAC, tenants A/B, finance, résultats et worker. Ces parcours distants nécessitent les comptes/jeux fictifs autorisés et restent à implémenter/valider. Ne pas lancer les anciens E2E localhost contre staging : ils utilisent leurs fixtures et ne sont pas une suite distante.

## Sauvegarde et restauration isolée

Préférer les snapshots/PITR chiffrés du fournisseur, vérifier rétention, accès, restauration et facturation. Définir RPO/RTO avec le propriétaire avant de les annoncer. Créer une DB isolée identifiée comme restauration staging, jamais écraser la DB active. Avec les credentials dans des services libpq fournis par le secret store (pas d'URL en argv/logs), une alternative est `PGSERVICE=staging-backup pg_dump --format=custom --no-owner --file=/secure/staging.dump`, puis `PGSERVICE=staging-restore pg_restore --exit-on-error --no-owner --dbname=service=staging-restore /secure/staging.dump`. Le chemin est un stockage opérateur chiffré, jamais un artifact CI public.

Avant restore : comparer les IDs des bases, rôle, hôte, cible isolée et absence de sessions actives. Après restore : `prisma migrate status`, intégrité/FK, comptes fictifs tenants A/B, montants finance et résultats/snapshots attendus. Isoler tout worker/email/Redis de la copie pour éviter réémission de jobs/messages. Enregistrer les durées mesurées et checksums, puis détruire uniquement la copie selon la rétention approuvée. Aucun backup/restore distant n'a encore été exécuté.

## Observabilité et sécurité GitHub

Conserver IDs de requête, codes sûrs, état de dépendances, profondeur/âge des files et échecs de jobs. Masquer Authorization, Cookie/Set-Cookie, mots de passe, TOTP, bearer QR/reset, clés et URLs DB dans les logs du proxy/fournisseur, pas seulement dans l'application. Tester avec des canaris, jamais afficher un vrai secret pour le chercher. Mettre des alertes sur health, backlog/leases, erreurs auth/provider et échec de backup.

Le propriétaire doit vérifier protections main (review/CI requise, force-push et suppression interdits), scans et reporting privé. L'API de protection classique retourne 403 à l'intégration ; ne pas déduire de ce refus que le dépôt est non protégé. Ne pas activer de règles qui bloqueraient le propriétaire sans examiner leurs bypass et droits.

Recertification locale de cette préparation terminée : 14 étapes PASS, 187 sécurité, 502 unités, 358 IAM/métier, 13 Reports, Messaging frais, 114 E2E PASS / 89 skips contractuels / 0 FAIL. Image validée non root/512 Mo/PDF et démarrage incomplet refusé. Les tests S3 Supabase sont PASS réels ; les clés restent dans Render.

## Checkpoint réel après publication du WIP

Source publiée après autorisation : `dcb707ff6abdd72bf23941e030369799eddc7924`. **Supabase S3 PASS réel**, observé dans les logs applicatifs API du déploiement `dep-dbf6o684cbqc73dstdr0` le 25 octobre 2026 à 21:55:31–33 Europe/Paris : HeadBucket, PutObject, GetObject/checksum/MIME, DeleteObject/disparition, GET/LIST/PUT S3 anonymes refusés, objet inchangé et route publique Supabase refusée. Bucket toujours privé, zéro objet après nettoyage. Preuves détaillées dans le rapport de certification. Adaptateur S3 inchangé, secrets uniquement dans Render.

Le diagnostic a été exécuté temporairement au démarrage API pour rendre ses événements lisibles via la connexion de logs. Commande normale `node apps/api/dist/main.js` maintenant restaurée et vérifiée ; flag de build LOT14_STORAGE_PROBE=false.

Worker Web Service Free créé : `srv-dbf6hbq9lscs738vvea0`, `https://gestschool-v3-worker-staging.onrender.com`, Docker / Francfort / branche LOT14, sonde `/health/ready` enregistrée. Le propriétaire a confirmé sslmode=verify-full dans les deux DATABASE_URL. Le dernier worker reste en échec `WORKER_STARTUP_FAILED` après ce réglage ; le propriétaire identifie un `ConnectionTimeoutError` Redis TLS ; la configuration IAM API est chargée et la clé messaging est configurée ; le correctif API est live, mais sa readiness reste HTTP 503. Aucun TLS affaibli ni faux health. Les parcours applicatifs et les 49 smoke restent non certifiés : **NO-GO LOT14**, indépendamment du succès S3.

Aucun paiement ou carte, merge, tag GO, production finale, LOT15 ou modification V2. Les mises à jour documentaires post-exécution restent non committées pour revue.

### État actuel — migrations appliquées, Vercel prêt, réveil worker à diagnostiquer

HEAD publié : `818ad4325e0e7d154c4799b536a5355b36c5fd68`, branche `feat/lot14-staging-certification`. Les quatre documents restent hors commit. Correctif email seul `0cbd8d9`, CLI Redis `4f561bc`, préflight worker `b4fa1d6`, lanceur de migration `b5a791f`, diagnostic sûr des dépendances `818ad43`.

**Migrations PASS réel** : API `dep-dbf9pilg1s2s73f0a8b0`, événement du 26 octobre à 01:22:54 CET (00:22:54Z), LOT14_MIGRATIONS / PASS / applied=14 / checksumsVerified=true. Les 14 migrations historiques et leurs checksums sont conservés ; aucun reset ni seed. Le lanceur refuse une autre base, origine, environnement, manifeste SQL ou absence du flag --apply. Prisma utilise require/strict dans son seul sous-processus, vérification finale pg et applications verify-full. Les quatre tests TLS locaux, dont CA inconnue et mauvais hostname refusés, sont PASS.

**Commandes normales restaurées et vérifiées** après confirmation du propriétaire : API Start Command `node apps/api/dist/main.js`, worker Docker Command vide. Les deux sondes fournisseur sont `/health/ready`, aucun hook de migration ou probe au démarrage normal. Flag de build S3 LOT14_STORAGE_PROBE=false. API normale `dep-dbf9t90m7kps738a2q70`, live sur b5a791f ; lecture publique réelle : postgres/redis/storage up, status ok.

**Worker initial PASS réel puis régression au réveil** : `dep-dbf9ptlg1s2s73f0b7jg`, live sur b5a791f, instance bmvq7. Le 26 octobre à 01:24:40–50 CET, les trois marqueurs Documents, Messaging et Reports ready, les trois dépendances up et « GestSchool worker is ready » sont observés. `/health/ready` a répondu status ok. À partir de 01:45:39 CET, nouvelle instance wvw4f : ConnectionTimeoutError du client @redis/client puis WORKER_STARTUP_FAILED, avant tout runtime ready ; les nouvelles requêtes publiques live/ready répondent 503. La même nouvelle instance wvw4f a finalement redémarré les trois runtimes et annoncé dependencies up / worker ready à 01:48:40–50 CET. Une lecture publique ultérieure de /health/live est status ok, mais /health/ready reste observée à 503. Le succès initial ou la reprise ne certifient donc pas une readiness stable après veille. Aucun health factice, timeout augmenté à l'aveugle, client remplacé ou TLS affaibli.

PostgreSQL externe verify-full fonctionne depuis API et a fonctionné depuis worker. Allowlist propre à la base exactement **74.220.51.0/24** et **74.220.59.0/24** ; règle Workspace globale inchangée. Le premier préflight worker avant migration avait correctement constaté cinq tables absentes ; ce constat historique est remplacé par les 14 migrations vérifiées et le démarrage des runtimes. Redis DNS/TCP/TLS/AUTH/PING avait réussi sur API et worker, même empreinte `13d2bc5311dc`, rediss/6379 ; cette preuve historique ne garantit pas le réveil ultérieur. S3 privé conserve sa certification réelle signée/anonyme et son nettoyage. Credentials exclusivement dans Render.

**Vercel staging READY** : compte Hobby `PROTEL's projects`, projet dédié `prj_3UdsP3bidz7SrLfkogJC7VqPrxU8`, déploiement `dpl_BQU8zCpKaGRJyRYLS3BrakGsy7hj` sur le SHA b5a791f. URL stable `https://gestschool-v3-staging.vercel.app`, root apps/web, Node 24, dépendances workspace incluses, fonctions fra1. L'échec précédent venait d'APP_ENV absent des builds Preview ; APP_ENV=staging, IAM_ENV=staging, NODE_ENV=production et les deux origines publiques exactes sont configurés sur ce seul projet, en Preview et Production Vercel. Production désigne ici l'alias stable du projet staging ; aucune production officielle ni bascule V2. Aucun secret backend dans le web. Pages FR/EN/AR servies ; requête de contrôle login HTTP 200, CSP sans unsafe-eval, no-store, HSTS et nosniff observés. La route réécrite /api/v1/auth/csrf répond HTTP 200. La réponse CSRF et son cookie ont été contrôlés sans afficher leurs valeurs : __Host-gs_csrf, Secure, HttpOnly, SameSite=Strict, Path=/, sans Domain ; réponse no-store/nosniff. Cela ne remplace pas la validation navigateur de l'hydratation ou de l'authentification.

**49 smoke : NOT RUN**. Le proxy de l'environnement local refuse CONNECT vers les trois domaines staging (403). Le propriétaire confirme les trois hôtes ajoutés, mais la révision active 46 ne les contient pas et CONNECT reste refusé ; vérification de l'enregistrement dans cette session demandée. Aucun contournement du proxy. Playwright --list découvre bien 49 tests, avec le proxy de l'environnement conservé et ignoreHTTPSErrors=false ; aucun test distant exécuté ou résultat de navigateur distant revendiqué. Les parcours Tenant A/B, auth/MFA/RBAC/isolation et worker document PDF/report/téléchargement privé restent NOT RUN ; seed DEV toujours interdit en staging, bootstrap contrôlé encore requis.

Recertification du HEAD publié : 14 étapes PASS ; sécurité **235**, unités **531**, IAM **358**, Reports **13**, Messaging intégré sur DB locale neuve isolée PASS, CLI **19** tests inclus dans la sécurité, audit/typecheck/lint/format/build/bundle/diff verts. Référence navigateur locale inchangée 0cbd8d9 : **114 PASS / 89 skips contractuels / 0 FAIL**, pas de nouvelle assertion affaiblie.

Diagnostic worker `818ad43` publié et poussé après les 14 vérifications vertes : uniquement des états fixes postgres/redis/storage up/down sont journalisés en cas de dépendance indisponible, jamais l'erreur brute ni la configuration. Quatre tests couvrent le succès et chaque dépendance en défaut, sans rendre ready un worker indisponible. Déploiement normal `dep-dbfaattg1s2s73f1u7i0` **live** sur 818ad43, instance wm6qz ; commande Docker toujours vide, sonde /health/ready. Trois runtimes ready et dépendances up observés le 26 octobre à 02:01:10–19 CET (01:01:10–19Z), puis diagnostic à 02:01:27 CET : **postgres=down, redis=up, storage=up**. Une nouvelle lecture publique réelle de /health/ready répond ensuite status ok, API également postgres/redis/storage up. La cause du défaut PostgreSQL ponctuel reste à mesurer ; aucune panne Redis n'est déduite de ce dernier résultat. Aucun timeout, client, adaptateur, validation ou architecture changé.

Verdict **NO-GO LOT14** : readiness worker intermittente et certification distante applicative incomplète. **MANUAL ACTION REQUIRED — Brevo test recipient** ; aucun email réel. Limites Free acceptées uniquement pour staging : Supabase 1 GB, fichier 50 MB, pause après inactivité et sans HA ; services Render pouvant dormir ; PostgreSQL Free temporaire. Aucun paiement, carte, merge, tag GO, changement V2, production finale ou LOT15.
