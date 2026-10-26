# LOT14 — diagnostic du premier échec du runner Render

Base : `8c2d09edd7f93fd3b56c6251978f3245d8f002db`, branche
`feat/lot14-staging-certification`. **NO-GO maintenu.** Le flag
`LOT14_CERTIFICATION_RUN` a été remis à `false` par l'opérateur et n'est pas
réactivé dans ce travail. Aucun changement de timeout, retry, MFA ou donnée staging.

## Preuve disponible et limite d'attribution

Champs fournis par l'opérateur pour le premier échec :

- UTC : `2026-10-26T21:43:27.515889714Z` ; Paris : 26 octobre 2026, 22:43:27.
- `requestId` : `309358a7-3873-4171-84cf-cdbc3a5245de`.
- Code applicatif : `AUTH_UNAVAILABLE`.
- Route et statut HTTP : indisponibles ; journaux Render `app` et `build` seulement.
- Matrice distante : **0 PASS / 14 FAIL / 0 SKIP** ; worker E2E : **SKIP**.

Le `requestId` identifie la ligne, mais aucune trace supplémentaire disponible ne
la relie à une route ou à une étape du runner. Ces résultats ne démontrent pas
14 défauts RBAC indépendants. Le compteur seul ne distingue pas une préparation
échouée d'un prérequis commun tombé pendant les assertions.

**La requête et l'exception internes de cet incident restent non attribuables.**
Ni login, ni MFA, ni refresh, ni Redis, ni PostgreSQL ne sont revendiqués comme
cause réelle. Aucune preuve de timeout transitoire n'est disponible, donc aucun
retry ou ajustement de délai n'est justifié.

Le child écrit sa matrice avant le nettoyage, mais le parent ne la publie qu'après
la fin du child. Une erreur API visible « juste avant la matrice » dans Render
peut donc provenir d'une préparation, d'un scénario, du nettoyage, voire d'une autre
requête. L'ordre d'affichage ne fournit pas la corrélation manquante.

Le contexte Cloud n'expose aucun accès Render d'exécution ni credentials staging.
Aucun secret n'a été demandé ou extrait ; aucune lecture distante des huit comptes
ou des sessions n'est revendiquée dans cette analyse.

## Toutes les émissions et conversions trouvées

| Source                              | Conversion exacte                                                                                                                                       | Contrat public conservé                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `RateLimiter.check`                 | Exception non `IamError` pendant EVAL du budget IP/identité ou son traitement local ; les refus 429 sont propagés                                       | `AUTH_UNAVAILABLE`, HTTP 503                                                        |
| `RateLimiter.checkTenantAction`     | Exception non `IamError` sur le budget Redis d'une action tenant                                                                                        | `AUTH_UNAVAILABLE`, HTTP 503                                                        |
| `IamExceptionFilter` global         | Toute exception non `IamError` ne relevant pas des mappings 400/404/413/415 ; inclut erreurs Prisma, crypto et `HttpException` de modules autres qu'IAM | Erreur inconnue : 500 ; `HttpException` : statut original ; code `AUTH_UNAVAILABLE` |
| Web `auth-client` / `people-client` | Réponse sans code exploitable, ou échec de la requête CSRF                                                                                              | Fallback d'interface, pas une preuve de l'exception API                             |
| Web pages auth / portal shell       | Erreur non typée ou traduction de fallback                                                                                                              | Message utilisateur traduit                                                         |
| Messages FR/EN/AR                   | Traductions de la clé                                                                                                                                   | Aucune émission backend                                                             |

Le filtre est réellement global : un `ServiceUnavailableException` de
`/health/ready` peut également produire `AUTH_UNAVAILABLE` / HTTP 503. Une
reproduction locale par le vrai HTTP Nest le vérifie. Le préfixe de logger IAM
ne prouve donc pas qu'il s'agissait d'un endpoint d'authentification.

## Correction d'observabilité

Le contrat public reste `{code,status,requestId}`. Le journal serveur 5xx contient
désormais seulement ces champs sûrs et des constantes/mesures internes :

- `operation` : LOGIN, MFA_ENROLL, MFA_CONFIRM, MFA_VERIFY, REFRESH, PROFILE,
  CSRF, LOGOUT, READINESS, LIVENESS ou OTHER ; jamais le chemin arbitraire. Le template statique Nest/Express et la méthode sont aussi conservés après validation stricte ; aucun paramètre de route ni query string.
- `diagnostic` : `LOT14_AUTH_REDIS_UNAVAILABLE`, `LOT14_AUTH_DB_UNAVAILABLE`,
  `LOT14_AUTH_TRANSACTION_ERROR`, `LOT14_AUTH_HTTP_EXCEPTION` ou
  `LOT14_AUTH_INTERNAL_ERROR`.
- `reason` : allowlist fixe, notamment CLIENT_CLOSED, CLIENT_OFFLINE,
  CONNECT_TIMEOUT, SOCKET_CLOSED, COMMAND_REJECTED, TLS_ERROR, CONNECTION_ERROR,
  POOL_TIMEOUT, OPERATION_TIMEOUT, TRANSACTION_API_ERROR, DB_OPERATION_ERROR,
  DB_VALIDATION_ERROR, HTTP_EXCEPTION, UNKNOWN.
- Durée HTTP ; pour les opérations IAM observées, durée de la requête DB et/ou
  de la transaction, avec un nom d'opération fixe. L'exception originale est
  propagée sans altérer les transactions, les retours ou les statuts.

La source Redis est connue au point de capture du rate limiter. Les classes Redis
réelles distinguent fermeture/offline/connexion/EVAL ; un nom d'erreur arbitraire
n'est pas considéré comme preuve. Les classes Prisma réelles et les frontières
DB observées identifient une erreur DB. Un échec crypto dans une transaction
n'est pas automatiquement attribué à PostgreSQL.

`P2028` signifie erreur d'API transactionnelle et recouvre plusieurs cas : **il
n'est jamais renommé en timeout** sur cette seule base, même après 15 secondes.
Les codes Prisma explicites P2024/P1002/P1008 permettent respectivement les raisons
POOL_TIMEOUT/CONNECT_TIMEOUT/OPERATION_TIMEOUT. Ils ne déclenchent aucun retry.
Un échec de l'audit `login.failed` est identifiable comme LOGIN_FAILURE_AUDIT ; il
peut masquer une exception antérieure selon le comportement existant, conservé.

Le runner conserve désormais le code racine, l'étape, le statut et le `requestId`
UUID validé du HTTP en échec, ainsi que le label A/B et le rôle synthétique. Exemple
**de forme**, sans attribuer cet exemple au premier incident :

```json
{
  "check": "LOT14_CERTIFICATION",
  "status": "FAIL",
  "code": "AUTH_LOGIN_UNAVAILABLE",
  "operation": "LOGIN",
  "httpStatus": 503,
  "responseCode": "AUTH_UNAVAILABLE"
}
```

Pour MFA : `AUTH_MFA_UNAVAILABLE` ; pour refresh : `AUTH_REFRESH_UNAVAILABLE`.
Une readiness refusée donne `AUTH_PREREQUISITE_UNHEALTHY`, opération READINESS.
Un timeout du client HTTP est séparé : `AUTH_HTTP_TIMEOUT`, sans inventer de statut
HTTP ni déclarer une panne Redis/PostgreSQL. Les refus 4xx restent
`AUTH_REQUEST_REJECTED` avec leur code public allowlisté. Les anomalies de fixtures
et lectures internes gardent leurs propres codes/étapes.

Le code racine traverse le child, son parseur de sortie et le parent. Les 14 FAIL
sont conservés si la préparation échoue, avec `PREPARATION_FAILED` par cas. Un
scénario réellement commencé garde `ASSERTION_FAILED`. Un `AUTH_UNAVAILABLE` reçu sur une route métier produit `AUTH_API_UNAVAILABLE` / API_REQUEST avec son ID de corrélation ; cette erreur n'est pas renommée en mismatch de fixture. Worker SKIP reste explicite
avec `TENANT_AB_FAILED`. Aucun FAIL n'est converti en PASS/SKIP.

Après inspection exacte du bootstrap réutilisée, `LOT14_AUTH_STATE` publie uniquement
les comptes inspectés (2 tenants, 8 users/memberships), le nombre d'admins MFA
enrôlés, sessions actives/expirées et challenges MFA inutilisés/consommés/expirés.
Les agrégats SQL sont en lecture seule, limités aux tenants LOT14 vérifiés. Aucun
password, seed chiffrée, token ou identifiant utilisateur n'est sélectionné par
cette lecture. Son PASS décrit cet inventaire, pas la réussite du login ou du RBAC.
Le bootstrap ne crée lui-même ni session ni challenge ; un run IAM peut en laisser
sans qu'ils soient réinitialisés ou supprimés par ces diagnostics.

## Hypothèses comparées, sans les transformer en causes

La readiness PostgreSQL utilise son client de santé ; IAM utilise Prisma et ses
transactions. Un PASS du premier ne prouve pas la disponibilité d'une transaction
IAM. Le client Redis de santé et celui du rate limiter sont distincts : PING ne
prouve pas EVAL ni la persistance de la connexion du rate limiter. Celui-ci garde
son connectTimeout de 2 secondes et sa politique sans reconnexion automatique.

La transaction IAM conserve 15 secondes ; la requête loopback du runner conserve
10 secondes. Leur différence peut modifier l'ordre des observations, sans prouver
un timeout dans cet incident. Les durées ajoutées permettront de le constater.

Les huit comptes, memberships ACTIVE, grants et cohérence MFA sont inspectés avant
les fixtures. Le rerun MFA conserve les flux HTTP réels, la protection contre le
rejeu et la lecture interne documentée du seed chiffré des seuls comptes synthétiques.
Les challenges gardent leur durée de 300 secondes et leur consommation normale.
Aucune session/challenge n'est purgé pour obtenir un PASS.

## Reproduction et validation

Les fautes contrôlées locales empruntent le vrai serveur Nest et ses guards :
Redis réellement fermé avant login (503), Prisma P2028 injecté au point transaction
réel de login (500), erreurs DB injectées sur les routes MFA/refresh (500), et
readiness refusée (503). Les `requestId` relient les deux diagnostics ; le contrat
public et l'absence de données sensibles dans les journaux sont vérifiés.

Ces reproductions prouvent des chemins possibles du code, **pas la cause réelle du
premier incident Render**. Les tests locaux normaux exercent aussi MFA initial,
rerun, refresh, les 14 scénarios, les nouveaux agrégats et la révocation des sessions.
Les résultats finaux du checkpoint sont ajoutés après validation complète.

Le prochain run autorisé devra fournir le code racine et son `requestId`, puis la
ligne API avec le même ID, `operation`, `diagnostic`, `reason` et les durées. C'est
cette corrélation qui permettra de décider d'une correction infrastructurelle.
Aucune activation du flag n'est faite ici. Worker E2E distant reste SKIP et le
verdict LOT14 reste NO-GO.

Validation finale de ce checkpoint (locale) :

| Contrôle                                   | Résultat                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Runner, hooks et classification IAM ciblée | 144 PASS / 0 FAIL / 0 SKIP                                                                 |
| IAM HTTP concerné, dont cinq reproductions | 55 PASS / 0 FAIL / 0 SKIP                                                                  |
| Bootstrap existant                         | 10 PASS / 0 FAIL / 0 SKIP                                                                  |
| Harnais Nest HTTP / base jetable           | 14 PASS ; MFA initial/rerun, refresh, compteurs et révocation des sessions vérifiés        |
| `security:test`                            | 496 PASS / 0 FAIL / 0 SKIP                                                                 |
| Unit                                       | 716 PASS / 0 FAIL / 0 SKIP ; tests API réexécutés, cache valide pour les projets inchangés |
| Typecheck, lint, format                    | PASS                                                                                       |
| Build Render exact, build global           | PASS                                                                                       |
| Scan secrets, `git diff --check`           | PASS ; zéro signature secrète                                                              |

Aucune certification distante supplémentaire, aucune écriture staging, aucun
changement de configuration Render. La cause réelle de la ligne historique reste
inconnue ; la correction livrée porte sur son attribution lors d'une observation
ultérieure. Le flag reste OFF par défaut et n'a pas été réactivé.
