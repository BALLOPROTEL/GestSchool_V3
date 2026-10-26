# LOT14 — bootstrap staging A/B appliqué et certifié

État final : bootstrap **PASS réel**, deux tenants / huit comptes ; certification Tenant A/B **14 PASS / 0 FAIL / 0 SKIP**, worker report completed et verdict runner PASS confirmés par l'opérateur sur `39f5cc2`. `LOT14_BOOTSTRAP_APPLY=false` et `LOT14_CERTIFICATION_RUN=false` restent l'état normal. Aucun rejeu demandé. Voir [le rapport final](../lot14-certification.md).

## Contrats et historique de préparation

Prérequis HTTP mesuré : [21/21 readiness worker 200 sur dix minutes](../lot14-worker-stability-eb0d365.md), aucun 503 ou échec de transport. La corrélation Render est confirmée par le propriétaire : zéro timeout ou dépendance down observé, retry présent mais non exercé. **Aucune donnée staging n'a été créée par cette préparation.**

## Contenu exact

`scripts/staging-bootstrap.mjs` est un outil opérateur séparé, sans route HTTP. Un [hook API explicite et désactivé par défaut](staging-bootstrap-api-hook.md) permet sa future exécution dans Render sans changer la commande de démarrage. Par défaut et avec `--plan`, l'outil fonctionne hors ligne et ne lit pas les credentials :

```sh
node scripts/staging-bootstrap.mjs --plan
```

| Tenant                  | Identités fictives                                                                                                                      | Rôles                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `lot14-certification-a` | `lot14-a-admin@example.invalid`, `lot14-a-teacher@example.invalid`, `lot14-a-parent@example.invalid`, `lot14-a-student@example.invalid` | SCHOOL_ADMIN, TEACHER, PARENT et STUDENT |
| `lot14-certification-b` | `lot14-b-admin@example.invalid`, `lot14-b-teacher@example.invalid`, `lot14-b-parent@example.invalid`, `lot14-b-student@example.invalid` | SCHOOL_ADMIN, TEACHER, PARENT et STUDENT |

Les huit rôles sont propres à leur tenant, avec les grants canoniques des contrats, sans scope PLATFORM ni rôle SYSTEM/SUPER_ADMIN. Le catalogue global des permissions manquantes peut être complété par insertion uniquement ; aucun grant ou rôle global existant n'est modifié. Aucun étudiant, bulletin, document, message ou autre fixture métier n'est injecté : les prochains E2E doivent exercer les véritables API.

Les mots de passe seront exclusivement injectés dans le store secret du runtime opérateur approuvé, jamais en argument de commande, dans un fichier versionné, dans le chat ou dans les logs :

- `LOT14_BOOTSTRAP_A_SCHOOL_ADMIN_PASSWORD`
- `LOT14_BOOTSTRAP_A_TEACHER_PASSWORD`
- `LOT14_BOOTSTRAP_A_PARENT_PASSWORD`
- `LOT14_BOOTSTRAP_A_STUDENT_PASSWORD`
- `LOT14_BOOTSTRAP_B_SCHOOL_ADMIN_PASSWORD`
- `LOT14_BOOTSTRAP_B_TEACHER_PASSWORD`
- `LOT14_BOOTSTRAP_B_PARENT_PASSWORD`
- `LOT14_BOOTSTRAP_B_STUDENT_PASSWORD`

Huit valeurs distinctes, aléatoires, d'au moins 20 caractères et conformes à la politique IAM réelle sont requises. Le hasher Argon2id de l'API est réutilisé. Aucun mot de passe ou TOTP n'est généré pour être affiché. Les hashs restent en base uniquement. Aucun email Brevo ou WhatsApp n'est envoyé.

Le bootstrap active les identités avec leur hash mais **n'écrit aucun secret ou état d'activation MFA**. SCHOOL_ADMIN doit passer par l'enrôlement MFA applicatif normal au premier login ; aucun raccourci, TOTP fixé ou session précréée. L'opérateur conserve les credentials et l'enrôlement dans son gestionnaire de secrets, en dehors des artefacts de test.

## Garde-fous et exécution ultérieure

Le candidat est revu, testé localement et destiné au checkpoint demandé. Il doit être disponible dans un runtime opérateur V3 staging avec secrets injectés avant l’application. Le push du checkpoint ne signifie pas que le bootstrap a été appliqué. Utiliser les commandes normales de build du dépôt pour disposer des contrats et du crypto IAM compilés. Ne pas remplacer la commande de démarrage API/worker ; aucune exécution implicite n'est ajoutée. Le hook API n'exécute l'outil que si LOT14_BOOTSTRAP_APPLY vaut exactement true dans l'environnement staging validé.

La commande d'application ultérieure est explicite, sans secret dans ses arguments :

```sh
node scripts/staging-bootstrap.mjs --apply
```

Elle exige APP_ENV=staging, NODE_ENV=production, IAM_ENV=staging, l'origine web V3 exacte, la base Render V3 staging et son hostname déjà inscrits dans le lanceur, port 5432 et `sslmode=verify-full` sans autre paramètre. V2, localhost, production, une autre base et TLS affaibli sont refusés avant connexion. `current_database()` est vérifié après connexion. Le fichier de preuve exige le SHA mesuré, au moins 21 checks / dix minutes, tous 200 et aucun autre échec. Avant application, vérifier à nouveau la santé courante et les logs Render ; la preuve historique n'est pas un monitoring permanent.

La transaction utilise un verrou opérateur, refuse toute collision avec les slugs ou emails de la fixture et crée les deux tenants, leurs settings, huit users/identités/memberships/rôles et les audits. Elle ne met jamais à jour ou ne réinitialise une identité existante. Un second lancement est idempotent si et seulement si l’état correspond exactement à la fixture possédée : marqueur, noms/statuts, huit identités activées avec passwords vérifiables, memberships non croisés, rôles/grants canoniques et état MFA cohérent. Il renvoie PASS / created=false sans INSERT/UPDATE/DELETE. L’état MFA déjà enrôlé est conservé. Une collision partielle, ambiguë, un credential différent, un rôle ou grant inattendu entraîne un refus ; aucune rotation ou réparation silencieuse. Les erreurs exposées sont des codes fixes sans message driver, SQL paramétré sensible, URL ou hash.

Un échec pendant COMMIT peut laisser un résultat transactionnel indéterminé côté client : le code renvoie `BOOTSTRAP_FAILED_INSPECT_STATE`. Inspecter les seuls slugs/compteurs publics de la fixture avant toute nouvelle tentative ; ne pas supposer que le serveur n'a rien créé. Aucun retry automatique ou nettoyage destructif.

## Validation de préparation

Les dix tests `node --test scripts/staging-bootstrap.test.mjs` passent : plan hors ligne, refus des cibles/TLS, preuve de stabilité obligatoire, credentials distincts, transaction, collision/rollback, absence de grants plateforme et de fuite dans les diagnostics, arguments CLI fermés.

Une vérification SQL réelle a également réussi sur une **base locale jetable**, créée pour ce contrôle, avec les 14 migrations, sans seed DEV : deux tenants, huit users, vérification des hashs via le Passwords IAM réel, MFA obligatoire des admins via le MembershipsService réel, absence de liens inter-tenant, de rôles SYSTEM, de sessions ou d'outbox, second bootstrap idempotent sans modification des hashs, puis refus d’un marqueur incohérent. La base a été supprimée après le contrôle ; les credentials aléatoires n'ont existé qu'en mémoire. Ce contrôle est reproductible uniquement avec une connexion locale autorisée :

```sh
LOT14_BOOTSTRAP_LOCAL_TEST=1 node --env-file=.env.example scripts/staging-bootstrap-local-check.mjs
```

Ce test crée et supprime uniquement sa propre base au nom aléatoire préfixé ; il refuse les hôtes distants. Il ne prouve pas une application du bootstrap sur Render ni un E2E A/B distant. L'exécution staging, les parcours auth/MFA/RBAC/isolation et le worker E2E restent à effectuer ensuite. Aucune modification supplémentaire du healthcheck.

L’audit détaillé et les limites d’exécution distante sont consignés dans [le checkpoint LOT14](../lot14-bootstrap-audit.md). La création des données métier fictives et des liens parent/enfant ou étudiant/profil reste à exercer via les API normales pendant les E2E, sans injecter de seed DEV.
