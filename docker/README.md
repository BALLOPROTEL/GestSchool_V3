# Infrastructure Docker locale

La composition officielle du LOT 2 se trouve dans `compose.yml`. Elle démarre PostgreSQL, Redis
et MinIO sur un réseau dédié, avec volumes persistants et healthchecks.

Utilisez exclusivement les scripts racine `pnpm infra:*`. `pnpm infra:reset` supprime les trois
volumes nommés et toutes leurs données locales.
