# LOT14 — Supabase Storage et stratégie staging entièrement gratuite

**Reprise PostgreSQL : corrélation opérateur confirmée postgres down / Redis et Storage up. Classification sûre ajoutée ; timeouts et tentative unique conservés faute de preuve de timeout. Déploiement et fenêtre de stabilité bloqués par l'absence d'accès Render. Voir le [diagnostic et la suite conditionnelle](lot14-postgres-readiness.md). NO-GO maintenu.**

**Nouvelle exécution distante, 26 octobre 2026 à 18:58 CET : 49 PASS / 0 FAIL / 0 SKIP. NO-GO maintenu : deux readiness worker HTTP 503 reproduites. Tenant A/B et worker E2E non lancés ; aucun bootstrap disponible, confirmé par le propriétaire. Voir les [preuves et le diagnostic distinct PostgreSQL](lot14-remote-certification-2026-10-26.md). Les checkpoints ci-dessous sont historiques.**

Point de reprise du **26 octobre 2026, Europe/Paris** : **14 migrations appliquées et checksums vérifiés**, API readiness trois dépendances up, commandes normales restaurées, API live sur `b5a791f`, worker live sur `818ad43`. Worker : les trois runtimes et readiness ont réussi après migration, un réveil a échoué avec ConnectionTimeoutError Redis ; le nouveau déploiement a une readiness PASS après un échec PostgreSQL ponctuel, stabilité non certifiée. **Vercel staging READY**, pages FR/EN/AR accessibles ; 49 smoke en attente de l'accès réseau de l'environnement de test. **NO-GO LOT14**, quatre documents non committés.

État de revue du 25 octobre 2026 (Europe/Paris) : **NO-GO**, préparation terminée et recertification locale complète réussie ; **tests S3 Supabase exécutés et PASS**, services applicatifs encore bloqués. Décision explicite du propriétaire : **zéro paiement, zéro carte avant validation client**. Cloudflare R2 est abandonné. Supabase Storage Free remplace le fournisseur de stockage encore indéterminé du checkpoint précédent. Le worker est désormais autorisé comme Web Service Render Free avec `/health` ; les anciennes exigences d'un Background Worker payant sont remplacées pour ce staging.

## Ressources et stockage observés

Organisation Supabase `PROTEL's`, `oivgwikrcgdbpygwhujs`, plan `free` / `tier_free` vérifié via la connexion. Le projet `gestschool-v3-staging` existe déjà : `rwmuksaafbnphurxaofq`, état `ACTIVE_HEALTHY`, région réelle `eu-west-1` (Irlande). Il est réutilisé conformément à l'autorisation « créer/utiliser » ; aucune migration de région, aucun doublon et aucune modification de V2. Le projet V2 `gestschool_v2BD` reste exclu.

Le bucket `gestschool-v3-staging-private` est confirmé dans `storage.buckets`, `public=false`. `file_size_limit=null` hérite du plafond global de l'offre, au maximum 50 MB sur Free ; ce n'est pas une absence de plafond fournisseur. Les premières lectures étaient vides, puis la création manuelle du propriétaire a été confirmée par une nouvelle lecture. Aucune écriture SQL sur les métadonnées Storage n'a été faite : les opérations passent par l'API/S3.

Les paramètres **non secrets** suivants ont été enregistrés sur le seul service API Render, en fusion avec ses variables existantes :

```text
S3_ENDPOINT=https://rwmuksaafbnphurxaofq.storage.supabase.co/storage/v1/s3
S3_REGION=eu-west-1
S3_BUCKET=gestschool-v3-staging-private
S3_FORCE_PATH_STYLE=true
```

Le propriétaire confirme avoir enregistré `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` et l'URL TCP TLS Upstash `REDIS_URL` directement dans les secrets Render. Aucune valeur n'a été lue, copiée localement, écrite dans Git, dans un rapport, un log ou le chat. Une déclaration de configuration ne vaut pas un test de fonctionnement. La connexion Supabase actuelle ne gère ni création de bucket par API Storage ni génération de clés S3 ; ces étapes ont été effectuées dans l'interface par le propriétaire. Aucun achat, compte payant ou rechargement navigateur.

## Les 45 points de certification

| Nº  | Point                  | État / preuve / limite                                                                                                                                               |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | HEAD / branche         | HEAD `818ad4325e0e7d154c4799b536a5355b36c5fd68` publié sur feat/lot14-staging-certification ; quatre docs hors commit                                                |
| 2   | Vercel team / projet   | `PROTEL's projects`, `team_bDjUZ3B4w8Iih7vBbRayKIGI`, projet `prj_3UdsP3bidz7SrLfkogJC7VqPrxU8` / `gestschool-v3-staging`                                            |
| 3   | Web staging            | https://gestschool-v3-staging.vercel.app : Vercel READY sur b5a791f ; pages FR/EN/AR, headers et rewrite CSRF HTTP 200 observés ; navigateur non certifié            |
| 4   | Render workspace       | `GESTSCHOOL-V3`, `tea-d50tlb24d50c73cbo9m0`, Francfort                                                                                                               |
| 5   | API staging            | API normale dep-dbf9t90m7kps738a2q70 / b5a791f live ; /health/ready PASS public réel, postgres/redis/storage up                                                      |
| 6   | Worker service         | Web Service Free ; 818ad43 live, trois runtimes et readiness publique PASS ; un check PostgreSQL down observé, stabilité non certifiée                               |
| 7   | PostgreSQL             | PostgreSQL Free externe : PASS depuis API, verify-full conservé ; allowlist exactement 74.220.51.0/24 et 74.220.59.0/24 ; expiration 2026-11-23T21:32:39Z            |
| 8   | Redis                  | DNS/TCP/TLS/AUTH/PING PASS réels sur API et worker ; même empreinte 13d2bc5311dc, rediss/6379 ; RedisHealth up dans les deux services                                |
| 9   | Storage                | **PASS réel** : Supabase Free `rwmuksaafbnphurxaofq`, `eu-west-1`, bucket `gestschool-v3-staging-private` confirmé privé avant/après tests et vide après nettoyage   |
| 10  | Brevo                  | Configuration Brevo franchie au démarrage API du correctif ; clés token/API/webhook et sender requis conservés ; MANUAL ACTION REQUIRED — Brevo test recipient       |
| 11  | Migrations             | PASS réel : 14 migrations appliquées et checksums vérifiés, aucun reset/seed ni migration historique modifiée                                                        |
| 12  | Seed Tenant A/B        | NOT RUN à distance ; protection DEV maintenue, bootstrap staging sécurisé encore requis                                                                              |
| 13  | Auth                   | SKIP distant bloqué ; aucun zéro bypass distant revendiqué                                                                                                           |
| 14  | MFA                    | SKIP distant bloqué ; exigence privilégiée conservée                                                                                                                 |
| 15  | Sessions               | SKIP distant : refresh/replay/logout/révocation non exécutés                                                                                                         |
| 16  | RBAC                   | SKIP distant ; matrice des rôles non exécutée                                                                                                                        |
| 17  | Tenant isolation       | SKIP distant : A/B, IDOR et COUNT/SUM/AVG non exécutés                                                                                                               |
| 18  | People                 | SKIP distant : lectures/mutations non exécutées                                                                                                                      |
| 19  | Academic               | SKIP distant : lectures/mutations non exécutées                                                                                                                      |
| 20  | Enrollments            | SKIP distant : lectures/mutations non exécutées                                                                                                                      |
| 21  | Finance                | SKIP distant : lectures/mutations/agrégats non exécutés                                                                                                              |
| 22  | Results                | SKIP distant ; P2 local conservé, aucune assertion affaiblie                                                                                                         |
| 23  | Documents              | SKIP distant : génération PDF/QR non exécutée                                                                                                                        |
| 24  | Reports                | SKIP distant : génération non exécutée ; Chromium dans image worker à valider                                                                                        |
| 25  | Exports                | SKIP distant : CSV/XLSX/PDF non exécutés                                                                                                                             |
| 26  | Messaging              | SKIP distant ; aucun destinataire autorisé ni email réel                                                                                                             |
| 27  | Outbox / BullMQ        | Runtimes initialement démarrés ; réveil worker en échec, aucun job métier distant exécuté                                                                            |
| 28  | Worker                 | Documents/Messaging/Reports ready sur 818ad43 et readiness publique PASS ; diagnostic PostgreSQL down ponctuel, stabilité non certifiée                              |
| 29  | Storage private checks | **PASS réel** : HeadBucket, PutObject, GetObject checksum/MIME, DeleteObject vérifié, GET/LIST/PUT anonymes refusés, objet inchangé, route publique Supabase refusée |
| 30  | TLS                    | PostgreSQL externe verify-full PASS depuis API ; Redis TCP/TLS authentifié PASS dans les deux services ; S3 HTTPS PASS ; aucun TLS affaibli                          |
| 31  | Trust proxy            | API direct conservé ; topologie/XFF/XFP non certifiés                                                                                                                |
| 32  | CORS                   | Origine web exacte configurée Render ; tests HTTPS étrangers/null/suffix non exécutés                                                                                |
| 33  | CSRF                   | SKIP distant ; chaîne web/API et mutations non certifiées                                                                                                            |
| 34  | Cookies                | SKIP distant : Secure/HttpOnly/Strict/Path/expiration non observés                                                                                                   |
| 35  | CSP                    | Contrat LOT13 maintenu ; production sans unsafe-eval côté code, pas de preuve distante                                                                               |
| 36  | Headers                | Pas de certification HTTPS publique ; health worker no-store/nosniff testé localement                                                                                |
| 37  | Rate limiting          | SKIP distant ; aucun stress test                                                                                                                                     |
| 38  | Logs                   | Preuves migration PASS et trois runtimes ready ; dernier diagnostic 818ad43 : postgres down, Redis/Storage up ; readiness publique ensuite PASS                      |
| 39  | Backup / restore       | PLAN LIMITATION acceptée pour staging : pas de backup fournisseur PG Free ; aucun restore exécuté                                                                    |
| 40  | 49 smoke tests         | 0 exécuté à distance ; proxy local CONNECT 403 vers staging ; accès réseau demandé, aucun faux PASS                                                                  |
| 41  | E2E local              | Référence navigateur 0cbd8d9 : 114 PASS / 89 skips contractuels / 0 FAIL ; non relancée pour le seul CLI temporaire                                                  |
| 42  | Local certification    | PASS : sécurité 235, unités 531, IAM 358, Reports 13, Messaging intégré DB neuve ; CLI 19 ; audit/typecheck/lint/format/build/bundle/diff verts                      |
| 43  | Residual risks         | Veille/quotas/expiration Free acceptés pour staging ; réveil worker, bootstrap A/B et tests applicatifs distants bloquants                                           |
| 44  | Manual actions         | Accès réseau Cloud aux trois domaines staging demandé ; Brevo test recipient absent ; commandes normales API/worker restaurées                                       |
| 45  | GO / NO-GO             | **NO-GO LOT14** ; migrations et Vercel prêts, S3 privé PASS ; worker instable au réveil, parcours distants indispensables non exécutés                               |

## Diagnostic S3 réel, sans changer l'adaptateur

L'adaptateur `packages/infrastructure/src/storage/s3-storage-adapter.ts` est **inchangé**. Aucune incompatibilité n'est démontrée. Supabase documente le support de HeadBucket, PutObject, GetObject et DeleteObject ainsi que forcePathStyle ; ces opérations sont maintenant vérifiées réellement, avec refus anonymes et nettoyage.

`scripts/staging-storage-probe.mjs` utilise l'adaptateur existant et refuse toute cible autre que le projet/bucket staging exacts, tout mode non staging/production, toute absence de clés, toute région différente ou path-style désactivé. Il crée uniquement une petite probe PDF à tenant/document UUID aléatoires, contrôle le checksum/MIME, exige 401/403 pour GET/LIST/PUT S3 anonymes sur objet existant, refuse les redirects et les 404 comme preuve d'auth S3, vérifie que le PUT anonyme n'a pas changé les octets, contrôle aussi la route publique Supabase, supprime sa seule probe et confirme sa disparition par GET signé 404. Nettoyage de la probe en cas d'échec ; aucune suppression de contenu utilisateur.

Pour garder les clés exclusivement dans Render, `LOT14_STORAGE_PROBE=true` active temporairement ce diagnostic au build de l'API après compilation. La commande build existante reste utilisable. La valeur est transmise par Turbo et change son cache. Désactivé par défaut ; activé sur production/V2/configuration incomplète, le diagnostic refuse le build. Sorties uniquement `LOT14_STORAGE_PROBE`, phase et PASS/FAIL, éventuellement statut HTTP : aucun credential, URL secrète ou stack. Désactiver le flag après collecte des preuves.

**Publication réalisée** : les 15 fichiers vérifiés ont été committés et poussés après autorisation explicite du propriétaire, WIP `dcb707ff6abdd72bf23941e030369799eddc7924`. La consigne antérieure de ne pas publier a été levée pour ce WIP uniquement. Aucun merge ou tag GO. Les mises à jour documentaires après les tests réels restent non committées pour revue.

## Worker Web Service Free

`WORKER_HTTP_HEALTH_ENABLED=true`, `APP_ENV=staging`, `NODE_ENV=production` et le `PORT` Render activent l'écoute `0.0.0.0:$PORT`. Hors de ce mode le serveur est désactivé ou refuse la configuration. Le démarrage des trois workers et la vérification initiale des dépendances précèdent l'ouverture du port. `/health` et `/health/ready` renvoient 200 ou 503 avec état générique, vérification des dépendances mise en cache 5 s et mutualisée ; `/health/live` expose seulement la vie du processus. GET/HEAD uniquement ; autres méthodes 405 et routes 404. Aucun job, donnée métier, secret ou version via HTTP. Fermeture de la sonde avant arrêt Nest/queues lors du SIGTERM.

Image préparée `docker/worker/Dockerfile`, contexte racine, Node 24.20.0, pnpm 10.24.0 frozen, Chromium Playwright du lockfile et dépendances système. UID runtime non root, CMD exec, `.dockerignore` excluant secrets locaux et artifacts. CA de proxy de l'environnement de validation montée uniquement comme secret BuildKit ; TLS jamais désactivé, aucune CA de session copiée dans l'image. Validation locale réussie : PDF FR/AR hors ligne, utilisateur non root, limite mémoire 512 Mo / CPU 0,5 ; marqueur `WORKER_NONROOT_512MB_CHROMIUM_PDF_PASS`. Le premier essai a détecté des permissions de fichiers ; la copie en propriété node et les droits de lecture des navigateurs ont été corrigés, puis l'essai a réussi.

## Limites Free acceptées, exclusivement pour staging

- Supabase Free : 1 GB de stockage, plafond fichier 50 MB, pause possible après inactivité, aucune garantie production/HA. Les clés S3 serveur contournent les RLS et donnent accès aux buckets du projet : projet dédié obligatoire, aucun partage avec V2.
- Render API et worker Web Free : veille après 15 minutes sans trafic entrant, délai de réveil, redémarrages, filesystem éphémère, quota partagé de 750 heures/mois. L'arrivée d'un job Redis ne réveille pas à elle seule un Web Service endormi : réveiller manuellement le worker via HTTPS avant les tests et vérifier readiness. Aucun ping artificiel permanent ou service payant ajouté.
- PostgreSQL Render Free : 1 GB, expiration 30 jours après création, pas de backup fournisseur, pas de HA ; base actuelle expirant le 23 novembre 2026. Aucune donnée réelle.
- Upstash Free : TCP TLS, commandes BullMQ à valider, quotas à surveiller ; le polling consomme des commandes même sans job. Ne pas activer pay-as-you-go, upgrade ou carte pour contourner une limite. Aucun SLA, zéro perte ou disponibilité permanente n'est revendiqué.

Ces limites sont explicitement acceptées par le propriétaire pour LOT14 staging. Elles restent documentées comme risques ; elles n'autorisent pas un GO sans tests distants des fonctionnalités/sécurités indispensables.

## Validation locale et historique

Checkpoint précédent avant ce changement : 14 étapes code 0, sécurité 179, unités 499, IAM/métier 358, Reports 13, Messaging sur DB locale neuve (18 contrôles d'intégrité), E2E 114 PASS / 89 skips contractuels / 0 FAIL, audit sans alerte, bundle canari 57 artifacts sans source map navigateur, scan de signatures zéro détection. Ces résultats ne certifient ni le nouveau code ni Supabase/Upstash distants.

Validation ciblée actuelle : sonde 5 tests PASS ; worker 13 tests PASS dont activation strictement staging, 200/503, pas de fuite, méthode/route refusées et fermeture ; build worker PASS. Recertification complète et image à consigner après leur fin. Aucune assertion historique réduite.

## Git et interdictions préservées

HEAD et upstream de départ `c61652023d03b8637a91f8a278aecf7e2629945f`. Main certifié LOT13 `9db48741b1559d6444e247432fa5336e0ad9adaa`, tags LOT12/LOT13 préservés. Aucun `lot-14-go`, merge, production finale ou LOT15. V2 `gestschool.vercel.app`, projet `prj_lxb4cdk2pzSBK7jhGn6kaPzLhjtY` et Supabase `gestschool_v2BD` intacts.

Le rejet automatique antérieur de la règle d'ignorance de build Vercel est conservé au checkpoint historique ; cette règle reste non appliquée et aucun contournement n'est utilisé. Le projet Vercel reste à lier/configurer manuellement pour la seule Preview LOT14. Les profils Render/Vercel ont été enregistrés, l'automatisation navigateur payante reste exclue.

Sources : [S3 Supabase](https://supabase.com/docs/guides/storage/s3/authentication), [compatibilité](https://supabase.com/docs/guides/storage/s3/compatibility), [métadonnées Storage en lecture seule](https://supabase.com/docs/guides/storage/schema/design), [plafond fichiers](https://supabase.com/docs/guides/storage/uploads/file-limits), [Render Free](https://render.com/docs/free), [Upstash BullMQ](https://upstash.com/docs/redis/integrations/bullmq). Le changement Supabase retirant des suites TLS 1.2 CBC à partir du 10 novembre 2026 a été lu ; aucune désactivation TLS ni adaptation de l'adaptateur Node 24 n'est nécessaire sur cette seule annonce.

## Commandes exécutées dans cette reprise

| Commande                                                                                 | Résultat     |
| ---------------------------------------------------------------------------------------- | ------------ |
| `pnpm install --frozen-lockfile`                                                         | PASS, code 0 |
| `pnpm security:test`                                                                     | PASS, code 0 |
| `pnpm audit --prod`                                                                      | PASS, code 0 |
| `pnpm format:check`                                                                      | PASS, code 0 |
| `pnpm lint`                                                                              | PASS, code 0 |
| `pnpm typecheck`                                                                         | PASS, code 0 |
| `pnpm test`                                                                              | PASS, code 0 |
| `pnpm build`                                                                             | PASS, code 0 |
| `pnpm security:bundle`                                                                   | PASS, code 0 |
| `pnpm iam:test`                                                                          | PASS, code 0 |
| `pnpm reports:test`                                                                      | PASS, code 0 |
| `pnpm messaging:test sur DB locale neuve, après migrations deploy / seed TEST / db:test` | PASS, code 0 |
| `pnpm test:e2e`                                                                          | PASS, code 0 |
| `git diff --check`                                                                       | PASS, code 0 |

Image locale `gestschool-lot14-worker:local`, identifiant `sha256:7d0f49001f32524a338abb837f9de5e68adc874e55db8aa3c0c5135655f22cf5` : PDF FR/AR hors ligne, UID non root, 512 Mo / CPU 0,5 PASS ; configuration incomplète refusée PASS. Il ne s'agit pas d'un worker Render healthy. Scan arbre/historique : zéro signature de secret. Aucun changement de l'adaptateur S3 et aucune migration historique modifiée.

## Exécution distante S3 réellement observée

Déploiement API `dep-dbf6o684cbqc73dstdr0`, source `dcb707ff6abdd72bf23941e030369799eddc7924`. Les événements ci-dessous ont été lus directement via la connexion Render ; aucun PASS n'est déduit du seul statut Build successful ni d'une confirmation utilisateur. Le diagnostic a été exécuté temporairement avant Nest par `node scripts/staging-storage-probe.mjs && node apps/api/dist/main.js`, avec les clés uniquement dans Render. Aucun changement de code ni d'adaptateur pour ce repli depuis le build vers les logs applicatifs.

| Heure Europe/Paris, 25/10/2026 | Phase                                 | Résultat |
| ------------------------------ | ------------------------------------- | -------- |
| 21:55:31 CET                   | `HeadBucket`                          | PASS     |
| 21:55:32 CET                   | `PutObject`                           | PASS     |
| 21:55:32 CET                   | `GetObject_checksum_mime`             | PASS     |
| 21:55:32 CET                   | `anonymous_GET`                       | PASS     |
| 21:55:32 CET                   | `anonymous_LIST`                      | PASS     |
| 21:55:32 CET                   | `anonymous_PUT`                       | PASS     |
| 21:55:33 CET                   | `anonymous_PUT_did_not_change_object` | PASS     |
| 21:55:33 CET                   | `Supabase_public_GET_denied`          | PASS     |
| 21:55:33 CET                   | `DeleteObject_verified`               | PASS     |
| 21:55:33 CET                   | `overall`                             | PASS     |

Les trois refus S3 anonymes exigent HTTP 401/403 sur la probe existante. Le GET public Supabase est aussi refusé ; le PUT anonyme ne change pas son checksum. Après DeleteObject, GET signé 404 vérifié ; lecture Supabase finale : `public=false`, `object_count=0`. Le bucket n'a jamais été rendu public. L'adaptateur S3 existant est inchangé : aucune incompatibilité démontrée.

Le propriétaire a ensuite restauré la commande API normale `node apps/api/dist/main.js`, vérifiée par lecture des paramètres Render. LOT14_STORAGE_PROBE=false a été enregistré par fusion, sans lecture des secrets ; aucun diagnostic automatique ne reste demandé pour les builds usuels.

## Services Free créés, configuration applicative encore bloquée

Worker `gestschool-v3-worker-staging`, ID `srv-dbf6hbq9lscs738vvea0`, URL `https://gestschool-v3-worker-staging.onrender.com`, Docker / Free / Francfort, branche LOT14, auto-deploy désactivé ; sonde `/health/ready` effectivement enregistrée. Première tentative `dep-dbf6hca9lscs738vvggg` refusée pour DATABASE_URL, REDIS_URL et les clés S3 absentes. Après configuration signalée par le propriétaire, tentative `dep-dbf6pmm7bikc73cd1ueg` refusée par le garde-fou **Production PostgreSQL requires sslmode=verify-full**. Les clés ne sont pas lues ou copiées par l'agent. Le propriétaire a ensuite confirmé sslmode=verify-full dans les deux stores DATABASE_URL. La tentative fraîche `dep-dbf721r8vfls7393ar9g` (fin le 25 octobre 2026 à 22:15:33 Europe/Paris) est encore `update_failed` avec `WORKER_STARTUP_FAILED` ; le précédent message de paramètre TLS n'y apparaît plus. Aucune readiness atteinte et aucune connexion DB/Redis ou exécution BullMQ n'est déclarée PASS. Aucun TLS affaibli.

API : deux tentatives sur le WIP (`dep-dbf6gsl9fdbs7390f5jg`, `dep-dbf6gtrphbkc73a879u0`) avaient réussi leur build puis échoué au démarrage avec DATABASE_URL absente. Le diagnostic S3 réel ultérieur réussit indépendamment de ce démarrage. Après correction signalée, la tentative API `dep-dbf6vga9lscs7391hah0` reste `update_failed`. Les logs indiquent un `ZodError` dans `loadIamConfig`, objet attendu mais reçu null : configuration IAM manquante ou invalide, sans valeur de clé affichée. Un passage storage ne certifie pas DB, Redis, IAM, messaging ou readiness. Les précédents logs envoyés par le propriétaire décrivaient le worker et ne contenaient pas de phase S3 FAIL.

Les limites Free restent acceptées pour staging uniquement. NO-GO demeure pour configuration applicative, migrations/seed, auth/RBAC/isolation, worker end-to-end et 49 smoke distants manquants. Aucun paiement, carte, merge main, tag LOT14, production finale ou LOT15 ; V2 Vercel et Supabase intacts. Les quatre mises à jour documentaires après publication sont laissées non committées pour revue.

## Correction IAM staging et arrêt au nouveau blocage

Nouvelles clés dédiées staging générées exclusivement avec `generateKeyPairSync('ed25519')` et deux appels indépendants à `randomBytes(32)` pour MFA et CSRF. Formats PEM PKCS8/SPKI et trousseau MFA JSON sous l'identifiant `staging1`, validation par le chargeur IAM réel avant écriture. Les valeurs ont été transmises directement au store Render API sans fichier de secret, affichage ou ajout Git.

Les treize variables API ont été enregistrées par fusion : `APP_ENV`, `NODE_ENV`, `IAM_ENV`, `IAM_JWT_PRIVATE_KEY`, `IAM_JWT_PUBLIC_KEY`, `IAM_MFA_KEYS_JSON`, `IAM_MFA_KEY_ID`, `IAM_CSRF_KEY`, `IAM_ALLOWED_ORIGINS`, `IAM_REDIS_PREFIX`, `APP_PUBLIC_ORIGIN`, `DOCUMENT_PUBLIC_ORIGIN`, `TRUST_PROXY`. Environnements staging/production/staging, origine exacte du web staging, préfixe IAM staging et proxy direct ; aucun `IAM_KEYS_JSON` ni fallback local configuré.

Déploiement `dep-dbf7ghg473hc73c4lfl0`, même source WIP, lancé le 25 octobre 2026 à 22:44:38 et terminé à 22:46:57 Europe/Paris : `update_failed`. Lecture complète des 20 lignes applicatives disponibles depuis ce démarrage : plus de `ZodError` dans `loadIamConfig`, nouvelle erreur du chargeur messaging. Seule variable bloquante démontrée à ce stade : **`MESSAGING_TOKEN_KEY`**, absente ou invalide ; le garde-fou vérifie une clé décodée de 32 octets. La présence ou la validité des autres credentials messaging n'est pas déduite de ce premier échec.

**STOP demandé au nouveau blocage de configuration.** Aucune clé messaging créée, aucun faux credential ou passage en mode local. Les opérations distantes suivantes, y compris le diagnostic Redis temporaire, ne sont pas exécutées durant cette reprise. Le timeout Redis/Upstash est signalé par le propriétaire ; aucune étape DNS, TCP, TLS, AUTH ou PING n'est revendiquée PASS. Ni les URL secrètes ni leurs composants d'authentification n'ont été lus. Client Redis, BullMQ, architecture queue et exigences TLS inchangés. Pas de nouveau déploiement worker ou web après cet arrêt.

## Reprise Brevo email seul — configuration et contrôle de production

Une nouvelle clé messaging a été produite exclusivement par `randomBytes(32).toString('base64')`, puis écrite par fusion directement dans les deux services Render, sans fichier de secret ni valeur affichée. Les tirages sont indépendants des clés IAM précédemment générées ; le contrôle runtime d'indépendance reste conservé. L'expéditeur Brevo actif existant a été sélectionné via le compte connecté et configuré dans les deux stores, sans envoi de message. Aucun webhook secret ou API credential fictif créé.

Le chargeur garde Brevo, API key, webhook secret, email sender et token key obligatoires. Seul APP_ENV=staging dispense du sender WhatsApp et des templates FR/EN/AR, absents, vides ou objet JSON vide. Le provider accepte cette configuration staging, avec destinataire de test null ou autorisé, et refuse toujours WhatsApp avant fetch par STAGING_CHANNEL_NOT_AUTHORIZED. Les refus email hors allowlist et sans destinataire restent identiques. Les tests conservent le cas initial WhatsApp configuré et ajoutent le cas sans WhatsApp. Production garde sender valide et chacun des templates FR/EN/AR obligatoires, clé token canonique 32 octets et indépendante des clés CSRF/MFA.

Les mutations de variables ont provoqué deux déploiements sur l'ancien WIP : API `dep-dbf7nnt9fdbs7394j7ug` et worker `dep-dbf7npfb9u1s73bu4eqg`, tous deux update_failed. L'API franchit IAM et le contrôle de longueur token ; la validation de BREVO_API_KEY reçoit null à la ligne 45 du JS correspondant au SHA déployé. Le propriétaire a ensuite confirmé la clé API OK et annoncé qu'il ajoutera BREVO_WEBHOOK_SECRET plus tard. Cette confirmation n'est pas une preuve de démarrage. La validation groupée du correctif nomme les champs Brevo invalides sans afficher leur contenu, afin de distinguer les prochains contrôles manquants. Le worker échoue toujours sur ConnectionTimeoutError Redis TLS, avant son runtime messaging. Aucun PASS DNS/TCP/TLS/AUTH/PING ou readiness n'est déduit.

## Recertification du correctif email seul

Toutes les commandes demandées sont PASS : `pnpm security:test`, `pnpm messaging:test` (après migrations/seed sur une base locale neuve isolée), `pnpm iam:test`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `git diff --check`. Également install frozen, audit, bundle canari et Reports PASS. Après ajout du cas provider conservant WhatsApp configuré, les suites sécurité et unités, typage, lint et format ont été revérifiées.

Résultats finaux : sécurité **212 PASS**, unités **527 PASS**, IAM **358 PASS**, Reports **13 PASS**, configuration messaging **26 PASS**, provider **6 PASS**. Les deux dernières suites sont incluses dans les totaux précédents. Messaging intégré : outbox/BullMQ/worker, replay concurrent, absence de fuite des tokens IAM, refus inter-tenant, notification arabe et retry/backoff PASS, uniquement avec le provider local de test. E2E navigateur locaux : **114 PASS / 89 skips contractuels / 0 FAIL**, 203 cas, 12 min 3 s pour la commande. Aucun skip nouveau ou assertion historique retirée. Ces preuves locales ne certifient pas le staging distant ; les 49 smoke staging restent 0 exécuté.

### Nouveau contrôle distant après la configuration du propriétaire

Deux déploiements de variables supplémentaires ont été observés sur l'ancien WIP : API `dep-dbf8147avr4c73d5ar6g` (créé 2026-10-25T22:20:00Z, update_failed à 22:22:28Z) et worker `dep-dbf815vavr4c73d5avk0` (update_failed, WORKER_STARTUP_FAILED générique). Dans l'API, plus de refus des champs API key ou webhook : l'échec est à la ligne 50 de l'ancien JS, validation du sender WhatsApp null. Cela établit la présence et la longueur minimale des deux secrets, sans encore certifier tous les contrôles de force placés plus loin dans l'ancien code. Le propriétaire n'a transmis aucune valeur.

Sur cette preuve, déploiement API du correctif déclenché : `dep-dbf82kavcj2c73f5s8fg`, SHA `0cbd8d96f55fa6f6d0b8e8622b76a216374e6f31`, créé à 2026-10-25T22:23:13Z. Le déploiement est devenu live à 22:25:57Z. Les logs récents contiennent Nest application successfully started, sans erreur messaging ; la route /health/live renvoie status ok. Deux lectures publiques /health/ready retournent HTTP 503. Le connecteur HTTP ne restitue pas le corps des réponses non-2xx ; états individuels des dépendances demandés au propriétaire, aucun PASS déduit. Aucun nouveau déploiement worker demandé avant résolution Redis.

### Diagnostic Redis préparé, exécution distante manuelle nécessaire

Le connecteur Render ne fournit ni exécution shell ni modification des commandes existantes. L'automatisation navigateur payante reste exclue. Après passage messaging API, deux commandes publiques temporaires ont été préparées hors Git pour API Start Command et worker Docker Command. Elles lisent REDIS_URL uniquement dans Render et contrôlent staging, rediss, endpoint Upstash, port 6379, présence des credentials et absence de paramètres PostgreSQL. Sorties limitées à protocole, empreinte tronquée du hostname et port, puis REDIS_DNS/TCP/TLS/AUTH/PING PASS ou l'étape FAIL. Aucun credential ni réponse Redis affiché ; certificat et hostname TLS vérifiés, SNI explicite, minimum TLS 1.2, timeout 3 s par étape. Refus de configuration : code 64 sans valeur affichée. Aucune modification du client applicatif ou de BullMQ.

Syntaxe Node/shell et huit refus locaux de configuration sans sortie sensible PASS. **Aucune phase réseau distante exécutée ou déclarée PASS**. Le propriétaire est invité à appliquer temporairement ces commandes, laisser les marqueurs apparaître, puis restaurer immédiatement la commande API normale et le CMD Docker par défaut. Les logs seront relus via Render ; aucun secret ne doit être transmis. Un JSON public de /health/ready est également demandé pour distinguer postgres/redis/storage sans spéculation. Les commandes ne sont pas configurées automatiquement et n'affectent pas le commit WIP.

## Recertification du diagnostic CLI publié

Les neuf vérifications demandées sont de nouveau PASS : security:test, messaging:test sur une nouvelle base locale isolée, iam:test, test, typecheck, lint, format:check, build et git diff --check. Install frozen, audit, bundle canari et Reports également PASS. La dernière sécurité inclut **220 tests PASS**, dont **8 tests CLI** (refus de configurations invalides et production, timeout DNS, ordre/arrêt des phases, fermeture des sockets, absence de fuite, comparaison sûre des hôtes et lecture des trois états publics). Unités **527**, IAM **358**, Reports **13**, messaging intégré local PASS. Après ajout des deux contrôles de readiness et du timeout DNS, sécurité, lint et format ont été revérifiés.

L'application web/API/worker n'a pas changé depuis le correctif fonctionnel 0cbd8d9. Les E2E navigateur de référence restent **114 PASS / 89 skips contractuels / 0 FAIL** sur ce SHA ; ils n'ont pas été relancés pour le seul CLI temporaire. Les E2E pertinents du CLI ont été exécutés. Aucune phase réseau Redis distante n'est certifiée par ces tests locaux. Aucun test historique réduit.

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
