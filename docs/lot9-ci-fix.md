# LOT 9 — Correctif CI des locators People et retries MFA

Certification finale du 12 septembre 2026 : **GO local**. Chaîne CI équivalente complète
réussie sur une nouvelle base PostgreSQL vide ; code de sortie final **0**.
Playwright : **90 réussis, 71 exclusions préexistantes, zéro échec et zéro retry**.

Périmètre exclusif : infrastructure de tests et documentation. Aucun LOT 10, changement
métier, modification de migration, dépendance ajoutée ou modification de la MFA de production.

## Cause établie

Le [run GitHub 34624184095](https://github.com/BALLOPROTEL/GestSchool_V3/actions/runs/34624184095)
échoue sur le commit `b0ec261`, dans le parcours CRUD People en 360×800.
Le premier essai appelle un locator global `getByRole('searchbox')` après le clic Retour.
La transition Next.js n'est pas encore terminée : `ready()` voit encore le profil élève,
déjà prêt, et ses quatre champs de recherche (association, année, période, classe).
Le champ réellement voulu appartient à l'annuaire des élèves, pas aux filtres du profil.

Les retries échouent ensuite pour une autre raison : le premier essai a déjà enrôlé le
compte MFA en base. Le nouveau worker Playwright ne réinitialise pas PostgreSQL. Le helper
supposait néanmoins un premier enrôlement et attendait à nouveau `mfa-secret`, absent du
challenge d'un compte déjà enrôlé. L'état MFA n'était conservé qu'en mémoire du worker.
Le [fonctionnement officiel des retries Playwright](https://playwright.dev/docs/test-retries)
confirme le remplacement du worker et du navigateur après un échec.

## Correctif

- Retour exact `Retour aux élèves`, puis attente explicite de `/fr/students` et du titre
  `Élèves` avant `ready()` et la recherche.
- Annuaire : `main` → `searchbox`, nom accessible `Rechercher`, `exact: true`.
- Dialogue de relation : `dialog` → `searchbox`, nom accessible
  `Rechercher une fiche à associer`, `exact: true`. Aucun `.first()` ajouté.
- Les comptes administrateurs People sont créés exclusivement par le serveur E2E gardé
  par `NODE_ENV=test` et `IAM_ENV=local`, avec un enrôlement préparé et une clé aléatoire
  propre à chaque identité/scénario/viewport. Aucun compte DEV ou production n'est réinitialisé.
- Le helper partagé sait aussi terminer un premier enrôlement réel depuis l'interface.
  Pour un compte déjà enrôlé, il utilise la clé de fixture ou l'état privé du premier essai.
  Les fixtures des autres lots restent non enrôlées initialement.
- Clé et dernier compteur TOTP sont conservés entre workers dans `.local/e2e-mfa/`,
  ignoré par Git : répertoire 0700, fichiers 0600, noms dérivés du hash de l'identité.
  La fixture `.local/iam-e2e.json` reste privée. Aucun contenu secret n'est journalisé.
- Le compteur est enregistré **avant** l'envoi du code : un retry reste sûr si le serveur
  a accepté le code sans que le navigateur ait observé la réponse. Le helper attend si
  nécessaire la prochaine fenêtre de 30 secondes ; la protection anti-rejeu reste active.
- Aucune trace, vidéo ou capture contenant les authentifiants n'est ajoutée. Aucun test
  supprimé, nouvelle exclusion, retry désactivé ou assertion métier remplacée.

Sept tests unitaires couvrent la persistance inter-workers, l'isolation des identités,
les permissions des fichiers, la non-divulgation du JSON invalide, les fenêtres TOTP,
le recul d'horloge et le vecteur public RFC 6238.

## Fichiers du correctif

- `apps/web/e2e/people.spec.ts` : navigation et locators exacts, login partagé.
- `apps/web/e2e/academic-helpers.ts` : délégation de la MFA au helper retry-safe.
- `apps/web/e2e/mfa-helpers.ts` : première inscription et challenges suivants.
- `apps/web/e2e/mfa-state.ts` : état privé inter-workers et compteur anti-rejeu.
- `apps/web/src/e2e-mfa-state.test.ts` : sept tests de l'infrastructure MFA.
- `apps/api/tests/e2e-server.ts` : préparation déterministe des comptes People TEST.
- `apps/api/tests/e2e-auth-fixture.ts` : comptes et jetons activation/reset créés juste
  avant le scénario, uniquement en TEST et dans un tenant E2E isolé.
- `apps/web/e2e/auth-fixtures.ts` : lancement du préparateur TEST sans divulgation des
  authentifiants, livraison privée 0600 distincte des fichiers d'accès DEV.
- `apps/web/e2e/lot1.spec.ts` : utilisation de ces nouvelles fixtures à chaque tentative,
  sans modifier les assertions du parcours.
- `docs/lot9-ci-fix.md` : diagnostic et certification.

## Certification

Première commande demandée, exécutée avant la certification complète :
`pnpm --filter @gestschool/web test:e2e`, avec `CI=1` et les deux retries configurés.
**PASS : 90 réussis, 71 exclusions préexistantes par viewport, zéro échec et zéro retry,
en 17,5 minutes.** Le CRUD People passe sur 360×800 et 1440×900 au premier essai.

### Diagnostic réel des retries

Un diagnostic privé, hors du `testDir` CI, utilise le vrai helper, le vrai serveur et un
compte TEST initialement non enrôlé. Deux fautes sont injectées explicitement : après
enrôlement/création d'un élève, puis après modification de son prénom.

Résultat vérifié dans le rapport JSON : **trois workers distincts**, deux erreurs dont
les seuls messages sont les points d'injection attendus, puis **retry #2 réussi**.
Les retries #1 et #2 utilisent `/mfa/verify`, jamais `/mfa/enroll`, et retrouvent les
données du précédent essai. La dernière connexion attend un nouveau compteur TOTP.
Playwright classe ce diagnostic volontairement interrompu comme `1 flaky` : il ne s'agit
pas d'un échec spontané de la suite normale, qui conserve zéro retry. Aucun échec MFA
inattendu n'est observé. Le scénario et son rapport sont conservés localement, sans
introduire de test volontairement défaillant dans la CI.

### Environnement CI équivalent

Node 24.20.0, pnpm 10.24.0, Prisma/client/adapter-pg 7.10.0 GA, Playwright 1.62.1.
Services identiques au workflow : `postgres:18.6-trixie` et
`redis:8.10.1-alpine3.23`, PostgreSQL utilisateur/base `gestschool`, mot de passe public
TEST du workflow, Redis sans mot de passe, `NODE_ENV=test`, `IAM_ENV=local`, `CI=1`.

Les services isolés utilisent les ports locaux 55439/56399 pour préserver les services
DEV. Le volume PostgreSQL neuf contenait **zéro table publique** avant les neuf migrations.
Les autres différences locales sont les bibliothèques système de Chromium chargées via
`LD_LIBRARY_PATH` (transmis à Turbo), plutôt que l'installation apt du runner Ubuntu,
et la conservation des clés IAM locales existantes par le script officiel `iam:keys`.
Aucune différence de code applicatif ni de paramètres de sécurité de l'authentification.
Le workflow GitHub lui-même n'a pas besoin d'être modifié pour ce correctif.

| Commande / étape                                  | Résultat observé                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                  | PASS, lockfile inchangé                                                     |
| Démarrage et healthchecks PostgreSQL/Redis isolés | PASS                                                                        |
| `pnpm db:generate`                                | PASS, Prisma 7.10.0                                                         |
| `pnpm iam:keys`                                   | PASS, clés locales existantes conservées                                    |
| `pnpm db:migrate:deploy`                          | PASS, neuf migrations sur base vide                                         |
| `pnpm db:seed`                                    | PASS                                                                        |
| `pnpm db:test`                                    | PASS, 18/18                                                                 |
| `pnpm format:check`                               | PASS                                                                        |
| `pnpm lint`                                       | PASS, aucun warning                                                         |
| `pnpm typecheck`                                  | PASS, 14 tâches ; API/web réexécutés, 12 tâches inchangées en cache         |
| `pnpm test --concurrency=2`                       | PASS, 303 tests (186 API, 104 web, 13 autres)                               |
| `pnpm build`                                      | PASS, neuf tâches                                                           |
| `pnpm iam:test`                                   | PASS, 300/300 sur six fichiers couvrant les LOT 4 à 9                       |
| `pnpm exec playwright install chromium`           | PASS                                                                        |
| `pnpm test:e2e`                                   | PASS, 90 réussis en 16 minutes, zéro échec/retry ; 10 tâches Turbo réussies |

La première certification a réellement exécuté les sept tâches de tests unitaires sans
cache de tests, ainsi que les 14 tâches de typecheck. Après le correctif complémentaire
de fixtures, les suites API et web ont été réexécutées (290 tests, dont les sept nouveaux
tests MFA) ; les 13 tests des packages inchangés sont repris du cache valide. Les builds
API/web ont également été réexécutés. L'intégrité, les 300 tests HTTP/SQL et Playwright
tournent réellement, sans cache. Les preuves finales `final-*.log` sont conservées dans
`.local/lot9-ci-KhhsEU/`, hors Git.

La matrice finale couvre les LOT 4/5/6/7/8/9, FR/EN/AR, RTL et les sept résolutions.
People CRUD 360×800 et 1440×900, ainsi que le scénario activation/reset corrigé,
passent dès leur premier essai. La coupure réseau LOT 1 ne se reproduit pas sur ce rejeu.
Les zéros ci-dessous portent sur la campagne finale, pas sur les échecs intermédiaires
documentés ensuite :

```text
people.spec.ts = PASS
LOT 9 E2E = PASS
CI quality équivalente locale = PASS
unexpected flaky retry state = 0
frontend regressions observed (LOT 4 à 9) = 0
```

### Campagne prolongée après interruption du poste

Le premier rejeu E2E de la chaîne CI, repris le 12 septembre, n'est pas certifié vert
(exit 1 : 88 réussis, un échec, un flaky, 71 exclusions préexistantes) :
un appel `/api/v1/classes` rencontre `ECONNRESET` dans la navigation LOT 1 en 768×1024
(retry réussi), puis le parcours activation/reset en 1440×900 échoue sur le reset.
La vérification SQL ne lit et ne publie que les dates du jeton TEST : créé le
11 septembre à 20:08:11 UTC, expiré à 20:23:11 UTC, non utilisé lors du contrôle du
12 septembre à 13:08:56 UTC. La validité normale du reset est de 15 minutes.
L'activation réussie au premier essai rend également son jeton non réutilisable aux retries.
Ces résultats sont conservés, sans être transformés en succès ni attribués à la MFA.
Le test LOT 1 concerné n'utilise pas le helper MFA modifié. Aucun allongement de validité,
réactivation de jeton consommé ou changement de code d'authentification n'est effectué.
Turbo mesure 17 h 04 min écoulées pour cette campagne suspendue, contre 24,9 minutes
d'exécution Playwright. Le rejeu complet avec de nouvelles fixtures est consigné ci-dessus.

Le rejeu suivant sans suspension a également dépassé les 15 minutes avant d'atteindre
le reset : fixture créée à 15:13:34 le 12 septembre (Europe/Paris), encore non utilisée
à 15:30. Le même échec a été reproduit ; la campagne a été interrompue proprement
(exit 130) après observation de l'échec et du retry, afin de corriger sa préparation.
Le jeton ne doit donc pas être créé au démarrage de toute la suite.

Le correctif reste exclusivement TEST : à chaque tentative du scénario activation/reset,
un processus local prépare deux nouvelles identités dans le tenant E2E, et émet les jetons
avec le service existant. Le contrôle `NODE_ENV=test`, le mode IAM local et le préfixe du
tenant `iam-e2e-` sont obligatoires. Le refus du mode production a été vérifié avant accès
aux données. Les jetons ne sont pas prolongés ou réactivés : les TTL normaux et leur usage
unique restent appliqués. Les comptes créés au début de la suite et devenus inutiles ont
été retirés de la préparation, pas supprimés d'une base existante.
Le nouveau fichier `.local/iam-e2e-auth.json` est privé (0600), jamais journalisé et n'écrase
ni `.local/test-access.json` ni la livraison DEV. Toutes les assertions métier sont conservées.

Validation ciblée après ce correctif :
`pnpm --filter @gestschool/web test:e2e e2e/people.spec.ts e2e/lot1.spec.ts --project=1440x900 --grep 'LOT 5 real CRUD|exercises real login' --repeat-each=3`
→ **6/6 réussis en 2,3 minutes**, sans échec ni retry. Les types API/web et le lint passent.
La certification finale a recommencé depuis une autre base totalement vide, dans des services
isolés distincts ; les premières bases sont arrêtées et conservées, pas supprimées.

Contrôle de confidentialité final : permissions des 173 états MFA privés et des fixtures
valides ; aucune des clés MFA, mots de passe ou jetons contrôlés dans les dix fichiers
du correctif ni les journaux de certification. Aucun fichier de code applicatif, migration,
lockfile ou configuration des retries n'est modifié.

Après la campagne CI complète réussie, un contrôle supplémentaire de navigation LOT 1
en 768×1024 avec `--repeat-each=3` donne deux réussites, puis HTTP 429 à la troisième
répétition et aux retries. Cette exécution en rafale dépasse la limite de requêtes ; son
échec (exit 1) est conservé dans `navigation-repeats.log`. Aucun quota n'est relevé,
aucune clé de limitation n'est supprimée et aucune assertion n'est retirée. Ce résultat
supplémentaire ne remplace pas la campagne CI normale finale réussie sans retry.
Le contrôle normal séparé
`pnpm --filter @gestschool/web test:e2e e2e/lot1.spec.ts --project=768x1024 --grep 'renders every LOT 1 page'`
passe ensuite : **1/1, sans retry** (`navigation-final.log`).

Fin d'intervention : les services CI isolés sont arrêtés avec leurs volumes conservés.
Les serveurs DEV sont relancés : `/health/live` et `/health/ready` répondent `ok`, les
trois dépendances sont `up`, `/fr/login` répond HTTP 200 et le worker se déclare prêt.
Le fichier Next.js généré `next-env.d.ts` retrouve son état initial ; il ne fait pas
partie du correctif. Le formatage, le lint et `git diff --check` ont été revérifiés.

La nouvelle CI GitHub ne peut pas être déclarée verte avant publication du correctif et
exécution distante. Aucun commit ni push n'est effectué par cette intervention.

Commit proposé : `fix(e2e): stabilize people locators and retry-safe auth fixtures`.
