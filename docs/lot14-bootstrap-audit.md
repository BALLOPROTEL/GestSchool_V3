# LOT14 — checkpoint stabilité et audit bootstrap

Base du checkpoint : `eb0d3654551f39ba3b6d7a01b71bd003c693e7a9`, branche `feat/lot14-staging-certification`.

## Preuve worker finalisée : PASS

26 octobre 2026, 20:35:57–20:45:58 Europe/Paris : **21 checks, 21 HTTP 200, 0 HTTP 503, 0 erreur transport**, latences min/médiane/max **238/474/1 257 ms**. Le propriétaire confirme la corrélation Render : zéro `POSTGRES_HEALTH_*`, zéro `Worker dependencies unavailable (...)`, donc aucun état postgres/redis/storage down observé sur la fenêtre. La source de cette corrélation est explicitement opérateur ; la collecte HTTP est celle de cette session.

**Le retry existe, mais n'a pas été exercé pendant cette fenêtre. Aucune récupération réelle n'est revendiquée.** Détails et mesures brutes dans [le rapport](lot14-worker-stability-eb0d365.md) et son JSON.

## Audit bootstrap : PASS après corrections

Le candidat précédent ne satisfaisait pas l'idempotence : il refusait même une fixture déjà créée correctement. Il ne prévoyait pas non plus PARENT/STUDENT. Ces écarts sont corrigés avant publication du checkpoint.

| Exigence                        | Vérification                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staging uniquement              | APP_ENV=staging, IAM_ENV=staging, NODE_ENV=production, origine V3 exacte ; APP_ENV=production ou contexte dev/local refusés                                   |
| Base V3 staging                 | Hostname, nom, port et TLS verify-full exacts ; current_database vérifié avant transaction ; V2 refusée                                                       |
| Pas de dev-access / seed DEV    | Aucun import ou appel de ces outils ; seulement crypto et IAM standards, SQL dédié                                                                            |
| Exactement deux tenants fictifs | Slugs fixes lot14-certification-a/b ; marqueur d'appartenance dans leurs settings                                                                             |
| Comptes nécessaires             | Huit comptes réservés example.invalid : SCHOOL_ADMIN, TEACHER, PARENT, STUDENT dans chaque tenant                                                             |
| Idempotence                     | Second lancement conforme PASS/created=false, uniquement lectures/verrou transactionnel, sans reset de hash ou MFA                                            |
| Collision ambiguë               | Marqueur, identité, password, membership ou grants incohérents : rollback/refus, aucune réparation                                                            |
| Rôles et MFA                    | Rôles TENANT avec grants canoniques, zéro PLATFORM/SYSTEM/SUPER_ADMIN ; enrôlement MFA normal des admins, existant conservé                                   |
| Secrets                         | Huit passwords distincts injectés uniquement par le runtime opérateur ; Argon2id IAM ; aucun secret/token/MFA dans les sorties ou artefacts versionnés        |
| Données réelles / V2            | Aucun UPDATE/DELETE de données existantes ; les collisions sont refusées ; aucune connexion V2                                                                |
| Messagerie                      | Aucun appel Brevo/WhatsApp, aucun token d'activation ou outbox/session créé                                                                                   |
| Assertions post-application     | Avant COMMIT, inventaire exact des deux tenants, huit identités/memberships/rôles, vérification passwords et grants, cohérence MFA, aucune membership croisée |

Le contrôle local SQL crée sa propre base jetable, applique les 14 migrations sans seed DEV, utilise les composants IAM réels pour vérifier passwords/MFA/scopes, teste le rerun sans mutation puis le refus de collision. La base est supprimée ensuite. Il ne vaut pas application staging ni E2E distant.

Commandes pertinentes :

```sh
node --test scripts/staging-bootstrap.test.mjs
LOT14_BOOTSTRAP_LOCAL_TEST=1 node --env-file=.env.example scripts/staging-bootstrap-local-check.mjs
```

Les dix tests de garde-fous et l’intégration locale sont PASS. La suite complète security:test compte **286 PASS** ; lint, format, scan de signatures de secrets (zéro finding) et git diff --check passent. Le test de garde-fous est inscrit dans security:test. Voir [le runbook](deployment/staging-bootstrap-ab.md) pour les noms des huit variables secrètes et le mode plan/apply sans valeurs de credentials.

## Application et tests distants

La session ne dispose d'aucune identité/secrets/runtime variables configurés ni d'outil d'exécution Render. Les lectures publiques HTTPS et l'autorisation Git push ne fournissent pas un accès SQL ou une session IAM staging. Il est interdit d'inférer les credentials, de les extraire de fichiers secrets ou de les demander dans le chat. L'application ne peut pas être attestée depuis ce contexte sans runtime opérateur V3 staging avec secrets injectés.

Le checkpoint peut donc être publié, mais aucune assertion sur les tenants existants en staging ou sur leur création ne sera inventée. Le préflight de l'outil doit refuser ce contexte avant toute connexion/écriture. En cas d'accès disponible ultérieurement, la transaction inspecte explicitement les slugs/emails concernés, refuse les collisions et produit uniquement des assertions et compteurs sûrs. Aucun hash, password ou secret MFA n'est exposé.

Matrice distante prévue, distincte des tests locaux :

| Parcours                         | Résultat | Motif                                                        |
| -------------------------------- | -------- | ------------------------------------------------------------ |
| A ne lit pas B                   | SKIP     | Bootstrap et sessions staging indisponibles                  |
| B ne lit pas A                   | SKIP     | Même blocage                                                 |
| UUID/IDOR                        | SKIP     | Même blocage                                                 |
| SCHOOL_ADMIN tenant-only         | SKIP     | Même blocage                                                 |
| TEACHER scope assigné            | SKIP     | Même blocage                                                 |
| PARENT enfants uniquement        | SKIP     | Même blocage ; liens fictifs à créer par API                 |
| STUDENT données propres          | SKIP     | Même blocage ; profil fictif à créer par API                 |
| People cross-tenant              | SKIP     | Même blocage                                                 |
| Academic cross-tenant            | SKIP     | Même blocage                                                 |
| Enrollments cross-tenant         | SKIP     | Même blocage                                                 |
| Finance cross-tenant             | SKIP     | Même blocage                                                 |
| Results cross-tenant             | SKIP     | Même blocage                                                 |
| Documents cross-tenant           | SKIP     | Même blocage                                                 |
| Reports cross-tenant             | SKIP     | Même blocage                                                 |
| Worker E2E document/report privé | SKIP     | Requiert Tenant A/B PASS et fixture/auth staging disponibles |

**Tenant A/B : 0 PASS / 0 FAIL / 14 SKIP. Worker E2E : 0 PASS / 0 FAIL / 1 SKIP.** Aucun de ces parcours n'a été exécuté ; SKIP signifie bloqué, jamais PASS implicite. Aucun email réel ou WhatsApp envoyé.

Verdict global **NO-GO LOT14** tant que bootstrap, isolation/auth et worker E2E distants ne sont pas certifiés. Aucun merge, tag lot-14-go, changement V2, production finale ou LOT15.

## Fichiers du checkpoint

- `scripts/staging-bootstrap.mjs` : plan, garde-fous, application et vérification idempotente.
- `scripts/staging-bootstrap.test.mjs` : dix tests de sécurité et idempotence.
- `scripts/staging-bootstrap-local-check.mjs` : intégration SQL/IAM locale jetable sans seed DEV.
- `scripts/security-test.mjs` : inscription du bootstrap dans la recertification sécurité.
- `docs/deployment/staging-bootstrap-ab.md` : procédure opérateur sans credentials.
- `docs/lot14-worker-stability-eb0d365.json` : mesures HTTP et corrélation Render avec source opérateur.
- `docs/lot14-worker-stability-eb0d365.md` : certification worker PASS, retry non exercé.
- `docs/lot14-certification.md` et `docs/lot14-staging.md` : points de reprise à jour.
- `docs/lot14-bootstrap-audit.md` : cet audit et résultats/limites de l'exécution distante.
