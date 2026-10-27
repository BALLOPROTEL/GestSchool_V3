# LOT14 — hook API ponctuel, OFF par défaut

État final : bootstrap **PASS réel**, deux tenants / huit comptes ; certification Tenant A/B **14 PASS / 0 FAIL / 0 SKIP**, worker report completed et verdict runner PASS confirmés par l'opérateur sur `39f5cc2`. `LOT14_BOOTSTRAP_APPLY=false` et `LOT14_CERTIFICATION_RUN=false` restent l'état normal. Aucun rejeu demandé. Voir [le rapport final](../lot14-certification.md).

## Contrats et historique de préparation

Le bootstrap A/B existant est réutilisé sans duplication de SQL. La commande Render API reste `node apps/api/dist/main.js` et la commande de build reste `pnpm install --frozen-lockfile --prod=false && pnpm --filter @gestschool/api... build`. Aucun changement de configuration Render ni déploiement n'est réalisé pour préparer ce hook.

## Activation explicite

Seule `LOT14_BOOTSTRAP_APPLY` commande le hook :

| Valeur                                             | Comportement                                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Absente                                            | Aucun child, aucun bootstrap ou log du hook, démarrage API normal                                                                                         |
| `false`                                            | Même comportement, y compris hors staging                                                                                                                 |
| `true`                                             | Autorisé uniquement avec APP_ENV=staging, NODE_ENV=production, IAM_ENV=staging et APP_PUBLIC_ORIGIN exactement `https://gestschool-v3-staging.vercel.app` |
| Toute autre chaîne, y compris vide ou avec espaces | Refus du démarrage avant création Nest/écoute HTTP                                                                                                        |

`APP_ENV=production` ne permet jamais l'activation. Le bootstrap impose en plus ses propres gardes de cible DB V3 staging, TLS verify-full, preuve de stabilité, credentials distincts et collisions non ambiguës. Il utilise uniquement l'environnement existant du runtime ; aucun fichier de credentials n'est chargé, aucune valeur n'est copiée dans des arguments ou journalisée.

Le flag reste **OFF par défaut**. Cette livraison ne l'active pas dans Render. Une future activation ponctuelle devra se faire dans le seul service API staging après revue opérateur, avec les huit variables secrètes déjà injectées dans son store, selon [le runbook A/B](staging-bootstrap-ab.md). Aucun password/TOTP/token dans Git ou le chat.

## Ordre de démarrage et child

`main.ts` attend le hook avant `NestFactory.create` et avant toute écoute HTTP. Le hook lance directement `process.execPath` avec deux arguments fixes : le chemin absolu de `scripts/staging-bootstrap.mjs` et `--apply`. Le cwd est la racine du dépôt calculée depuis le module compilé, pas un chemin de travail supposé. **Aucun shell** et aucun secret dans les arguments.

Le child est borné à **120 secondes**, `killSignal=SIGKILL`, buffers stdout/stderr limités à **16 Kio**. Node execFile rappelle le parent après terminaison du child et fermeture des pipes. Pendant le hook, SIGTERM/SIGINT tuent aussi le child ; le parent attend sa terminaison avant de refuser le démarrage. Les handlers temporaires sont ensuite retirés. Un échec de lancement, un exit non-zero, un dépassement de buffers, un timeout ou un arrêt interrompu n'autorise jamais la création de l'API.

Le parent ne retransmet jamais stdout/stderr bruts ni l'objet d'erreur. Même un exit 0 doit contenir un unique JSON `check=LOT14_BOOTSTRAP`, `status=PASS`, `created` booléen. Seuls ces constantes et ce booléen sont reconstruits pour le log. Les champs additionnels sont ignorés, une sortie inattendue ou un faux PASS est refusé. En cas d'échec, main imprime uniquement :

```json
{ "check": "LOT14_BOOTSTRAP_STARTUP", "status": "FAIL", "code": "LOT14_BOOTSTRAP_STARTUP_FAILED" }
```

puis termine avec code 1, sans driver error, URL DB, password, hash, token ou secret MFA. Aucun secret ne doit quitter Render. Le hook ne crée aucune nouvelle surface HTTP.

## Redémarrage et idempotence

Si le flag reste accidentellement `true`, le même script retrouve l'état exact possédé, vérifie identities/memberships/grants et les credentials fournis, puis renvoie PASS / `created=false` sans réécrire passwords, MFA ou données. Une collision ambiguë refuse le démarrage ; le hook ne répare ou ne nettoie rien. Ne jamais désactiver des garde-fous ou effectuer une rotation automatique pour contourner ce refus.

Après un succès vérifié en staging, la future opération normale sera de remettre le flag à `false` ou de le retirer. Cette préparation n'effectue ni activation ni application ni redéploiement. Tenant A/B et worker E2E distants restent à certifier.

## Validation

Le hook et l'intégration du point d'entrée API sont couverts par 35 tests déterministes : absent/false, valeurs invalides, refus production/dev/cible non exacte, succès et idempotence, sortie non-zero, timeout, buffers, erreurs de lancement, signaux/cleanup, absence de fuite dans les logs/arguments et démarrage API strictement postérieur au PASS. Les dix tests bootstrap existants sont conservés et le hook est ajouté à security:test.

La recertification vérifie également la commande de build Render exacte et les artefacts nécessaires : hook compilé, main API, crypto IAM et contrats compilés, script bootstrap et preuve JSON. Le smoke de runtime ne fait qu'importer les artefacts et appeler le hook désactivé ; le script bootstrap n'est exécuté qu'en mode plan hors ligne. Aucune application staging n'est réalisée par les tests.

Résultats de validation de cette livraison :

| Contrôle                                                    | Résultat                  |
| ----------------------------------------------------------- | ------------------------- |
| Tests hook et ordre de démarrage API                        | 35 PASS                   |
| Tests bootstrap existants, inchangés                        | 10 PASS                   |
| security:test                                               | 321 PASS                  |
| Unités globales                                             | 607 PASS                  |
| Typecheck / lint / format                                   | PASS                      |
| Commande de build Render exacte                             | PASS                      |
| Imports des artefacts compilés, hook OFF et plan hors ligne | PASS                      |
| Build global                                                | PASS, 9 tâches sans cache |
| Scan de signatures de secrets                               | 0 finding                 |
| git diff --check                                            | PASS                      |

Les sous-suites sont incluses dans les totaux globaux et ne s'additionnent pas. Le cache pnpm de l'exécutant Cloud a été redirigé dans le workspace pour respecter son sandbox ; la commande Render et la configuration du dépôt restent inchangées. Aucun bootstrap staging, déploiement, activation de flag Render, changement V2, merge, tag GO ou travail LOT15 n'a été effectué. Le flag est toujours OFF par défaut.
