# Runbook de staging GestSchool V3

Statut : procédure préparée, non exécutée sur un fournisseur. Ne pas appliquer aux projets V2 ou production. Utiliser une URL staging distincte, des ressources dédiées et les stores de secrets des fournisseurs. Ne pas utiliser `.env.example`, `iam:dev` ou le seed DEV sur staging.

## Inventaire à compléter avant provisionnement

| Élément                                                                | État                                                                                                                                         |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Équipe et nouveau projet Vercel staging, domaine stable distinct de V2 | Compte/team GestSchool existant ; `gestschool-v3-staging`, domaine souhaité `gestschool-v3-staging.vercel.app`, disponibilité non vérifiée   |
| Workspace Render, région, service API et background worker             | Compte GestSchool connecté ou personnel ; région EU commune ; `gestschool-v3-api-staging` et `gestschool-v3-worker-staging`                  |
| Fournisseur/plan PostgreSQL, DB dédiée et rôles                        | Render `gestschool-v3-postgres-staging` ; plan/rôles à confirmer                                                                             |
| Fournisseur/plan Redis TCP/TLS compatible BullMQ                       | Render `gestschool-v3-redis-staging` ; plan/compatibilité à confirmer                                                                        |
| Fournisseur S3/R2, bucket privé, clés dédiées et rétention             | Non choisis                                                                                                                                  |
| Compte Brevo, sender, templates approuvés, destinataires de test       | Compte GestSchool LOT11 existant ; sender/templates non accessibles ; `<EMAIL_TEST>` non remplacé : aucun envoi réel, MANUAL ACTION REQUIRED |
| Coûts, sauvegardes, localisation et accès opérateurs                   | À revoir avec le propriétaire                                                                                                                |

## Ordre d'exécution après revue

1. Accéder aux comptes autorisés ci-dessus et valider les plans/coûts ; enregistrer les IDs non secrets. Activer les connexions Vercel/Render proposées. Ne pas réutiliser le projet qui porte `gestschool.vercel.app`.
2. Créer DB, Redis et bucket dédiés ; activer TLS/auth/chiffrement/backups. Vérifier la CA, les commandes Redis utilisées par BullMQ et la politique noeviction. Garder les accès réseau au minimum nécessaire.
3. Créer les rôles migration/runtime si le provider le permet. Interdire DDL et accès aux tables de migrations au runtime ; vérifier les opérations métier et triggers avec ce rôle. Documenter tout partage de rôle comme risque à accepter, sans prétendre à une séparation réalisée.
4. Générer les clés Ed25519, MFA/CSRF/messaging indépendantes dans un contexte opérateur sûr ; les injecter uniquement dans les secret stores. Aucune clé dans Git, logs, chat, arguments de commande, rapport ou bundle. Enregistrer les références de versions de secrets, jamais les valeurs.
5. Déployer les migrations existantes avec le rôle migration via `pnpm db:migrate:deploy`, depuis la racine du monorepo. Injecter `DATABASE_URL` de migration pour cette commande uniquement. Pas de `migrate dev`, reset, nouvelle migration historique ou restauration sur DB active.
6. Préparer un bootstrap staging spécifique, revu et testé sur base jetable, avant de créer les comptes contrôlés. Le seed actuel crée une école locale et refuse `NODE_ENV=production` : ne pas contourner ce refus en mettant staging en DEV. Le bootstrap doit créer uniquement des tenants A/B fictifs, référentiels, permissions/rôles et comptes contrôlés ; l'activation/MFA passe par les vrais parcours IAM. Aucun mot de passe par défaut, bypass MFA ou token réutilisable. Cet outil n'est pas encore livré dans la préparation actuelle, faute d'identités autorisées et de cible DB.
7. Déployer API et worker séparés, sur le même SHA revu. Vérifier readiness avant de rendre le web accessible. Aucun service public worker. Conserver les queues et leases pendant redéploiement ; tester SIGTERM, reprise et absence de doublons/pertes.
8. Créer le projet web staging avec root `apps/web`, Next.js, Node 24.x compatible avec `engines`, pnpm 10.24.0 et accès aux packages hors root. Depuis cette root : install `cd ../.. && pnpm install --frozen-lockfile --prod=false` ; build `cd ../.. && pnpm --filter @gestschool/web... build`. Les dépendances de développement sont nécessaires à la compilation, même si le runtime utilise `NODE_ENV=production`. Conserver output Next par défaut ; pas de static export. Utiliser Preview ou un environnement personnalisé staging, sans déploiement Production ni promotion vers le projet V2.
9. Configurer un domaine staging stable dans `APP_PUBLIC_ORIGIN`, la même origine dans `IAM_ALLOWED_ORIGINS`, et `API_INTERNAL_URL` avec l'origine API HTTPS. Toute modification de cette dernière impose un nouveau build Vercel. Ne pas ouvrir CORS à tous les sous-domaines Preview.
10. Exécuter les tests distants et collecter des preuves sans secrets. GO uniquement après fermeture de chaque blocage du rapport. Ne pas taguer LOT14 avant revue du propriétaire.

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
| `MESSAGING_PROVIDER`, `MESSAGING_TOKEN_KEY`                    | Interdits                                            | `brevo`, clé AES-GCM 256 bits indépendante                                                     |
| `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET`                        | Interdits                                            | Secrets distincts ; webhook bearer dédié                                                       |
| `BREVO_EMAIL_SENDER`, `BREVO_EMAIL_SENDER_NAME`                | Inutiles                                             | Sender réel vérifié pour tests                                                                 |
| `BREVO_WHATSAPP_SENDER`, `BREVO_WHATSAPP_TEMPLATE_IDS_JSON`    | Inutiles                                             | Configuration réelle FR/EN/AR exigée par le runtime actuel                                     |
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
