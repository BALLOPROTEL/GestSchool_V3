# LOT14 — Certification finale du MVP staging

Verdict : **GO STAGING FONCTIONNEL**.

Revue : **EN ATTENTE DE MERGE FINAL**. Aucun merge de la PR ni tag `lot-14-go`
n'est autorisé par ce checkpoint. Le MVP est certifié dans le périmètre staging
ci-dessous. Aucun établissement réel ne doit être onboardé dans cet état.

## SHA certifié et origine des preuves

SHA applicatif du second run Render :
`39f5cc20aa1c429210a6ab18597e218a1b693e88`, branche
`feat/lot14-staging-certification`. Le checkpoint de clôture modifie uniquement la
documentation ; il n'introduit aucun changement de comportement ni déploiement.

Le propriétaire confirme les résultats du run réel du **26 octobre 2026** et
l'état final API/worker. Leurs heures précises de début/fin ne sont pas fournies
et ne sont pas inventées. Les logs bruts Render et credentials restent dans
Render. Le [manifeste sûr](lot14-final-evidence.json) transcrit cette confirmation,
sans la présenter comme une nouvelle collecte distante depuis ce workspace.

Les 49 smoke et la fenêtre de stabilité ont été collectés séparément aux SHA
mentionnés dans leurs rapports. Ils ne sont pas présentés comme un rejeu sur le
SHA du second runner. Le SHA actuellement déployé de chaque service n'est pas
inféré à partir d'une readiness publique qui ne l'expose pas.

## Architecture et preuves consolidées

| Élément                        | État certifié et limite                                                                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel                         | Projet V3 staging Hobby dédié, pages FR/EN/AR, HTTPS, headers, cookies et rewrite API ; [49 smoke distants](lot14-remote-certification-2026-10-26.md) : 49 PASS / 0 FAIL / 0 SKIP.                                  |
| Render API                     | Runtime staging existant ; bootstrap et runner ponctuels via hooks explicites, commandes normales conservées ; état final `status=ok`, postgres/redis/storage up confirmé par l'opérateur.                          |
| Render worker                  | Web Service Free existant ; workflow E2E report PASS / terminal completed et état final `status=ok`. Aucun consumer de substitution dans le runner.                                                                 |
| PostgreSQL                     | Render PG18 staging, TLS verify-full ; 14 migrations appliquées et checksums vérifiés, aucun reset ni seed DEV. Offre temporaire, expiration historiquement enregistrée au 23 novembre 2026.                        |
| Upstash Redis                  | Connexion TCP/TLS/auth/PING acquise ; BullMQ réellement traversé par le workflow report. Cela ne certifie pas une capacité ou une durabilité de production.                                                         |
| Supabase Storage               | Projet V3 `rwmuksaafbnphurxaofq`, région eu-west-1, bucket `gestschool-v3-staging-private` privé ; opérations S3 signées/refus anonymes acquis, objet du report relu et téléchargement contrôlé par le runner PASS. |
| Stabilité worker               | [Fenêtre du 26 octobre, 20:35:57–20:45:58 Europe/Paris](lot14-worker-stability-eb0d365.md) : 21 checks, 21 HTTP 200, zéro 503/transport ; latences min/médiane/max 238/474/1 257 ms.                                |
| Bootstrap A/B                  | PASS réel / created=true confirmé : deux tenants distincts et huit comptes synthétiques, memberships et rôles dédiés ; MFA privilégié normal, aucun dev-access ni seed DEV.                                         |
| Inventaire avant certification | `LOT14_AUTH_STATE=PASS`, tenants=2, users=8, memberships=8, activeSessions initiales=0.                                                                                                                             |
| Auth/MFA/sessions              | Login, enrôlement/challenge MFA normal, refresh, contrôles de profil et révocation des sessions du run font partie du chemin HTTP réellement passé. Aucun bypass IAM ou Redis.                                      |
| Tenant A/B                     | 14 PASS / 0 FAIL / 0 SKIP, détails ci-dessous.                                                                                                                                                                      |
| Worker E2E                     | `LOT14_WORKER_E2E=PASS`, workflow=report, terminal=completed ; `LOT14_CERTIFICATION=PASS`.                                                                                                                          |
| État après retour OFF          | API et worker healthy confirmés ; aucun runner rejoué après OFF. Aucun email réel non autorisé, WhatsApp staging interdit.                                                                                          |

Les détails du runner et de ses assertions sont dans le
[runbook de certification](deployment/staging-certification-runner.md). Les noms
provider/ressources de cette architecture sont dans [l'architecture](lot14-staging.md)
et le [runbook staging](deployment/staging.md).

## Matrice distante Tenant A/B

| Scénario            | Résultat |
| ------------------- | -------- |
| A_CANNOT_READ_B     | PASS     |
| B_CANNOT_READ_A     | PASS     |
| UUID_IDOR           | PASS     |
| ADMIN_TENANT_SCOPE  | PASS     |
| TEACHER_ASSIGNMENTS | PASS     |
| PARENT_CHILDREN     | PASS     |
| STUDENT_OWN         | PASS     |
| PEOPLE              | PASS     |
| ACADEMIC            | PASS     |
| ENROLLMENTS         | PASS     |
| FINANCE             | PASS     |
| RESULTS             | PASS     |
| DOCUMENTS           | PASS     |
| REPORTS             | PASS     |

**14 PASS / 0 FAIL / 0 SKIP**, source : confirmation opérateur du second run Render.
Les fixtures passent par les API normales. Les assertions empruntent les vraies
routes Nest, avec contrôles positifs et refus attendus précis ; un 5xx ne vaut
jamais preuve d'isolation. Le périmètre couvre les routes et données synthétiques
énumérées par le runner, sans prétendre couvrir tous les endpoints/états métier.

## Worker E2E report

Le PASS intervient seulement après les 14 PASS Tenant A/B :

API → PostgreSQL/outbox → Redis/BullMQ → worker Render → stockage privé → terminal.

Les assertions du runner exigent une demande créée par API, la même réponse sur
répétition de sa clé d'idempotence, un outbox PROCESSED, un job BullMQ completed,
un export métier READY, une seule tentative et un audit de génération unique.
Taille/checksum/contenu de l'objet et octets téléchargés sont comparés ; accès du
bon tenant autorisé, accès B refusé, lectures anonymes S3/publique refusées.
L'absence de double traitement apparent concerne ce job ; elle ne constitue pas
une garantie universelle d'exactly-once. Aucun email ni WhatsApp n'est requis.

## Incident historique AUTH_UNAVAILABLE

Premier run sur `8c2d09e` : AUTH_UNAVAILABLE, 0 PASS / 14 FAIL / 0 SKIP, worker SKIP.
La cause exacte historique **n'a jamais été démontrée**. Les anciens logs ne
fournissent ni route ni statut HTTP ; l'ordre d'affichage du child ne résout pas
cette absence. Il ne s'agit pas d'une preuve de 14 défauts RBAC indépendants.

Le second run, avec les diagnostics de `39f5cc2`, passe entièrement. Ce succès ne
prouve aucune cause rétroactive, ni récupération d'un timeout particulier.
Les diagnostics sûrs restent en place pour les futures observations. Le
[rapport de diagnostic historique](lot14-auth-unavailable-diagnostic.md) conserve
le requestId, les hypothèses, les reproductions locales et leurs limites.

## PostgreSQL readiness et dépendances critiques

Des `POSTGRES_HEALTH_CONNECT_TIMEOUT` transitoires ont réellement été observés,
avec une durée d'environ 2 002 ms. Le correctif `eb0d365` conserve 2 secondes par
phase/tentative, ajoute une **seule seconde tentative**, avec un client neuf et un
backoff de **200 ms**, uniquement après CONNECT_TIMEOUT. Aucun retry pour TLS,
auth/connexion hors timeout, QUERY_TIMEOUT ou QUERY_ERROR.

Seul un succès réel `SELECT 1` donne up. Deux tentatives expirées donnent down et
HTTP 503. Nettoyage des clients et durée totale bornés, aucune boucle infinie,
aucune erreur brute ni URL DB dans les diagnostics. Redis et storage restent
critiques : leur panne ferme également la readiness. Aucune disponibilité
permanente de PostgreSQL n'est revendiquée.

La fenêtre stable n'a observé aucun timeout PostgreSQL ; le retry existe mais n'y
a pas été exercé. **Aucune récupération réelle par retry n'est revendiquée.**
Le [diagnostic initial](lot14-postgres-readiness.md) et les
[mesures de stabilité](lot14-worker-stability-eb0d365.json) restent conservés.

## Flags et credentials

État normal confirmé par l'opérateur :

```text
LOT14_BOOTSTRAP_APPLY=false
LOT14_CERTIFICATION_RUN=false
```

Les deux hooks sont OFF par défaut et doivent rester OFF en fonctionnement
normal. Le retour OFF n'a déclenché aucun rejeu. Aucun flag ni commande Render
n'est modifié par cette clôture. Le diagnostic de build Storage est également
acquis comme désactivé après ses sondes.

Les huit credentials synthétiques restent exclusivement dans le runtime Render.
Aucune valeur de password, TOTP, token, cookie, clé IAM ou connexion secrète ne
figure dans les preuves, rapports, Git ou logs de cette clôture. Les diagnostics
ne contiennent que constantes, compteurs, durées et IDs de corrélation sûrs.

## Pourquoi ce GO n'est pas un GO production

Ces prérequis sont transférés au **backlog LOT15 / Not started** et ne bloquent
pas le GO du MVP staging dans les limites explicitement acceptées :

- Render Free peut dormir, redémarrer et atteindre ses quotas ; un job Redis
  n'éveille pas automatiquement un worker Web endormi.
- PostgreSQL Free staging est temporaire et ne convient pas à une exploitation
  durable ; préparer une base pérenne, sa capacité et son cycle de vie.
- Aucune haute disponibilité n'est certifiée pour DB, Redis/queues, API ou worker.
- Sauvegardes/restauration de production, rétention et RPO/RTO restent à certifier.
- Prévoir Redis et queues durables, quotas/évictions, reprise et supervision.
- Monitoring/alerting, réponse aux incidents et procédures opérateur restent à finaliser.
- Charge, capacité et saturation en conditions réelles ne sont pas certifiées.
- La CSP garde `unsafe-inline` pour Next/next-themes/styles ; la dette reste
  documentée et une stratégie nonce/hashes doit être évaluée puis recertifiée.
- Le webhook Brevo utilise un bearer dédié, sans signature du corps revendiquée.
  Livraison externe, retours provider et destinataire explicitement autorisé
  restent à certifier. Aucun email réel n'est assimilé au report E2E passé.
- Les limites Supabase Free, clés serveur à portée projet, isolation du projet V3,
  proxy/IP client et contrôles de moindre privilège restent à revoir pour l'exploitation.
- Le validateur d'URL ne protège pas seul contre le DNS rebinding ; toute future
  capacité de fetch utilisateur devra avoir sa propre revue réseau.
- **Aucun établissement réel ne doit être onboardé dans cet état.**

Voir la [checklist opérateur future](security-production-checklist.md) et
[l'issue LOT15 en backlog](https://github.com/BALLOPROTEL/GestSchool_V3/issues/66).
Cette clôture ne commence aucune implémentation LOT15 et ne crée aucune ressource payante.

## Dette fonctionnelle Students report

Le filtre **`studentId` du rapport Students est ignoré** par son SQL de liste.
Le runner LOT14 utilise volontairement **`classId`** pour son contrôle positif et
son export ; le refus d'un studentId étranger reste exercé. Cette anomalie est
conservée et aucun correctif silencieux n'est intégré à la clôture.

Priorité **P2 fonctionnelle** : résultats plus larges que le filtre demandé à
l'intérieur du scope autorisé. Trier avant LOT15 et corriger avant acceptation
pour un usage réel ; reclasser P1 si un impact de confidentialité hors scope est
démontré. La certification ne revendique pas la correction de ce filtre.

## Revue locale, GitHub et clôture

La recertification locale finale et son bilan sont consignés dans
[le checkpoint local](lot14-final-local-validation.md). Les résultats acquis de
staging et ceux rejoués localement restent distingués.

Suivi : [LOT14 — Certification finale / GO staging à clôturer](https://github.com/BALLOPROTEL/GestSchool_V3/issues/65).
Le workflow CI s'exécute sur PR vers main ; aucune CI de branche n'existait avant
création de cette PR. Le rapport final donnera le lien et l'état exact des checks.
L'intégration refuse Projects : les colonnes Kanban ne sont pas vérifiables ni
modifiées ; les issues de suivi portent les états explicites.

Aucun merge, tag `lot-14-go`, changement V2, début LOT15 ou ressource payante.
Les anciens NO-GO/NOT RUN restent dans les archives
[certification](lot14-certification-history.md),
[architecture](lot14-staging-history.md) et
[déploiement](deployment/staging-history.md), avec les mesures historiques intactes.
