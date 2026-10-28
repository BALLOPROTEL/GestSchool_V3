# LOT15 — Charge, capacité et résilience

Statut : **baseline locale/CI en certification — production non autorisée**.

## But

Cette preuve établit une baseline reproductible avant pilote sans envoyer de charge sur le staging,
sans ressource payante et sans donnée réelle. Elle ne constitue pas une mesure de capacité du futur
fournisseur de production.

Commande :

```sh
pnpm capacity:test
```

Le test est limité à `NODE_ENV=test`.

## Profil borné

La certification utilise uniquement les services CI locaux :

- PostgreSQL CI déjà migré et seedé avec des données synthétiques ;
- MinIO privé CI ;
- Redis 8.10.1 isolé sur un port local, limité à 64 MiB avec `noeviction` ;
- API GestSchool démarrée localement ;
- BullMQ sur une DB Redis isolée ;
- exports synthétiques sans utilisateur réel.

Le profil mesure :

- 300 appels `/health/live` avec concurrence 20 ;
- 60 appels `/health/ready` avec concurrence 6, donc PostgreSQL + Redis + storage ;
- 100 checks PostgreSQL avec concurrence 10 ;
- 150 checks Redis avec concurrence 15 ;
- 100 jobs BullMQ avec worker concurrency 2 ;
- 100 exports CSV de 1 000 lignes ;
- 30 exports XLSX de 1 000 lignes ;
- un export PDF synthétique de 100 lignes ;
- connexions PostgreSQL observées après charge ;
- mémoire Redis et clients connectés après charge.

Chaque famille répétée publie p50, p95, p99, erreurs et throughput.

## Résilience partielle

Après la charge, le Redis isolé est arrêté pendant que l'API reste en ligne.

La preuve exige :

- `/health/live` reste HTTP 200 ;
- `/health/ready` passe HTTP 503 ;
- la panne est détectée en moins de 7 secondes ;
- Redis est redémarré ;
- la readiness revient HTTP 200 en moins de 15 secondes.

Ce test ne coupe jamais le Redis staging/Upstash.

## Seuils NO-GO baseline

Les limites sont volontairement conservatrices pour une CI partagée :

- aucune erreur sur API live/ready, PostgreSQL, Redis, BullMQ ou exports ;
- API live p95 <= 500 ms et p99 <= 1 000 ms ;
- API readiness p95 <= 2 500 ms et p99 <= 5 000 ms ;
- PostgreSQL health p95 <= 1 000 ms ;
- Redis health p95 <= 1 000 ms ;
- BullMQ p95 <= 5 000 ms et throughput >= 10 jobs/s ;
- CSV p95 <= 250 ms ;
- XLSX p95 <= 1 000 ms ;
- PDF 100 lignes <= 30 s ;
- moins de 80 connexions PostgreSQL observées ;
- Redis sous 75 % des 64 MiB du profil ;
- détection panne Redis <= 7 s ;
- retour readiness <= 15 s.

Un dépassement produit `LOT15_CAPACITY=NO_GO` et fait échouer la CI.

## Interprétation

Un PASS signifie seulement que le code et l'architecture franchissent ce profil local borné. Il ne
prouve pas :

- le débit internet réel ;
- la latence entre régions ;
- l'autoscaling ;
- le comportement multi-instance ;
- les limites CPU/RAM du fournisseur final ;
- la capacité d'une base ou d'un Redis payant ;
- la délivrabilité Brevo ;
- une charge établissement réelle.

Avant Gate D, les seuils devront être confrontés à l'infrastructure finale autorisée. Toute montée en
charge distante ou ressource pouvant coûter de l'argent exige l'accord explicite du propriétaire.

## Règle pilote

Le pilote est NO-GO si cette certification locale est rouge ou si les mesures finales sur
l'infrastructure autorisée dépassent les seuils retenus après calibration. Aucun seuil ne doit être
assoupli uniquement pour faire passer une CI sans analyse de la cause.
