# LOT15 — Architecture cible de production (provider-neutral)

Statut : **DRAFT POUR GATE A — aucune production autorisée**.

Cette architecture décrit les exigences minimales avant pilote réel. Elle ne
sélectionne aucun fournisseur, aucun plan payant et n'autorise aucune dépense.

## Principes

- V2 reste intacte jusqu'au cutover explicitement autorisé.
- V3 conserve une séparation web / API / worker.
- PostgreSQL, Redis/BullMQ et stockage objet restent des dépendances critiques.
- Readiness reste fail-closed : une dépendance critique indisponible ne doit jamais
  être annoncée comme healthy.
- Les secrets restent côté serveur et sont séparés entre staging et production.
- Les données et communications réelles restent interdites avant Gate D.
- Tout coût potentiel nécessite une validation explicite du propriétaire/client.

## Topologie cible

### Web

Frontend Next.js servi en HTTPS derrière un fournisseur géré.

Exigences :

- domaine et DNS détenus/contrôlés ;
- TLS automatique et renouvellement vérifié ;
- déploiement immuable par commit ;
- rollback vers un déploiement connu ;
- variables publiques strictement séparées des secrets serveur ;
- CSP recertifiée après traitement de #72.

### API

Service NestJS stateless derrière HTTPS.

Exigences :

- au moins une instance durable pendant le pilote ;
- readiness séparée de la liveness ;
- connexion PostgreSQL TLS avec vérification complète ;
- Redis TLS/auth ;
- accès stockage privé côté serveur uniquement ;
- logs structurés sans secret/PII ;
- requestId corrélable ;
- restart/rollback documentés ;
- aucune dépendance à un disque local pour les données persistantes.

### Worker

Worker séparé de l'API.

Exigences :

- exécution durable ou mécanisme explicitement garanti pour consommer BullMQ ;
- pas de dépendance au trafic HTTP pour se réveiller ;
- même configuration DB/Redis/storage que l'API, avec secrets distincts si nécessaire ;
- retries bornés ;
- idempotence des jobs critiques ;
- détection des jobs bloqués/échoués ;
- procédure de reprise opérateur.

### PostgreSQL

Base gérée et durable.

Exigences minimales :

- TLS verify-full ou équivalent strict ;
- stockage persistant ;
- sauvegardes chiffrées ;
- restauration testable ;
- utilisateur runtime moindre privilège ;
- utilisateur migration distinct si le fournisseur le permet ;
- limites de connexions et timeouts documentés ;
- migrations additive-first ;
- RPO/RTO définis avant Gate B ;
- HA exigée seulement si le besoin pilote/SLA la justifie explicitement.

### Redis / BullMQ

Redis géré et durable pour sessions/rate-limit/queues.

Exigences :

- TLS et authentification ;
- politique d'éviction connue et compatible avec les usages IAM/queues ;
- mémoire/quota supervisés ;
- persistance adaptée aux queues ;
- absence de fallback silencieux vers mémoire process pour les données de sécurité ;
- reprise après déconnexion certifiée ;
- idempotence métier côté consommateurs.

### Stockage objet

Bucket privé S3-compatible.

Exigences :

- accès public bloqué ;
- chiffrement au repos ;
- credentials serveur à moindre privilège ;
- cycle de vie/rétention défini ;
- contrôle des objets orphelins ;
- restauration ou réplication seulement si le besoin métier l'exige ;
- URLs signées courtes si elles sont introduites plus tard.

### Messagerie

Brevo ou fournisseur validé ultérieurement.

Exigences :

- domaine/sender vérifiés ;
- secret webhook séparé ;
- idempotence ;
- gestion erreurs/retry ;
- liste de destinataires pilote explicitement autorisée ;
- aucun WhatsApp réel sans validation dédiée.

## Objectifs opératoires provisoires

Ces valeurs servent de point de départ de conception et devront être validées
avant Gate D. Elles ne constituent pas encore un SLA contractuel.

- disponibilité cible pilote : 99,5 % mensuel minimum ;
- RPO cible : <= 24 h tant qu'aucune donnée financière/critique réelle n'est engagée ;
- RTO cible : <= 4 h pour le pilote ;
- sauvegarde PostgreSQL : au moins quotidienne ;
- exercice de restauration : obligatoire avant pilote ;
- conservation des logs applicatifs : durée minimale à fixer selon coût et conformité ;
- alertes : dépendance critique down, saturation DB/Redis, queue bloquée, échecs répétés worker,
  erreurs auth anormales, sauvegarde en échec.

Toute exigence plus stricte doit être décidée avec le propriétaire/client avant
choix d'un plan payant.

## Séparation des environnements

Production devra avoir des identifiants séparés pour :

- base PostgreSQL ;
- Redis ;
- stockage objet ;
- clés IAM JWT/MFA/CSRF ;
- Brevo/messaging ;
- origines/domaines ;
- monitoring.

Aucune clé staging ne doit être promue telle quelle en production.

## Gates

### Gate A — architecture prête

PASS lorsque :

- cette architecture est revue ;
- les dépendances critiques sont identifiées ;
- les décisions fournisseur/budget restent explicitement différées ;
- les objectifs provisoires RPO/RTO/disponibilité sont acceptés ou remplacés ;
- aucune ressource payante n'a été créée.

### Gate B — données et sécurité prêtes

Nécessite au minimum :

- #69 backup/restore ;
- #70 Redis/BullMQ ;
- #72 hardening sécurité ;
- #74 livré dans main.

### Gate C — exploitation prête

Nécessite :

- #71 monitoring/incident ;
- #73 communications ;
- #75 charge/capacité.

### Gate D — pilote autorisé

Nécessite :

- choix fournisseur et budget explicitement validés ;
- ressources finales explicitement autorisées ;
- #76 cutover/rollback approuvé ;
- aucun bloqueur ouvert.

## Décisions volontairement différées

Ne pas décider dans #68 sans validation :

- fournisseur final API/worker ;
- plan PostgreSQL ;
- plan Redis ;
- domaine final ;
- budget mensuel ;
- niveau HA supérieur au besoin pilote ;
- durée de rétention payante des logs/backups ;
- date de cutover ;
- premier établissement pilote.

Ces décisions seront prises uniquement après comparaison coût/risque/capacité et
autorisation explicite.
