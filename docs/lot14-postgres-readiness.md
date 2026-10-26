# LOT14 — diagnostic PostgreSQL readiness

## État et décision

Reprise sur `feat/lot14-staging-certification`, base `2c82cc1461212a20b8b96c44d6ca835e6ce0d612`. Les **49 smoke distants PASS / 0 FAIL / 0 SKIP** restent acquis. **NO-GO LOT14** : aucune stabilité worker après ce nouveau code n'est encore certifiée.

Le propriétaire fournit dans cette reprise les corrélations Render pour le 26 octobre 2026 à **18:57:10 et 18:57:56 Europe/Paris** (17:57:10Z et 17:57:56Z) :

```text
Worker dependencies unavailable (postgres=down, redis=up, storage=up)
```

D'autres occurrences PostgreSQL down sont signalées autour de 18:55–18:59. Les métriques communiquées indiquent CPU faible, mémoire sous la limite et trois à quatre connexions actives, sans preuve de saturation. Ce sont des **preuves opérateur fournies dans la demande**, et non des lectures Render effectuées par cet agent. Elles précisent la dépendance responsable, mais ne prouvent ni timeout, ni erreur TLS, auth ou requête. L'ancien incident Redis au réveil reste distinct.

**Décision : instrumenter d'abord ; conserver les deux timeouts de 2 000 ms et une tentative par check.** La condition demandée pour relever le timeout et introduire des retries — preuves de timeouts transitoires uniquement — n'est pas établie. Un plan Free ou une faible consommation CPU ne prouve pas une latence réseau. Aucun faux `up`, timeout augmenté à l'aveugle, fallback liveness ou affaiblissement TLS.

## Changement

`packages/infrastructure/src/database/postgres-health.ts` émet uniquement un objet JSON sur stderr, avec deux champs : catégorie fixe et durée totale écoulée monotone, en millisecondes, avant nettoyage. Exemple de forme, **pas un incident staging observé** :

```json
{ "event": "POSTGRES_HEALTH_CONNECT_TIMEOUT", "durationMs": 2001 }
```

Catégories : `POSTGRES_HEALTH_CONNECT_TIMEOUT`, `POSTGRES_HEALTH_QUERY_TIMEOUT`, `POSTGRES_HEALTH_TLS_ERROR`, `POSTGRES_HEALTH_CONNECTION_ERROR`, `POSTGRES_HEALTH_QUERY_ERROR`.

Les codes techniques du driver sont utilisés seulement en mémoire et réduits à ces constantes. Les messages sans code `timeout expired`, `Query read timeout` et deux messages SSL du driver pg épinglé sont comparés exactement, jamais sérialisés. Une annulation serveur SQLSTATE 57014 ne suffit pas à prouver un timeout et reste QUERY_ERROR. Une erreur d'authentification reste CONNECTION_ERROR, conformément aux catégories autorisées.

Les événements asynchrones `pg.Client.error` sont également capturés pour éviter une erreur EventEmitter brute non gérée ; leur catégorie est préservée si la promesse de requête retourne ensuite un message générique. Les erreurs propagées ne contiennent que la constante, sans cause brute. Un échec d'écriture du diagnostic ne remplace pas cette erreur sûre. Le client créé est toujours fermé dans `finally`, les erreurs de nettoyage ne sont pas journalisées.

Seul le succès réel de `connect()` puis `SELECT 1` fait réussir le check. Tout échec conserve PostgreSQL down et donc la readiness 503. Aucun changement à `/health/live`, au cache de readiness de cinq secondes, aux dépendances critiques, au SQL de contrôle ou aux connexions TLS. L'infrastructure étant partagée, le diagnostic vaut également pour l'API si ce code y est déployé.

## Vérification locale

Tests déterministes pg mocké, fake timers et horloge monotone : succès initial, timeout connexion/requête, récupération lors d'un **check ultérieur** après timeout, deux checks en défaut consécutifs, TLS/auth/requête persistants, fermeture du client, erreurs asynchrones, échec du logger, erreur du constructeur et absence des canaris sensibles dans les logs/erreurs. Assertions de readiness réelles via `checkInfrastructure`, sans réduire les assertions existantes. Le nouveau fichier est aussi inclus dans `security:test`.

Les scénarios « timeout puis PASS » et « deux timeouts » concernent ici **deux checks indépendants** : ils ne certifient pas une politique de retry intra-check, qui n'est pas introduite. Le test temporel vérifie une connexion de 1 900 ms suivie du timeout requête de 2 000 ms, sa durée de 3 900 ms et les budgets driver inchangés ; il n'affirme pas un nouveau délai total incluant le nettoyage. Les tests de budget/backoff pour une éventuelle stratégie à deux tentatives restent à ajouter uniquement si les observations la justifient.

Recertification finale du code incluant les événements asynchrones :

| Contrôle                                                                             | Résultat                                             |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| PostgreSQL et infrastructure health ciblés                                           | 35 PASS (33 nouveaux + 2 existants)                  |
| Infrastructure complète                                                              | 76 PASS                                              |
| Worker                                                                               | 17 PASS                                              |
| `pnpm security:test`                                                                 | 268 PASS                                             |
| `pnpm test`                                                                          | 564 PASS ; 13 tâches réussies, aucun cache réutilisé |
| `pnpm typecheck`                                                                     | PASS                                                 |
| `pnpm lint`                                                                          | PASS                                                 |
| `pnpm format:check`                                                                  | PASS                                                 |
| Build backend puis `NODE_ENV=production pnpm build --env-mode=loose --concurrency=2` | PASS ; build global 9 tâches réussies sans cache     |
| `git diff --check`                                                                   | PASS                                                 |

Les sous-suites sont incluses dans les totaux sécurité/unités et ne doivent pas être additionnées. Les sorties détaillées et les codes de chaque commande sont conservés localement dans `.local/lot14-postgres-*.log` et `.local/lot14-postgres-results.tsv`. Le warning Turbo sur les outputs du package UI est préexistant et n'est pas un échec de build. Les 49 Playwright déjà certifiés n'ont pas été relancés pour ce diagnostic backend.

Les services Docker et la base employés sont exclusivement locaux ; aucun seed ou migration staging exécuté, aucun accès dev-access. La migration locale n'avait aucune étape en attente.

## Déploiement et stabilité : blocage d'accès

La session n'expose aucun outil de déploiement/logs Render et le statut Cloud ne fournit aucune identité ou secret Render. L'accès HTTPS public ne permet pas de modifier un service ni de lire ses logs. Aucun credential n'a été recherché dans les fichiers de secrets, extrait d'un provider ou demandé dans le chat. Cette limite de capacité ne constitue ni un refus d'approbation automatique ni une preuve de panne Render.

Après validation et push du diagnostic sur la branche autorisée, l'étape nécessaire est de déployer ce commit sur **le worker staging existant** `srv-dbf6hbq9lscs738vvea0`, avec Docker Command vide (CMD normal de l'image), health `/health/ready`, sans modifier les variables, la base, les secrets ou le TLS. Aucun déploiement n'est revendiqué dans cette session.

Après réveil complet, corréler les événements JSON sûrs avec les états fixes postgres/redis/storage dans les logs Render. **Si, et seulement si, les incidents sont exclusivement des timeouts transitoires**, évaluer ensuite une stratégie de deux tentatives maximum, 3–5 secondes maximum par tentative, backoff 100–250 ms et budget global explicite incluant connexion, requête et nettoyage. Ne pas retenter les erreurs TLS/auth/requête persistantes pour les masquer.

La fenêtre de stabilité du correctif de latence éventuel doit ensuite durer 10–15 minutes avec un intervalle raisonnable, par exemple 30 secondes, sans keepalive permanent. Compter checks, 200/503, états de chaque dépendance **à partir des logs**, latences min/médiane/max et réveil séparé. Une réponse worker générique ne permet pas d'inventer les trois compteurs de dépendances. Un nouveau postgres down impose STOP/NO-GO.

**Fenêtre après ce diagnostic : NOT RUN ; total 0 checks, 0 HTTP 200 observé, 0 HTTP 503 observé ; compteurs postgres/redis/storage et latences non mesurés. Ces zéros ne constituent pas un PASS.** Les seules mesures distantes existantes sont celles du rapport précédent : worker readiness 12 HTTP 200 / 2 HTTP 503 sur 14 échantillons, et API 14 HTTP 200. Le propriétaire attribue désormais les deux 503 worker à PostgreSQL.

Tenant A/B, bootstrap staging sécurisé et worker E2E restent bloqués par la condition de stabilité. Le propriétaire a confirmé qu'aucun bootstrap n'est disponible. Aucun seed DEV staging, dev-access, mot de passe/TOTP dans les artefacts, merge, tag `lot-14-go`, changement V2 ou travail LOT15.
