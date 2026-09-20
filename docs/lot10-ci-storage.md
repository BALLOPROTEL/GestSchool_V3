# LOT 10 — Correctif CI du stockage privé

Périmètre exclusif : infrastructure de test du job `quality`. Aucune logique
métier, migration, permission, assertion ou sélection de tests n’est modifiée.
Aucun LOT 11. Base de départ : `8b78b53`.

## Cause confirmée

Les deux pulls distants ont été reproduits le 19 septembre 2026 :

```text
minio/minio:RELEASE.2025-07-23T15-54-02Z → pull access denied, docker run exit 125
minio/mc:RELEASE.2025-08-13T08-35-41Z → pull access denied, docker run exit 125
```

Lors du premier audit du 19 septembre, le daemon DEV contenait ces deux anciennes images. Leur présence permettait
un démarrage local sans pull, mais ne prouvait pas leur disponibilité pour un
runner GitHub vierge. L’échec se produit avant l’ouverture de S3 : ce n’est pas
une panne du seed, de Prisma, des permissions du bucket ou du moteur PDF.

## Stratégie

La [release officielle MinIO](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z)
recommande de compiler le conteneur depuis les sources. Le Dockerfile CI compile
le serveur et `mc`, sans image préconstruite issue d’un registre MinIO ni image
communautaire tierce. Le serveur retenu inclut le correctif de sécurité de cette
release. Les sources de `mc` restent celles de la version utilisée auparavant.

| Élément                            | Référence immuable                                                        |
| ---------------------------------- | ------------------------------------------------------------------------- |
| MinIO RELEASE.2025-10-15T17-29-55Z | `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a`                                |
| mc RELEASE.2025-08-13T08-35-41Z    | `7394ce0dd2a80935aded936b09fa12cbb3cb8096`                                |
| Go 1.24.8 / Bookworm               | `sha256:4ed690d6649d63c312b99a6120025ec79ce3b542968a37da53d6236c7c61a848` |
| Alpine 3.22.2                      | `sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412` |

Les SHA Git complets sont vérifiés après fetch. Les dépendances Go suivent les
`go.mod`/`go.sum` amont, `go mod verify` est obligatoire et la compilation utilise
`-mod=readonly`. `GOTOOLCHAIN=local` empêche le téléchargement implicite d’un
autre compilateur. Les métadonnées de version utilisent le générateur officiel.
Les licences sont conservées dans l’image. Aucun package applicatif n’est ajouté.

À chaque CI, `sh scripts/ci-storage.sh` :

1. Exécute `docker build --pull --no-cache` sur le seul contexte `docker/ci-storage`.
2. Résout l’ID SHA-256 de l’image construite et lance cet ID, avec `--pull=never`.
3. Attend la disponibilité HTTP du serveur, sans masquer un échec.
4. Utilise le `mc` compilé dans la même image pour créer un bucket privé.
5. Écrit et relit un objet témoin avec authentification.
6. Exige HTTP 403 pour la liste anonyme, la lecture de cet objet existant et
   son écriture anonyme ; vérifie que les octets n’ont pas changé.
7. Supprime uniquement son objet témoin `.ci-private-probe`.

Le serveur est non-root (UID/GID 10001), sa console est désactivée et son port
n’est publié que sur `127.0.0.1` en CI. Les identifiants utilisés sont ceux, publics
et jetables, des fixtures locales, jamais des secrets de production. Le SDK et
l’adaptateur S3 de GestSchool restent inchangés ; aucun stockage n’est rendu public.

Cette image est réservée à la CI, pas homologuée pour la production. Les versions
épinglées devront être réévaluées explicitement lors des mises à jour ; un pin
garantit l’identité des entrées, pas leur disponibilité éternelle ni leur sécurité
future. `docker/compose.yml` DEV est hors de ce correctif : ses anciens tags
MinIO ne redeviennent pas téléchargeables grâce à cette modification CI.

## Reproduction sans cache Docker

Un daemon Docker-in-Docker neuf, séparé de DEV, a été créé avec
`docker:29.2.1-dind@sha256:68f6d9ab84623d1116c5432a3b924a07ee09960e6129ca1cb03ef14010588cb4`.
Il ne monte ni socket Docker hôte, ni code applicatif, ni volume DEV. Son état
avant build a été vérifié : **0 image, 0 conteneur, 0 volume, 0 octet de cache**.
Seuls le Dockerfile et le script CI y sont copiés. La compilation ne peut donc
pas consulter les images MinIO du daemon DEV.
Ce daemon de reproduction utilise le mode privilégié nécessaire à Docker-in-Docker ;
ce mode n’est pas utilisé par l’image MinIO ni ajouté au workflow GitHub.

Le build froid est réussi. L’image effectivement exécutée a pour ID
`sha256:850befc3ab1bd577ac089de01f4e92865b4941247e680a185e681bdcf17424e3`,
avec l’utilisateur `10001:10001`. Les sorties `minio --version` et `mc --version`
confirment les deux commits du tableau. Aucun téléchargement d’image `minio/minio`
ou `minio/mc` n’a lieu dans ce daemon. Le build n’importe aucun cache externe.

PostgreSQL et Redis utilisent les mêmes images que le workflow, mais des données
neuves dans ce daemon. La base finale `gestschool_ci_quality` a été vérifiée
vide, indépendamment de la base du premier essai. Les ports hôte sont 15432, 16379 et 19000,
tous limités à localhost. Le bind interne MinIO est `0.0.0.0` seulement dans ce
daemon imbriqué, derrière cette publication hôte loopback ; le workflow conserve
son bind `127.0.0.1`. Les tests applicatifs reçoivent ces endpoints explicitement.

La reproduction est locale sous WSL, pas une exécution GitHub Actions distante.
Elle utilise les bibliothèques Chromium locales déjà certifiées ; le runner
Ubuntu conserve `playwright install --with-deps chromium`.

## Certification

La validation réelle du stockage CI a été exécutée après la compilation froide,
sans utiliser les images `minio/minio` ou `minio/mc` du daemon local. Les résultats
ci-dessous ne reprennent pas les nombres de la certification précédente.
Journaux privés : `.local/lot10-ci-storage-upXNem/` (ignoré par Git).

- Build source officiel sans cache : PASS (`cold-build-storage.log`).
- Image de la campagne isolée `quality.log` : `sha256:850befc3ab1bd577ac089de01f4e92865b4941247e680a185e681bdcf17424e3`.
- Un second build complémentaire a produit `sha256:6dfe4dd5f2cb235635d2130895337c903578cafd8caf7dedcec3b1ff2070903d` sur le daemon hôte. Il ne faut pas confondre ces deux exécutions ; les sources sont identiques, les métadonnées des images ne sont pas une promesse de reproductibilité bit à bit.
- Démarrage privé et création du bucket : PASS.
- Écriture/lecture authentifiées : PASS ; le témoin contient exactement les octets attendus.
- Liste, lecture d’un objet existant et écriture anonymes : HTTP 403 chacune.
- Les octets du témoin sont inchangés après la tentative d’écriture anonyme.
- Codes 125 des deux anciens tags : reproduits (`upstream-failures.log`).
- Identité de l’image en exécution et utilisateur `10001:10001` : PASS.

La relecture des journaux le 20 septembre corrige le compte rendu intermédiaire :
la séquence locale complète a bien été lancée dans `quality.log`. Installation,
génération Prisma, 11 migrations, seed, 18 tests d’intégrité, formatage, lint,
15 tâches de typage, **326 tests unitaires** et build ont réussi. `pnpm iam:test` a
également réussi **342/342 tests**, dont les **42 tests documentaires**.
En revanche, cette première campagne a échoué au démarrage Playwright :
`Timed out waiting 120000ms from config.webServer`, avant les scénarios.
Elle ne constitue donc pas un PASS global.

Le 20 septembre, un diagnostic sans changement de code ni de timeout a confirmé
le démarrage du worker, la préparation des fixtures API puis le démarrage Next.
Le scénario documentaire mobile complet a réussi : **1/1**, en 3,8 minutes
démarrage inclus (`playwright-startup-diagnostic.log`). La première exécution
ne journalisait pas le détail des serveurs ; sa cause temporelle exacte n’est
pas affirmée.

La relance complète `pnpm test:e2e` est désormais terminée dans
`playwright-complete.log` : **97 tests réussis, 71 cas ignorés par la sélection
préexistante, 0 échec, 0 retry observé**, sur les sept viewports. Playwright
annonce 42,1 minutes ; la commande racine, préparation comprise, 47 min 11,754 s
et 10/10 tâches réussies. Les scénarios documentaires LOT 10 passent sur les
sept viewports, ainsi que les parcours des lots précédents prévus par la suite.
Aucun test métier, stockage, PDF ou QR n’est désactivé ni modifié.

| Commande / contrôle exécuté                                                                                      | Résultat final                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                 | PASS                                                                |
| `pnpm db:generate`                                                                                               | PASS — Prisma 7.10.0                                                |
| `sh scripts/ci-storage.sh` dans le daemon vierge                                                                 | PASS — build froid, bucket privé et contrôles anonymes              |
| `pnpm exec playwright install chromium`                                                                          | PASS — bibliothèques système locales, écart WSL documenté ci-dessus |
| `pnpm iam:keys`                                                                                                  | PASS — clés locales existantes conservées                           |
| `pnpm db:migrate:deploy` sur base vide                                                                           | PASS — 11 migrations                                                |
| `pnpm db:seed`                                                                                                   | PASS                                                                |
| `pnpm db:test`                                                                                                   | PASS — 18/18                                                        |
| `pnpm format:check`                                                                                              | PASS                                                                |
| `pnpm lint`                                                                                                      | PASS                                                                |
| `pnpm typecheck`                                                                                                 | PASS — 15/15 tâches                                                 |
| `pnpm test`                                                                                                      | PASS — 326 tests                                                    |
| `pnpm build`                                                                                                     | PASS — 9/9 tâches                                                   |
| `pnpm iam:test`                                                                                                  | PASS — 342/342, dont 42 tests documentaires stockage/PDF/QR         |
| `pnpm --filter @gestschool/web test:e2e --project=360x800 --grep 'LOT 10 official'` avec diagnostic des serveurs | PASS — 1/1                                                          |
| `pnpm test:e2e` (relance complète)                                                                               | PASS — 97 réussis, 71 exclusions préexistantes, aucun échec         |

**Verdict local : GO pour le correctif CI LOT 10.** Tous les contrôles requis
ont réussi sur le stockage reconstruit à froid ; le premier timeout E2E reste
documenté et n’est pas effacé du bilan. Ce verdict local ne remplace pas une
exécution distante du workflow corrigé.

La [CI GitHub consultée le 20 septembre](https://github.com/BALLOPROTEL/GestSchool_V3/actions/runs/35447803725)
est celle du commit `8b78b53`, sans ce correctif : échec `quality`, étape
`Start private document storage`. Le correctif reste non commité/non poussé ;
la CI distante corrigée ne peut pas être déclarée verte à ce stade. Avant de
passer au LOT 11, il reste à commiter/pousser ces cinq fichiers puis à obtenir
un job `quality` vert sur ce nouveau commit. Aucun commit ni push n’est réalisé
dans cette intervention.

Un premier essai local a lancé le seed pendant la compilation Go : la transaction
IAM a dépassé sa limite de 5 000 ms (5 009 ms, `P2028`). Les migrations avaient
réussi. Ce journal est conservé dans `fresh-database.log` ; cet essai n’est pas
présenté comme une certification réussie. La certification finale est exécutée
séquentiellement après le build du stockage, comme dans le workflow ; aucun
timeout ni traitement du seed n’est modifié pour contourner cet incident.

## Fichiers et commit

- `.github/workflows/ci.yml` : appelle le bootstrap de stockage compilé.
- `docker/ci-storage/Dockerfile` : sources officielles et bases épinglées, serveur + mc.
- `scripts/ci-storage.sh` : build froid, démarrage, bucket et tests d’accès privé.
- Ce compte rendu et son lien dans `docs/README.md`.

La modification générée de `apps/web/next-env.d.ts`, déjà présente lors de la
reprise, est conservée mais ne fait pas partie de ce correctif ni du commit
proposé. Aucun fichier applicatif, test ou migration historique n’est modifié
par le correctif.

Commit proposé : `fix(ci): build pinned MinIO and mc sources for private storage tests`
