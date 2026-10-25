# LOT14 — Supabase Storage et stratégie staging entièrement gratuite

État de revue du 25 octobre 2026 (Europe/Paris) : **NO-GO**, préparation terminée et recertification locale complète réussie ; tests S3 distants encore à exécuter. Décision explicite du propriétaire : **zéro paiement, zéro carte avant validation client**. Cloudflare R2 est abandonné. Supabase Storage Free remplace le fournisseur de stockage encore indéterminé du checkpoint précédent. Le worker est désormais autorisé comme Web Service Render Free avec `/health` ; les anciennes exigences d'un Background Worker payant sont remplacées pour ce staging.

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

| Nº  | Point                  | État / preuve / limite                                                                                                                                                              |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | HEAD / branche         | `c61652023d03b8637a91f8a278aecf7e2629945f`, `feat/lot14-staging-certification` ; modifications non committées pour revue                                                            |
| 2   | Vercel team / projet   | `PROTEL's projects`, `team_bDjUZ3B4w8Iih7vBbRayKIGI`, projet `prj_3UdsP3bidz7SrLfkogJC7VqPrxU8` / `gestschool-v3-staging`                                                           |
| 3   | Web staging            | `https://gestschool-v3-staging.vercel.app`, domaine réservé/vérifié ; aucun déploiement healthy certifié                                                                            |
| 4   | Render workspace       | `GESTSCHOOL-V3`, `tea-d50tlb24d50c73cbo9m0`, Francfort                                                                                                                              |
| 5   | API staging            | `srv-dbei87lg1s2s73fmb7h0`, Free, `https://gestschool-v3-api-staging.onrender.com` ; dernier déploiement connu non healthy                                                          |
| 6   | Worker service         | Cible `gestschool-v3-worker-staging`, **Web Service Free + /health désormais autorisé** ; code et image préparés, service non créé                                                  |
| 7   | PostgreSQL             | `dpg-dbei7tqvcj2c73d1qukg-a`, PG 18 / Free, disponible selon Render ; expiration `2026-11-23T21:32:39Z`                                                                             |
| 8   | Redis                  | Upstash Redis Free dédié ; URL TCP TLS signalée enregistrée dans Render par le propriétaire ; connexion/BullMQ non certifiés, aucune valeur lue                                     |
| 9   | Storage                | Supabase Free `gestschool-v3-staging` / `rwmuksaafbnphurxaofq`, **eu-west-1** (projet existant réutilisé), bucket privé confirmé                                                    |
| 10  | Brevo                  | Compte PROTEL connecté ; destinataire contrôlé absent, aucun vrai envoi ; credentials runtime à compléter                                                                           |
| 11  | Migrations             | NOT RUN à distance ; deploy uniquement, aucun reset, aucune migration historique modifiée                                                                                           |
| 12  | Seed Tenant A/B        | NOT RUN à distance ; protection DEV maintenue, bootstrap staging sécurisé encore requis                                                                                             |
| 13  | Auth                   | SKIP distant bloqué ; aucun zéro bypass distant revendiqué                                                                                                                          |
| 14  | MFA                    | SKIP distant bloqué ; exigence privilégiée conservée                                                                                                                                |
| 15  | Sessions               | SKIP distant : refresh/replay/logout/révocation non exécutés                                                                                                                        |
| 16  | RBAC                   | SKIP distant ; matrice des rôles non exécutée                                                                                                                                       |
| 17  | Tenant isolation       | SKIP distant : A/B, IDOR et COUNT/SUM/AVG non exécutés                                                                                                                              |
| 18  | People                 | SKIP distant : lectures/mutations non exécutées                                                                                                                                     |
| 19  | Academic               | SKIP distant : lectures/mutations non exécutées                                                                                                                                     |
| 20  | Enrollments            | SKIP distant : lectures/mutations non exécutées                                                                                                                                     |
| 21  | Finance                | SKIP distant : lectures/mutations/agrégats non exécutés                                                                                                                             |
| 22  | Results                | SKIP distant ; P2 local conservé, aucune assertion affaiblie                                                                                                                        |
| 23  | Documents              | SKIP distant : génération PDF/QR non exécutée                                                                                                                                       |
| 24  | Reports                | SKIP distant : génération non exécutée ; Chromium dans image worker à valider                                                                                                       |
| 25  | Exports                | SKIP distant : CSV/XLSX/PDF non exécutés                                                                                                                                            |
| 26  | Messaging              | SKIP distant ; aucun destinataire autorisé ni email réel                                                                                                                            |
| 27  | Outbox / BullMQ        | Upstash TCP TLS prévu ; polling/quotas/reprise à vérifier, aucun job distant exécuté                                                                                                |
| 28  | Worker                 | Port health activable uniquement staging en NODE_ENV production ; readiness après démarrage des trois workers, fermeture avant application.close ; pas encore déployé               |
| 29  | Storage private checks | Bucket public=false observé ; HeadBucket/PutObject/GetObject/DeleteObject et refus anonymes **NOT RUN sur Supabase** avant publication du diagnostic                                |
| 30  | TLS                    | S3 HTTPS configuré ; Redis rediss signalé, DB verify-full requis ; pas de contournement TLS                                                                                         |
| 31  | Trust proxy            | API direct conservé ; topologie/XFF/XFP non certifiés                                                                                                                               |
| 32  | CORS                   | Origine web exacte configurée Render ; tests HTTPS étrangers/null/suffix non exécutés                                                                                               |
| 33  | CSRF                   | SKIP distant ; chaîne web/API et mutations non certifiées                                                                                                                           |
| 34  | Cookies                | SKIP distant : Secure/HttpOnly/Strict/Path/expiration non observés                                                                                                                  |
| 35  | CSP                    | Contrat LOT13 maintenu ; production sans unsafe-eval côté code, pas de preuve distante                                                                                              |
| 36  | Headers                | Pas de certification HTTPS publique ; health worker no-store/nosniff testé localement                                                                                               |
| 37  | Rate limiting          | SKIP distant ; aucun stress test                                                                                                                                                    |
| 38  | Logs                   | Nouveau diagnostic n’émet que phases/statuts sûrs ; aucun secret lu ou affiché ; nouvelles lignes Render à inspecter après exécution                                                |
| 39  | Backup / restore       | PLAN LIMITATION acceptée pour staging : pas de backup fournisseur PG Free ; aucun restore exécuté                                                                                   |
| 40  | 49 smoke tests         | 0 exécuté à distance, 49 scénarios bloqués avant lancement ; aucun faux PASS                                                                                                        |
| 41  | E2E local              | PASS de cette reprise : 114 réussis / 89 skips contractuels / 0 échec, 203 cas, 11 min 20 s                                                                                         |
| 42  | Local certification    | PASS : 14 étapes code 0, sécurité 187, unités 502, IAM 358, Reports 13, Messaging frais et E2E ; image vérifiée                                                                     |
| 43  | Residual risks         | Veille/quotas/expiration Free acceptés pour staging ; prérequis applicatifs, publication, tests distants et seed restent bloquants                                                  |
| 44  | Manual actions         | Bucket privé et clés S3 / Redis signalés configurés dans Render ; partage sûr des mêmes secrets avec worker après création, autres secrets/migrations et liaison Vercel à compléter |
| 45  | GO / NO-GO             | **NO-GO LOT14** : critères distants non exécutés ; les limites gratuites acceptées ne constituent plus à elles seules un motif de refus                                             |

## Diagnostic S3 réel, sans changer l'adaptateur

L'adaptateur `packages/infrastructure/src/storage/s3-storage-adapter.ts` est **inchangé**. Aucune incompatibilité n'est démontrée. Supabase documente le support de HeadBucket, PutObject, GetObject et DeleteObject ainsi que forcePathStyle ; les opérations réelles restent à exécuter.

`scripts/staging-storage-probe.mjs` utilise l'adaptateur existant et refuse toute cible autre que le projet/bucket staging exacts, tout mode non staging/production, toute absence de clés, toute région différente ou path-style désactivé. Il crée uniquement une petite probe PDF à tenant/document UUID aléatoires, contrôle le checksum/MIME, exige 401/403 pour GET/LIST/PUT S3 anonymes sur objet existant, refuse les redirects et les 404 comme preuve d'auth S3, vérifie que le PUT anonyme n'a pas changé les octets, contrôle aussi la route publique Supabase, supprime sa seule probe et confirme sa disparition par GET signé 404. Nettoyage de la probe en cas d'échec ; aucune suppression de contenu utilisateur.

Pour garder les clés exclusivement dans Render, `LOT14_STORAGE_PROBE=true` active temporairement ce diagnostic au build de l'API après compilation. La commande build existante reste utilisable. La valeur est transmise par Turbo et change son cache. Désactivé par défaut ; activé sur production/V2/configuration incomplète, le diagnostic refuse le build. Sorties uniquement `LOT14_STORAGE_PROBE`, phase et PASS/FAIL, éventuellement statut HTTP : aucun credential, URL secrète ou stack. Désactiver le flag après collecte des preuves.

**Publication requise** : le hook et les fichiers ne sont pas encore dans la branche distante. L'instruction antérieure de laisser les modifications non committées pour revue reste applicable. Aucun nouveau commit/push n'est réalisé sans décision explicite ; aucun résultat Supabase n'est revendiqué sur la base des cinq tests simulés locaux.

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

Quinze fichiers de cette préparation restent non committés pour revue : scripts de sonde/hook/tests, build API, health worker/tests/main, image/Dockerignore, transmission Turbo, suite sécurité et quatre documents. Leur publication sur la seule branche LOT14 est nécessaire pour que Render exécute le code avec ses secrets. Aucun commit/push n'est effectué avant autorisation explicite levant la consigne antérieure « laisse les modifications non commitées pour revue finale ». Aucun merge ou tag GO n'est envisagé.
