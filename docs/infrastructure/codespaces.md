# GestSchool dans GitHub Codespaces

Cette configuration permet de développer GestSchool dans le cloud sans conserver le projet, les
`node_modules`, les images Docker ou les volumes de développement sur le PC Windows.

## Création du Codespace

Depuis GitHub, ouvrez le dépôt GestSchool, choisissez la branche contenant cette configuration puis :

1. **Code**
2. **Codespaces**
3. **Create codespace**

Le conteneur installe Node.js 24, pnpm 10.24.0, Docker-in-Docker et les dépendances du monorepo.

Pour préserver le quota gratuit, PostgreSQL, Redis, MinIO, Playwright et les processus applicatifs
ne sont pas démarrés automatiquement.

## Démarrage d'une session de travail

Dans le terminal du Codespace :

```bash
pnpm infra:up
pnpm infra:check
pnpm db:migrate:deploy
pnpm dev
```

Le seed est volontairement séparé. Utilisez-le uniquement lorsque vous voulez recréer les données
de développement :

```bash
pnpm db:seed
```

Ports utiles :

- Web : 3000
- API : 3100
- MinIO Console : 9001

Les URLs publiques temporaires du Codespace sont calculées automatiquement au démarrage. Les ports
restent privés par défaut dans GitHub Codespaces.

## Tests E2E

Playwright n'est pas installé automatiquement afin d'éviter de consommer inutilement du stockage.
Lorsque vous en avez besoin :

```bash
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

## Fin de session

Avant de supprimer un Codespace, sauvegardez toujours le code dans GitHub :

```bash
git status
git add .
git commit -m "votre message"
git push
```

Ensuite, arrêtez le Codespace lorsque vous avez fini de travailler. Un Codespace arrêté ne consomme
plus de temps de calcul, mais son stockage persiste tant qu'il n'est pas supprimé.

Les volumes Docker PostgreSQL, Redis et MinIO appartiennent à l'environnement de développement du
Codespace. Ils ne doivent pas être considérés comme une sauvegarde ni comme des données de
production. La source de vérité reste le dépôt GitHub, les migrations et les données de seed.

## Commandes de reprise

Après redémarrage d'un Codespace existant :

```bash
pnpm infra:up
pnpm dev
```

Pour arrêter les services sans supprimer leurs volumes :

```bash
pnpm infra:down
```

La commande `pnpm infra:reset` supprime les volumes de développement et reste destructive.
