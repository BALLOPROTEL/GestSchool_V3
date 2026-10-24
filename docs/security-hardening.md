# Durcissement LOT13

Ce lot ne déploie rien et n'ajoute aucune fonctionnalité métier. Les migrations historiques, minor units, scopes et stockage privé restent la base du contrat. Voir l'audit, le modèle de menace, le rapport de certification et `SECURITY.md`.

## Configuration qui refuse de démarrer

Avec `NODE_ENV=production`, l'API et le worker exigent des origines publiques HTTPS explicites (`APP_PUBLIC_ORIGIN`, `DOCUMENT_PUBLIC_ORIGIN`), S3 HTTPS, credentials non locaux/non placeholders, PostgreSQL `sslmode=verify-full`, Redis `rediss:`, IAM staging/production et provider Brevo. Les clés IAM Ed25519 doivent former une paire ; les clés MFA/CSRF/messaging canoniques de 256 bits sont distinctes et non répétitives. Les secrets provider sont bornés et non fictifs. `.invalid`, loopback et origines wildcard sont refusés. Les bases privées restent possibles avec TLS ; aucun secret de production n'est inclus dans les exemples.

`TRUST_PROXY=direct` ignore les en-têtes Forwarded pour l'IP. `TRUST_PROXY=loopback` ne fait confiance qu'au proxy immédiatement relié par loopback et à sa chaîne de proxies loopback. Une origine arbitraire ne peut pas activer le mode proxy ; `true` et un nombre de hops ne sont pas acceptés. Avant Render, vérifier la topologie et les CIDR réels : ne jamais supposer que `loopback` couvre un proxy distant. Cette préparation ne configure pas Render.

Next vérifie ses origines publiques et API HTTPS au démarrage de son serveur production. Il vérifie également le routes-manifest : l’origine API compilée doit correspondre à l’origine validée au démarrage ; un fallback loopback caché ou une origine différente impose une reconstruction. Un build local reste compilable sans configuration de déploiement, mais ne peut pas servir en production avec une réécriture locale. Les E2E de build production démarrent explicitement avec `NODE_ENV=test`, comme leur API/worker de fixtures. `NODE_ENV=production` avec paramètres DEV reste refusé. Les commandes DEV restent protégées ; aucune route d'accès fictif n'est ajoutée à l'application.

## HTTP et navigateur

JSON : 64 KiB ; formulaires : 16 KiB/50 paramètres ; compression de requête désactivée ; profondeur 12 et 2048 nœuds maximum. Les paramètres query dupliqués et propriétés prototype dangereuses sont rejetés. Une taille excessive est HTTP 413 ; compression non supportée HTTP 415. Les DTO Zod restent stricts et les pages sont bornées.

Origines exactes, CSRF HMAC + cookie/header et contrôles de session/RBAC sont conservés. Seul POST `/api/v1/webhooks/brevo` est exempté du contrôle navigateur, avec JSON, authentification provider et limite distribuée. Les cookies production sont HttpOnly/Secure/Strict, sans Domain ; refresh restreint à `/api/v1/auth`. JWT EdDSA uniquement, issuer/audience/durée/session validés, taille ≤4096 et header alg/typ seuls.

Le socket garde les délais LOT12 (65s keepalive + 5s buffer, 75s headers), ajoute 120s request timeout et 100 headers maximum. Nest ne fournit pas de stack/SQL aux clients ; Reports/Dashboard ne transmettent que leurs codes attendus. Les journaux d'échec MFA n'incluent pas de challenge/TOTP. Les erreurs startup worker sont des codes fixes ; les logs Next des URLs d'activation/reset/QR sont ignorés.

API et web : nosniff, Referrer-Policy no-referrer, Permissions-Policy, frame denial. HSTS en production HTTPS. CSP production sans unsafe-eval ; `unsafe-inline` reste nécessaire aux scripts d'hydratation Next/next-themes et styles UI. Il s'agit d'un risque résiduel documenté, pas d'une CSP à nonce. Les pages localisées et API sensibles sont no-store ; pas de source maps navigateur en production. Images externes et SVG distants Next non autorisés.

Les quotas auth sont endpoint/IP et identifier ; le webhook utilise désormais effectivement le limiteur. Exports/communications : 20 mutations/minute par route, tenant et utilisateur authentifiés ; aucune clé tenant client. Le QR conserve son quota IP, sans clé par token. Redis indisponible ferme les opérations ; pas de fallback mémoire. Un NAT/proxy partagé reste à prendre en compte opérationnellement.

## Données, workers, fichiers et réseau

Les queues acceptent seulement leurs noms et DTO UUID connus. Les handlers rechargent la DB par tenant/ID, conservent leases et état terminal. Le worker reports vérifie l'acteur contre tenant/requester, recharge membership/rôles actifs et utilise l'intersection avec les droits initiaux ; une promotion après demande n'élargit pas l'export.

S3 valide à toute opération les clés serveur `tenants/UUID/(documents|reports)/UUID/SHA256.extension`, jamais le filename utilisateur. PDF ≤10 MB, magic bytes PDF ; rapports ≤50 MB avec MIME cohérent. Les téléchargements passent par le serveur autorisé, sans signed URL persistée. Aucun upload HTTP métier n'existe actuellement : les tests de clés empêchent le traversal, ils ne certifient pas un antivirus inexistant.

PDF documents/reports : Chromium JS désactivé, offline, service workers bloqués, toutes routes réseau abandonnées, fonts locales et HTML/XML échappé. Brevo utilise une destination constante HTTPS, redirections refusées et timeout. Le validateur SSRF est testé sans requêtes réelles ; il rejette IPv4 encodée, loopback, RFC1918/link-local, IPv6 locale, protocoles non HTTPS et userinfo. Ne pas l'utiliser comme unique défense de fetchs arbitraires/DNS rebinding ; l'application n'en propose pas.

Le webhook Brevo est protégé par un bearer secret, pas une signature cryptographique du corps. Les doublons sont reconnus sans répéter la mutation, la fenêtre est de 24h et les transitions sont monotones. Ne pas prétendre qu'un body-HMAC a été vérifié : ce contrat n'est pas fourni ici par Brevo.

## Supply chain et contrôles reproductibles

- `pnpm security:test` : builds requis, tests locaux sans provider externe, matrices HTTP/JWT/config/SSRF/queues/fichiers/formules/headers et quotas Redis local. Démarrer `pnpm infra:up` auparavant.
- `pnpm security:secrets --history` : signatures arbre (y compris fichiers non suivis non ignorés, et `.env`) + blobs de tout l'historique local connu. Sorties chemin/commit/type/fingerprint uniquement. Les trois fixtures publiques autorisées sont strictement valeur+chemin ; `.local`, dépendances et caches sont privés et ignorés. Un scanner à signatures ne prouve pas l'absence de tout secret.
- `pnpm security:bundle` : exécute réellement `pnpm build` avec neuf variables serveur canaris, vérifie un BUILD_ID frais et tous les fichiers publics `.next/static`, refuse les maps. Aucun credential réel n'est utilisé et aucun appel tiers n'est fait par le canari.
- `pnpm audit --prod` : audit distant séparé, ponctuel. Les versions correctives sont verrouillées et l'installation CI reste frozen.

Next 16.4.1 et Zod 4.6.6 corrigent leurs advisories sans changement majeur. Overrides ciblés : lodash 4.18.0, mysql2 3.23.1, multer 2.5.0, fast-uri 3.1.9, proxy-addr 2.0.8, body-parser 2.4.0, source-map-js 1.2.2, sharp 0.35.5. `@prisma/config>deepmerge-ts` passe à 8.0.0 pour corriger l'épuisement de pile : changement majeur transitif limité au chargement de configuration Prisma, vérifié par génération, migrations et suites DB ; pas d'upgrade Prisma majeur aveugle.

Actions GitHub par SHA officiels lus avec `git ls-remote` (tag pnpm v5 déréférencé). PostgreSQL/Redis par digests réellement inspectés. Build MinIO/mc existant et ses digests/commits/checksums sont conservés. Le devcontainer reste sur une version nommée et la feature Docker versionnée ; leurs digests devront être validés lors du rafraîchissement de l'image. Dependabot n'active aucun automerge ; CODEOWNERS désigne uniquement @BALLOPROTEL.

Les tests ajoutent explicitement la transformation legacy decorators dans Vitest/OXC, identique à TypeScript Nest ; les assertions de sécurité ne sont pas diminuées. `PLAYWRIGHT_BROWSERS_PATH` et chemins de caches/trust du runtime passent à Turbo sans enregistrer de valeur de secret. Les suites lourdes se lancent séquentiellement et Playwright conserve un worker.

Le seed de démonstration PostgreSQL refuse explicitement tout mode autre que DEV/TEST. Le test canari de logs observe aussi les arguments effectivement transmis au logger et exige au moins un événement, pour éviter une réussite triviale due à un logger désactivé. La CI refuse les advisories production High/Critical dans une étape distincte des tests déterministes, et checkout ne conserve pas ses credentials.
