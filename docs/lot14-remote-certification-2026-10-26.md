# LOT14 — exécution distante du 26 octobre 2026

**49 PASS / 0 FAIL / 0 SKIP**, mais **NO-GO LOT14** : readiness worker intermittente. Heures ci-dessous en Europe/Paris (CET, UTC+1).

## Reprise Git

`pwd` initial : `/workspace`, qui n'est pas un dépôt Git. Dépôt retrouvé dans `/workspace/GestSchool_V3`, initialement propre sur `work`, HEAD `9db4874`. `git fetch` réussi ; refspec initial limité à main. Fetch explicite de `refs/heads/feat/lot14-staging-certification`, puis branche locale chargée sans suivi automatique : arbre propre, HEAD exactement `2c82cc1461212a20b8b96c44d6ca835e6ce0d612`. Ancêtre attendu vérifié.

Huit derniers commits : `2c82cc1`, `818ad43`, `b5a791f`, `b4fa1d6`, `4f561bc`, `0cbd8d9`, `dcb707f`, `c616520`.

## Réseau et prérequis

La configuration active révision 6 contient les trois domaines. Le statut réseau du provider reste `unknown` ; les accès ci-dessous sont des observations réelles, indépendantes de cet état déclaratif. Proxy hérité conservé, aucune connexion directe ni désactivation TLS.

| Cible                                                    | DNS local                      | HTTPS                                 | HTTP observé                                 | CONNECT 403 |
| -------------------------------------------------------- | ------------------------------ | ------------------------------------- | -------------------------------------------- | ----------- |
| `gestschool-v3-staging.vercel.app/`                      | Échec temporaire de résolution | PASS, TLS vérifié, tunnel CONNECT 200 | 307 ; `/fr/login` 200                        | Non         |
| `gestschool-v3-api-staging.onrender.com/health/ready`    | Échec temporaire de résolution | PASS, TLS vérifié, tunnel CONNECT 200 | 200, postgres/redis/storage up               | Non         |
| `gestschool-v3-worker-staging.onrender.com/health/ready` | Échec temporaire de résolution | PASS, TLS vérifié, tunnel CONNECT 200 | 200 après réveil ; 503 intermittents ensuite | Non         |

`socket.getaddrinfo` retourne EAI_AGAIN et `getent ahosts` code 2. La résolution distante via le proxy fonctionne, comme l'attestent les tunnels et réponses HTTPS ; aucune adresse DNS de destination n'est directement observée. Les premières lectures API et worker ont dépassé 50 secondes sans réponse HTTP, malgré TLS établi ; les lectures suivantes sont 200. Ce comportement est compatible avec un réveil mais ne prouve pas sa cause.

## Playwright distant

Suite historique inchangée : 42 cas navigateur (FR/EN/AR, clair/sombre, sept viewports) et sept cas API (live/ready, request IDs, CORS exact). Cibles exclusivement V3 staging.

Exécution finale : **18:56:44,989 à 18:57:48,876**, durée **63,887 s**, code processus 0, **49 PASS / 0 FAIL / 0 SKIP / 0 flaky**. Un worker, zéro retry, TLS strict, aucune capture/trace/vidéo ni secret dans les rapports.

Configuration temporaire ignorée `.local/lot14-remote.config.ts` : importe `apps/web/playwright.staging.config.ts`, conserve ses assertions et paramètres, fournit explicitement le proxy HTTPS hérité au navigateur et au contexte request, redirige les artefacts vers `.local`. Node 24.20.0 et Playwright 1.62.1 déjà installés utilisés directement ; le pnpm global 11.25.0 est incompatible avec le dépôt, aucune réinstallation nécessaire.

Deux lancements préliminaires sont conservés séparément : **5 PASS / 44 FAIL / 0 SKIP**, puis **7 PASS / 42 FAIL / 0 SKIP**. Les 42 échecs navigateur de chacun sont `ERR_CERT_AUTHORITY_INVALID` avant assertions applicatives, dus au contexte sandbox empêchant l'accès normal au magasin NSS. Les deux autres échecs du premier lancement sont des HTTP 503 dans le contrôle API live/ready, sans corps capturé ; leur dépendance en cause n'est pas établie. La CA publique de session était déjà présente dans NSS sous `OpenAI-nebula-dns` (empreinte vérifiée). Une sonde puis la suite exécutées avec accès normal au magasin utilisateur passent sans ignorer les certificats. Aucun changement applicatif, assertion affaiblie ou faux PASS.

Rapport brut final local : `.local/.local/lot14-remote-results.json` ; log `.local/lot14-remote-run.log`. Résumé horodaté et 36 observations HTTP sans secrets dans [les preuves JSON](lot14-remote-evidence-2026-10-26.json). Les échecs préliminaires restent dans les rapports `lot14-remote-initial-*` et `lot14-remote-sandbox-*` sous `.local`.

## Worker et PostgreSQL : diagnostic distinct

**Complément opérateur reçu après cette première exécution : les logs Render fournis dans la demande suivante confirment `postgres=down, redis=up, storage=up` aux deux instants des 503. Le sous-type d'erreur PostgreSQL reste inconnu. Voir la [reprise diagnostique](lot14-postgres-readiness.md). Les limites d'attribution ci-dessous décrivent les informations disponibles lors de la première exécution.**

Premier échantillonnage, 18:53:09–18:55:19 environ : huit readiness API 200 (trois dépendances up), huit liveness worker 200 et huit readiness worker 200. Échantillonnage pendant/juste après la suite : six readiness API 200 ; worker quatre 200 et **deux 503** :

- **18:57:10** : `{"status":"unavailable"}`, 0,305 s ; API trois dépendances up.
- **18:57:21** : worker revenu à 200.
- **18:57:56** : `{"status":"unavailable"}`, 2,615 s ; dernière API 200 à 18:57:54.

Le défaut PostgreSQL historique du worker (`postgres=down, redis=up, storage=up`, 02:01:27 CET) reste distinct du timeout Redis historique et de ces nouvelles réponses génériques. Le worker public ne révèle pas ses dépendances. Aucun outil de logs Render ni identité Render n'est disponible dans cette session ; aucune attribution PostgreSQL de ces deux nouveaux 503 n'est donc possible.

Lecture du code : `PostgresHealth` ouvre une nouvelle connexion à chaque contrôle, `SELECT 1`, timeout connexion et requête de 2 000 ms ; les erreurs sont réduites à up/down. Le worker vérifie les trois dépendances en parallèle et cache le résultat cinq secondes. Le retour rapide du premier 503 peut provenir du cache ; la durée du second ne permet pas d'identifier une dépendance. Latence de connexion PostgreSQL/TLS est une hypothèse à mesurer, pas une cause démontrée. Aucun timeout, TLS, client ou health modifié.

Diagnostic restant : corréler les logs sûrs `Worker dependencies unavailable (...)` aux deux instants UTC **17:57:10Z et 17:57:56Z**, puis, seulement si PostgreSQL est confirmé down, mesurer côté worker les phases connexion/TLS/SELECT, codes d'erreur assainis et événements/connexions de la base. Ne jamais extraire DATABASE_URL ou afficher erreurs/configurations brutes. Les migrations déjà certifiées ne sont pas à relancer.

## Suite conditionnelle et périmètre

Tenant A/B et worker E2E **NOT RUN** : la condition de santé continue demandée n'est pas satisfaite. Le propriétaire confirme pendant cette reprise : **aucun bootstrap disponible**. Aucun accès de test staging n'est fourni par les bindings de cette session. Le seed existant refuse staging (`DEV_SEED_FORBIDDEN`) et n'a pas été lancé. Aucun email réel envoyé.

Vercel, migrations, Storage, Redis et validation locale déjà certifiés n'ont pas été refaits. Aucun merge, push, publication, tag `lot-14-go`, modification V2 ou travail LOT15. Seules les présentes preuves documentaires sont ajoutées pour revue.
