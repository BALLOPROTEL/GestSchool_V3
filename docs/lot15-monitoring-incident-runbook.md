# LOT15 — Monitoring, alerting et runbook incident

Statut : **baseline opérateur provider-neutral — production non autorisée**.

## Objectif

Le pilote doit pouvoir être surveillé sans dépendre d'un fournisseur précis.
Cette baseline définit les signaux, seuils, alertes et procédures que le futur
outil de monitoring devra implémenter. Elle n'achète ni n'active aucun service.

Les seuils ci-dessous sont des **seuils de départ pour pilote**, pas des SLA
contractuels. Ils devront être révisés avec #75 après les tests de charge.

## Signaux déjà disponibles

### API

- `GET /health/live` : liveness ;
- `GET /health/ready` : readiness avec états PostgreSQL / Redis / storage ;
- `X-Request-ID` : UUID généré côté serveur sur chaque requête ;
- erreurs HTTP : corps sanitizé contenant le même `requestId` ;
- erreurs 5xx IAM/API : logs JSON avec `requestId`, opération connue,
  durée, code et diagnostic borné, sans stack, SQL, URL complète ni secret.

### Worker

- `/health/live` et `/health/ready` lorsque le health HTTP staging est activé ;
- readiness fail-closed sur les dépendances critiques ;
- événements sûrs pour job failed documents, reports et messaging ;
- erreurs de queue avec codes statiques, sans payload métier.

### PostgreSQL / Redis / Storage

- readiness séparée pour chaque dépendance ;
- diagnostics PostgreSQL classifiés sans exposer l'erreur driver ;
- Redis health par connexion + PING ;
- storage health privé ;
- backup/restore PostgreSQL certifié par #69 ;
- restart recovery Redis/BullMQ certifié par #70.

## Snapshot opérateur minimal

Le futur dashboard opérateur doit présenter au minimum :

1. disponibilité API sur 5 min et 24 h ;
2. disponibilité worker sur 5 min et 24 h ;
3. p50/p95/p99 de latence API ;
4. volume de requêtes et taux 4xx / 5xx ;
5. état PostgreSQL, Redis et storage ;
6. saturation PostgreSQL et mémoire Redis ;
7. files BullMQ : waiting, active, delayed, failed et âge du plus vieux job ;
8. âge de la dernière sauvegarde PostgreSQL réussie ;
9. erreurs auth 5xx ;
10. déploiement/version en cours et heure du dernier changement.

Le dashboard ne doit jamais afficher de token, cookie, mot de passe, URL de
connexion, corps de message, contenu document, email d'utilisateur ou autre PII.

## Politique d'alertes baseline

La politique testée est implémentée dans
`packages/infrastructure/src/operations/monitoring.ts`.

| Signal                             |     Warning |           Critical |
| ---------------------------------- | ----------: | -----------------: |
| API/worker readiness               |           — | immédiatement down |
| PostgreSQL/Redis/storage           |           — | immédiatement down |
| disponibilité API 5 min            |      < 99 % |             < 95 % |
| API p95                            | >= 1 500 ms |        >= 3 000 ms |
| taux 5xx API, minimum 20 req/5 min |      >= 2 % |             >= 5 % |
| jobs waiting                       |      >= 100 |             >= 500 |
| âge du plus vieux job              |     >= 60 s |           >= 300 s |
| jobs failed sur 5 min              |        >= 1 |              >= 10 |
| saturation pool PostgreSQL         |     >= 80 % |            >= 95 % |
| mémoire Redis                      |     >= 75 % |            >= 90 % |
| erreurs storage sur 5 min          |        >= 1 |               >= 5 |
| erreurs auth 5xx sur 5 min         |        >= 5 |              >= 20 |
| âge dernière sauvegarde réussie    |     >= 26 h |            >= 36 h |

Les alertes ne transportent que des **codes stables + severity**. Les valeurs
techniques utiles restent dans le dashboard ou les métriques, sans données
sensibles.

## Sévérité incident

### SEV1 — service indisponible ou risque d'intégrité

Exemples : API/worker indisponible, PostgreSQL down, corruption/restauration
nécessaire, perte de file non récupérable, incident sécurité confirmé.

Objectif opérateur : prise en charge immédiate, stabilisation avant changement
fonctionnel, aucune opération destructive sans preuve de backup/rollback.

### SEV2 — forte dégradation sans perte confirmée

Exemples : p95 critique, saturation DB/Redis, backlog critique, storage
intermittent, taux 5xx critique avec service encore partiellement disponible.

### SEV3 — warning exploitable

Exemples : seuil warning isolé, backup en retard mais encore récupérable,
quelques jobs failed, tendance de saturation.

## Runbook incident

### 1. Confirmer et borner

- noter heure de début et code(s) d'alerte ;
- vérifier API `/health/live` puis `/health/ready` ;
- vérifier worker `/health/live` puis `/health/ready` ;
- relever les états PostgreSQL / Redis / storage ;
- pour une erreur utilisateur, relever uniquement le `requestId` fourni ;
- ne jamais demander au client un token, cookie, mot de passe ou URL de connexion.

### 2. Classer

- SEV1 si indisponibilité complète, intégrité ou sécurité ;
- SEV2 si forte dégradation ou backlog critique ;
- SEV3 si warning sans impact utilisateur majeur.

### 3. Stabiliser

- arrêter tout déploiement/cutover pendant l'incident ;
- ne pas modifier V2 ;
- ne pas supprimer de job, table, bucket ou backup pour "faire repartir" ;
- si une release est corrélée à l'incident, privilégier le rollback documenté ;
- si Redis est en cause, conserver PostgreSQL comme source durable et laisser
  les mécanismes de reconciliation/outbox reconstruire les jobs ;
- si PostgreSQL est en cause, passer par le runbook #69 avant toute restauration.

### 4. Diagnostiquer par signal

**PostgreSQL down/saturé**

- vérifier readiness et diagnostic statique ;
- vérifier connexions/pool et capacité ;
- ne pas exposer le `DATABASE_URL` dans un ticket ou un chat ;
- si restauration nécessaire, utiliser une restauration isolée avant bascule.

**Redis/BullMQ**

- vérifier Redis readiness ;
- contrôler waiting/active/delayed/failed et âge du plus vieux job ;
- après retour Redis, vérifier que Queue + Worker se reconnectent ;
- laisser `jobId`, leases DB et reconciliation empêcher les doublons ;
- ne purger une file qu'avec validation explicite et preuve de l'état PostgreSQL.

**Storage**

- vérifier health privé et erreurs d'écriture/lecture ;
- ne jamais rendre un bucket public pour contourner l'incident ;
- ne supprimer un objet candidat que si la DB prouve qu'il n'est pas l'objet
  historique engagé.

**5xx / auth**

- utiliser `requestId` pour corréler réponse et log ;
- utiliser uniquement les codes/diagnostics sanitizés ;
- ne jamais copier stack, bearer token, cookies ou payload utilisateur dans le
  canal incident.

### 5. Retour au service

Le service est considéré revenu lorsque :

- API et worker readiness sont stables ;
- PostgreSQL, Redis et storage sont up ;
- le backlog décroît puis revient sous warning ;
- aucun nouveau failed job anormal n'apparaît ;
- les 5xx reviennent sous le seuil warning ;
- un parcours synthétique autorisé passe ;
- aucune donnée réelle n'a été utilisée pour la vérification avant Gate D.

### 6. Clôturer

Documenter :

- heure début/fin ;
- sévérité ;
- codes d'alerte ;
- cause racine confirmée ou "inconnue" ;
- actions réalisées ;
- rollback/restauration éventuels ;
- preuve du retour au service ;
- action préventive avec propriétaire et échéance.

Aucun secret/PII ne doit apparaître dans le compte rendu.

## Alert delivery / fournisseur

La logique de seuil est certifiable sans fournisseur. En revanche, la livraison
réelle d'alertes (email, webhook, pager, dashboard hébergé) dépendra du fournisseur
d'exploitation retenu.

Avant Gate D, il faudra confirmer :

- le canal d'alerte autorisé ;
- les destinataires ;
- les fenêtres d'astreinte éventuelles ;
- la rétention des métriques/logs ;
- le budget si le service n'est pas gratuit ;
- un test réel de notification sur destinataires explicitement autorisés.

Aucune notification réelle n'est envoyée par ce chantier.
