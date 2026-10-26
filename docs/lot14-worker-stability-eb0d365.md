# LOT14 — fenêtre distante après retry PostgreSQL

Verdict courant : **GO STAGING FONCTIONNEL**, en attente de merge final. Le second run Render sur `39f5cc2` a confirmé 14/14 Tenant A/B, report worker completed et certification PASS ; les flags sont revenus OFF. Voir [la certification finale](lot14-certification.md). Le contenu ci-dessous décrit le checkpoint historique de ce document ; les anciens NO-GO/SKIP/NOT RUN ne sont pas le verdict courant.

## Historique du checkpoint

**Stabilité distante worker : PASS sur la fenêtre mesurée, corrélation Render confirmée par le propriétaire. Verdict global LOT14 : NO-GO tant que les parcours applicatifs restent incomplets.**

Branche vérifiée : `feat/lot14-staging-certification`, HEAD `eb0d3654551f39ba3b6d7a01b71bd003c693e7a9`, arbre initialement propre. Le déploiement worker de ce SHA est confirmé par le propriétaire ; le endpoint public ne révèle pas le SHA. Aucun timeout, retry, cache ou health applicatif modifié pendant cette tâche.

## Mesure réelle

Le **26 octobre 2026, de 20:35:57 à 20:45:58 Europe/Paris** (19:35:57–19:45:58Z), sondes démarrées toutes les 30 secondes pendant dix minutes, sans retry de sonde et sans flood. Durée de collecte totale : **600,760 secondes**. Proxy de session et validation TLS conservés. Aucune veille ou nouvelle mise en route n'a été provoquée pour cette mesure ; le worker était déjà réveillé.

| Mesure worker `/health/ready`                       | Résultat         |
| --------------------------------------------------- | ---------------- |
| Total des checks                                    | **21**           |
| HTTP 200 avec `status: ok`                          | **21**           |
| HTTP 503                                            | **0**            |
| Autre HTTP / erreur de transport / réponse invalide | **0**            |
| Latence min                                         | **237,521 ms**   |
| Latence médiane                                     | **473,608 ms**   |
| Latence max                                         | **1 257,186 ms** |

L'API a été contrôlée au début, au milieu et à la fin : **3 HTTP 200**, à chaque fois `postgres=up, redis=up, storage=up`.

La latence curl inclut proxy, TLS, réseau et attente HTTP ; ce n'est pas une durée SQL. La fenêtre est continue mais échantillonnée : elle ne prouve pas l'absence d'incident entre deux sondes. Le cache readiness de cinq secondes reste celui du worker, inchangé.

Les 24 observations horodatées et le résumé sont conservés dans [les preuves JSON](lot14-worker-stability-eb0d365.json). Les corps sont limités à status et états de dépendances autorisés, sans headers, cookies ou secrets.

## Diagnostics internes

Le propriétaire confirme dans sa demande de finalisation la lecture Render couvrant la fenêtre entière : **aucun `POSTGRES_HEALTH_*` et aucun `Worker dependencies unavailable (...)` observé**. Cette corrélation est fournie par le propriétaire ; elle n'est pas présentée comme une lecture directe de logs par cet agent.

| Événement worker                  | Compteur observé sur la fenêtre |
| --------------------------------- | ------------------------------- |
| `POSTGRES_HEALTH_*`               | **0**                           |
| `POSTGRES_HEALTH_CONNECT_TIMEOUT` | **0**                           |
| `postgres=down`                   | **0**                           |
| `redis=down`                      | **0**                           |
| `storage=down`                    | **0**                           |
| Récupération réelle par retry     | **0 revendiquée**               |

**Le retry PostgreSQL est présent dans le SHA déployé, mais n'a pas été exercé pendant cette fenêtre. Aucune récupération réelle n'a été observée ou revendiquée.** Les tests déterministes du retry restent une preuve locale distincte de cette mesure distante. Aucun nouveau timeout/retry n'a été ajusté.

## Préparation suivante

La condition HTTP mesurée (zéro 503, zéro autre échec) a permis de préparer un bootstrap dédié, **sans exécution staging**. Voir [le runbook A/B](deployment/staging-bootstrap-ab.md). Deux tenants et huit comptes fictifs sont prévus, sans dev-access ou seed DEV. Le checkpoint de finalisation et d’audit est autorisé au commit/push sur la même branche. Aucun merge, tag `lot-14-go`, changement V2 ou travail LOT15. L’application et les E2E distants restent distincts de cette certification de stabilité.
