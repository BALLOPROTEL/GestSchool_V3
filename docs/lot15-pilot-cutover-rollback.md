# LOT15 — Plan pilote, cutover V3 et rollback V2/V3

Statut : **DRAFT OPÉRATEUR — AUCUN PILOTE RÉEL NI CUTOVER AUTORISÉ**.

Ce document prépare le Gate D du LOT15. Il ne constitue pas une autorisation de production,
d'onboarding d'un établissement réel, de dépense, de changement DNS ni de bascule V2 → V3.

La référence de départ reste le checkpoint `lot-14-go`. GestSchool V2 doit rester intacte et
réutilisable jusqu'à une autorisation explicite du propriétaire/client.

## 1. Principes non négociables

- aucune carte bancaire, ressource payante ou abonnement créé sans validation explicite ;
- aucun établissement réel et aucune donnée réelle avant Gate D ;
- aucune modification destructive de V2 ;
- aucune suppression de base, bucket, queue, backup ou historique pour faciliter une bascule ;
- V3 utilise des ressources et secrets séparés de staging et de V2 ;
- toute communication externe réelle utilise seulement des destinataires explicitement autorisés ;
- WhatsApp réel reste désactivé tant qu'il n'est pas explicitement autorisé ;
- toute anomalie de sécurité, tenant isolation, intégrité ou restauration est un NO-GO ;
- le rollback privilégie la remise en service d'une version connue plutôt qu'une mutation corrective à chaud.

## 2. Préconditions avant toute répétition de pilote

Les éléments suivants doivent être documentés et verts avant d'envisager une répétition de cutover :

- [ ] PR LOT15 revue et CI entièrement verte ;
- [ ] #68 architecture cible et garde-fou zéro coût validés ;
- [ ] #69 backup/restore PostgreSQL validé ;
- [ ] #70 reprise Redis/BullMQ validée ;
- [ ] #71 monitoring/alerting/runbook validé ;
- [ ] #72 hardening production validé ou risques explicitement acceptés ;
- [ ] #73 communications réelles bornées et destinataires autorisés ;
- [ ] #74 filtre Students `studentId` corrigé et re-certifié ;
- [ ] #75 capacité/résilience PASS avec seuils documentés ;
- [ ] aucun secret réel présent dans Git, logs ou artefacts ;
- [ ] aucune dette P0/P1 ouverte ;
- [ ] aucune dette P2 affectant confidentialité, intégrité, disponibilité ou rollback ;
- [ ] sauvegarde/restauration et recovery queues reproductibles depuis une machine propre/CI.

Tant qu'un de ces contrôles n'est pas vert, le statut est **NO-GO PILOTE**.

## 3. Décisions explicites requises pour Gate D

Le propriétaire/client doit approuver explicitement, avant toute ressource finale ou donnée réelle :

1. fournisseur(s) finaux ;
2. budget mensuel maximal et moyen de paiement éventuel ;
3. domaine/DNS final ;
4. établissement pilote, si un pilote réel est autorisé ;
5. périmètre exact des données autorisées ;
6. comptes/utilisateurs autorisés ;
7. destinataires email/communications autorisés ;
8. canal d'alerte et personnes à notifier ;
9. fenêtre de cutover et durée maximale de décision ;
10. plan de rollback et personne autorisée à déclencher le rollback.

L'absence d'une de ces décisions maintient le Gate D fermé.

## 4. Périmètre de répétition avant Gate D

Avant autorisation finale, la répétition utilise uniquement :

- données synthétiques ;
- utilisateurs de test ;
- services locaux/CI ou ressources staging déjà autorisées ;
- aucune charge distante pouvant générer un coût ;
- aucune communication à un destinataire non autorisé ;
- aucune modification DNS ;
- aucune donnée copiée depuis un établissement réel.

Cette répétition valide le **processus**, pas la capacité du futur fournisseur de production.

## 5. Stratégie de cutover

Le cutover réel doit être préparé comme une suite de phases réversibles.

### Phase 0 — gel de décision

Avant la fenêtre :

- vérifier l'absence d'incident SEV1/SEV2 ;
- confirmer la dernière CI verte sur le SHA à déployer ;
- confirmer la disponibilité des sauvegardes et l'exercice de restauration ;
- confirmer l'état PostgreSQL, Redis, storage, API et worker ;
- confirmer les alertes opérateur et le canal d'escalade ;
- confirmer la version V2 connue et réutilisable ;
- noter le SHA V3, l'heure et les personnes présentes.

Aucun changement n'est commencé si une preuve manque.

### Phase 1 — déploiement V3 isolé

- déployer exactement le SHA autorisé ;
- appliquer uniquement les migrations déjà revues et attendues ;
- vérifier `/health/live` puis `/health/ready` ;
- vérifier worker readiness ;
- exécuter les smokes synthétiques autorisés ;
- vérifier que les buckets restent privés ;
- vérifier que les files BullMQ n'accumulent pas de jobs anormaux ;
- vérifier qu'aucun envoi réel inattendu n'est produit.

À ce stade, V2 reste la référence de secours et aucun trafic réel n'est redirigé.

### Phase 2 — données pilote

Le mode de données doit être choisi explicitement avant Gate D :

**Mode A — jeu pilote créé directement dans V3**

À privilégier lorsqu'aucune reprise de données réelles V2 n'est requise.

**Mode B — reprise contrôlée de données autorisées**

Si une reprise V2 → V3 est nécessaire, elle doit faire l'objet d'un artefact opérateur séparé qui
décrit précisément les objets repris, les contrôles de comptage/intégrité, la fenêtre de gel et la
preuve de réconciliation. Aucune migration improvisée ou destructive ne doit être exécutée.

Pour les deux modes :

- aucun secret/session/token n'est migré comme donnée métier ;
- le tenant cible est explicite ;
- les comptes privilégiés sont minimaux ;
- les contrôles d'isolation tenant sont rejoués ;
- la preuve de réconciliation est conservée sans PII inutile.

### Phase 3 — activation limitée

Après approbation opérateur :

- activer uniquement le périmètre pilote approuvé ;
- conserver V2 intacte ;
- limiter les comptes et communications au périmètre autorisé ;
- surveiller en continu readiness, 5xx, latence, DB, Redis, queues, storage et worker ;
- utiliser les seuils de `docs/lot15-monitoring-incident-runbook.md` et
  `docs/lot15-capacity-resilience.md`.

La première période d'observation doit être traitée comme une phase réversible, pas comme une
suppression de V2.

### Phase 4 — confirmation

Le cutover n'est confirmé que si :

- aucune violation tenant/RBAC n'est observée ;
- aucune divergence de données n'est détectée ;
- readiness API/worker reste stable ;
- les 5xx et latences restent sous les seuils critiques ;
- les queues se résorbent normalement ;
- les sauvegardes sont valides ;
- aucune communication non autorisée n'a été envoyée ;
- le support opérateur ne constate pas de blocage critique.

La décommission de V2 n'appartient pas à cette répétition. Elle nécessite une décision séparée.

## 6. Déclencheurs de rollback

Le rollback doit être déclenché immédiatement pour au moins un des cas suivants :

- suspicion ou preuve de fuite cross-tenant / IDOR / élévation de privilège ;
- corruption, divergence ou impossibilité de prouver l'intégrité des données ;
- PostgreSQL indisponible ou restauration requise ;
- readiness API/worker durablement rouge ;
- Redis/BullMQ non récupérable par la procédure certifiée ;
- backlog de jobs critique qui ne décroît pas ;
- taux 5xx ou p95 au seuil critique du runbook ;
- storage critique indisponible ;
- envoi de communication réelle non autorisé ;
- rollback applicatif impossible ou version déployée non identifiable ;
- backup requis absent/invalide ;
- décision explicite de l'opérateur responsable.

Un problème sécurité ou intégrité n'est jamais toléré pour "continuer le pilote".

## 7. Procédure de rollback V3 → V2

Objectif : remettre le service connu à disposition sans détruire les preuves nécessaires au
diagnostic.

1. annoncer le rollback et geler tout nouveau changement ;
2. stopper l'onboarding et les communications externes V3 ;
3. retirer V3 du chemin utilisateur selon le mécanisme de routage/DNS autorisé ;
4. rétablir la version/route V2 connue sans modifier ses données ;
5. conserver V3, ses logs et ses ressources dans un état inspectable ;
6. vérifier qu'aucune migration destructive n'a rendu V2 dépendante de V3 ;
7. vérifier V2 avec son smoke minimal connu ;
8. relever l'état PostgreSQL/Redis/storage/queues V3 sans purge destructive ;
9. si une restauration V3 est nécessaire, utiliser le runbook #69 dans une cible isolée avant toute
   décision de remplacement ;
10. si Redis/BullMQ est impliqué, utiliser #70 et laisser PostgreSQL/outbox/idempotence guider la
    reprise ;
11. ouvrir/classer l'incident avec le runbook #71 ;
12. documenter heure, SHA, cause, impacts, preuves et prochaines actions sans secret/PII.

Le rollback ne signifie pas supprimer V3 ni effacer une file pour faire disparaître un symptôme.

## 8. Répétition du rollback sans production

Avant Gate D, réaliser une répétition **non destructive** :

- [ ] documenter un SHA V2 connu et un SHA V3 candidat ;
- [ ] simuler la décision GO → rollback sans changer DNS public ;
- [ ] démarrer/arrêter V3 sur environnement autorisé ;
- [ ] simuler une readiness Redis rouge puis récupération avec #70 ;
- [ ] simuler une restauration PostgreSQL isolée avec #69 ;
- [ ] vérifier que les procédures n'exigent aucun secret copié dans le terminal/log ;
- [ ] vérifier qu'aucune étape n'exige une suppression de V2 ;
- [ ] noter les étapes manuelles, responsables et durées mesurées ;
- [ ] corriger toute étape ambiguë avant Gate D.

Cette répétition prouve la répétabilité opérateur, pas un RTO fournisseur.

## 9. GO / NO-GO pilote

### GO technique préparatoire

Toutes les conditions doivent être vraies :

- CI du SHA candidat verte ;
- #68 à #75 validés ;
- aucun bloqueur sécurité/intégrité ;
- backup/restore et recovery queues prouvés ;
- monitoring/runbook prêt ;
- baseline capacité PASS ;
- rollback répétable ;
- V2 intacte.

### GO Gate D

En plus du GO technique :

- fournisseur et budget explicitement validés ;
- ressources finales explicitement autorisées ;
- périmètre pilote explicitement validé ;
- données/destinataires explicitement autorisés ;
- fenêtre et responsables validés.

### NO-GO

Un seul des éléments suivants suffit :

- CI rouge ou preuve manquante ;
- capacité #75 rouge ;
- backup/recovery non prouvé ;
- dette sécurité ou cross-tenant ouverte ;
- rollback non répétable ;
- V2 modifiée/dégradée ;
- fournisseur/budget/données/destinataires non approuvés ;
- incident actif SEV1/SEV2.

## 10. Formation et support opérateur

Avant pilote réel, l'opérateur doit savoir :

- lire liveness/readiness API et worker ;
- retrouver un incident via `requestId` sans demander de token/cookie ;
- consulter les seuils et signaux du runbook #71 ;
- lancer les preuves backup/restore et Redis/BullMQ sur environnement autorisé ;
- identifier la version/SHA déployée ;
- déclencher le rollback ;
- désactiver les communications externes si nécessaire ;
- escalader un incident sécurité/intégrité immédiatement.

Un contact opérateur et un remplaçant doivent être identifiés lors de Gate D.

## 11. Evidence sheet de répétition

Pour chaque répétition conserver :

- date/heure ;
- environnement ;
- SHA V2 connu ;
- SHA V3 candidat ;
- résultat CI ;
- résultat `pnpm capacity:test` ;
- résultat backup/restore ;
- résultat Redis/BullMQ recovery ;
- état smokes V3 ;
- scénario de rollback simulé ;
- durée mesurée par étape ;
- écarts observés ;
- décision GO/NO-GO ;
- responsable de la décision.

Aucun secret, cookie, token, payload utilisateur ou PII ne doit être copié dans la fiche.

## 12. État actuel

À ce stade :

- PR #77 reste **draft** ;
- aucune production n'est autorisée ;
- V2 reste intacte ;
- #75 doit être vert dans la CI avant validation ;
- #76 fournit le plan opérateur, mais Gate D reste fermé tant que les décisions propriétaire/client
  ne sont pas explicitement prises ;
- aucun tag `lot-15-go` ne doit être créé avant revue finale et autorisation explicite.


## 13. Cible de rollback GestSchool V2

La cible V2 fournie par le propriétaire est :

- dépôt : `BALLOPROTEL/GESTSCHOOL_V2`
- branche : `main`
- SHA immuable observé : `ad037f4aa685eac12055935ef6046fbb83f350b2`
- architecture documentée : frontend Vercel, API Render, PostgreSQL source de vérité,
  Redis obligatoire, Supabase Storage privé ;
- runbook V2 existant : `docs/runbooks/deployment-rollback.md`
- configuration V2 existante : `render.yaml` et `vercel.json`.

### Preuves observées

- CI V2 run #84 sur ce SHA : **SUCCESS** ;
- statut Vercel sur ce SHA : **SUCCESS** ;
- `main` pointe bien sur ce SHA.

### Réserve sécurité actuelle

Le dernier audit planifié des dépendances V2 (26 octobre 2026, run `40313928193`)
est **FAIL**. La politique V2 signale 13 advisories dans les dépendances de
production :

- `GHSA-x5fp-wj9c-mxmx`
- `GHSA-4mjr-xmp4-gh2g`
- `GHSA-rgj7-g3m4-5g8c`
- `GHSA-2883-xcg3-v3hh`
- `GHSA-wc9g-mqfw-jrwm`
- `GHSA-qfvm-cv95-jqjf`
- `GHSA-qvfw-j98x-7q72`
- `GHSA-535w-7cp7-47q4`
- `GHSA-3pph-fpjx-jg34`
- `GHSA-jqcg-44mw-7w3h`
- `GHSA-wq5f-xc86-pv6w`
- `GHSA-27r3-jxmh-p828`
- `GHSA-q7qp-rjg7-q26m`

Conséquence : V2 est une **cible de rollback techniquement identifiable et
reproductible**, mais elle ne doit pas être qualifiée de cible saine pour un
cutover réel tant que cet audit n'est pas remédié ou qu'un risque résiduel
explicite n'est pas accepté par le propriétaire.

### Répétition non destructive autorisée

Avant Gate D, la répétition peut prouver sans toucher à la production :

1. résolution du dépôt et du SHA V2 ci-dessus ;
2. vérification que `main` pointe toujours vers ce SHA ou qu'un nouveau SHA
   approuvé le remplace ;
3. vérification de la CI de livraison V2 ;
4. vérification du dernier audit de dépendances V2 ;
5. lecture des manifests Render/Vercel et du runbook V2 ;
6. simulation opérateur de l'ordre de rollback :
   worker V3 → API V3 → routage frontend → V2 ;
7. aucune modification DNS, aucune promotion Render/Vercel, aucune migration,
   aucune donnée réelle et aucune activation provider pendant la répétition.

Le Gate D reste fermé si l'audit V2 est rouge, si le SHA de rollback n'est pas
figé ou si la fenêtre et le mécanisme de routage ne sont pas explicitement
autorisés.
