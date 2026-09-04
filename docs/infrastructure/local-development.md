# Développement local avec l'infrastructure LOT 2

## Prérequis

- Node.js 24 LTS, version de référence 24.20.0 ;
- pnpm 10.24.0 ;
- Docker Engine avec Docker Compose v2 ;
- Chromium Playwright et ses bibliothèques système pour les tests E2E.

Sous WSL 2 avec Docker Desktop, activez l'intégration de la distribution dans **Settings →
Resources → WSL Integration** avant d'exécuter les commandes d'infrastructure.

## Services et ports

| Service    | Adresse locale                 | Image                                      |
| ---------- | ------------------------------ | ------------------------------------------ |
| PostgreSQL | `127.0.0.1:5432`               | `postgres:18.6-trixie`                     |
| Redis      | `127.0.0.1:6379`               | `redis:8.10.1-alpine3.23`                  |
| MinIO S3   | `http://127.0.0.1:9000`        | `minio/minio:RELEASE.2025-07-23T15-54-02Z` |
| MinIO UI   | `http://127.0.0.1:9001`        | même conteneur                             |
| API        | `http://127.0.0.1:3100`        | processus NestJS local                     |
| Web        | `http://127.0.0.1:3000`        | processus Next.js local                    |
| Init S3    | conteneur ponctuel, aucun port | `minio/mc:RELEASE.2025-08-13T08-35-41Z`    |

Tous les ports Docker sont liés à `127.0.0.1`, pas à toutes les interfaces de la machine.

## Configuration

`.env.example` contient exclusivement des identifiants de développement jetables. Ils ne doivent
jamais être réutilisés dans un environnement partagé ou de production. Pour personnaliser le
poste local :

```bash
cp .env.example .env
```

Le fichier `.env` est ignoré par Git. Les applications valident au démarrage :

- `NODE_ENV`, `DATABASE_URL` et `REDIS_URL` ;
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` ;
- `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` ;
- `API_PORT`, qui vaut 3100 dans la configuration locale fournie.

Une variable obligatoire absente ou invalide arrête le processus avec un message commençant par
`Invalid GestSchool environment` sans afficher la valeur des secrets.

## Démarrage

Le workflow standard ne nécessite pas de fichier `.env` si les valeurs locales de l'exemple
conviennent :

```bash
pnpm install
pnpm infra:up
pnpm dev
```

`infra:up` attend les healthchecks puis exécute un conteneur d'initialisation idempotent. Celui-ci
crée le bucket privé `gestschool-local-private` s'il n'existe pas et réapplique explicitement une
politique anonyme `none`.

## Vérification

```bash
pnpm infra:check
curl -i http://127.0.0.1:3100/health/live
curl -i http://127.0.0.1:3100/health/ready
```

`infra:check` effectue une requête SQL `SELECT 1`, un `PING` Redis, un `HeadBucket` S3 authentifié
et une tentative anonyme qui doit être refusée par MinIO.

- `/health/live` indique uniquement que le processus API fonctionne ;
- `/health/ready` retourne HTTP 200 lorsque les trois dépendances sont disponibles ;
- `/health/ready` retourne HTTP 503 dès qu'une dépendance critique est indisponible.

Le Worker charge la même configuration et vérifie les trois dépendances avant d'annoncer qu'il est
prêt. Il ne publie aucun port HTTP.

## Arrêt et réinitialisation

```bash
pnpm infra:down
```

L'arrêt conserve les volumes. La commande suivante est **destructive et réservée au local** :

```bash
pnpm infra:reset
```

Elle supprime définitivement les volumes PostgreSQL, Redis et MinIO ainsi que leurs données.

## Diagnostic

```bash
pnpm infra:logs
docker compose -f docker/compose.yml ps
docker compose -f docker/compose.yml logs postgres redis minio
```

Si Docker répond qu'il est introuvable sous WSL, démarrez Docker Desktop et activez son intégration
pour la distribution. Si un port est occupé, identifiez le processus local avant de modifier les
ports documentés. Les URLs applicatives restent des URLs hôte (`127.0.0.1`) ; les services Docker
communiquent entre eux sur le réseau `gestschool-local-network` avec leurs noms de service.

PostgreSQL exige un mot de passe et initialise les authentifications locale et hôte en
SCRAM-SHA-256, sans règle `trust`. Redis exige également le mot de passe local et n'est publié que
sur la boucle locale. Le bucket MinIO reste privé.
