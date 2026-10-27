# LOT15 — Production readiness et préparation pilote

Statut : **IN PROGRESS — PRODUCTION NON AUTORISÉE**.

Point de départ : LOT14 clôturé par le tag annoté `lot-14-go` sur
`e3f4cae1f3f2f84eb013c9c9db91f58d7de6da9b`.

Cette phase transforme le staging certifié en un dossier de préparation à
l'exploitation réelle. Elle ne constitue ni un cutover, ni une autorisation
d'onboarder un établissement réel.

## Garde-fou financier et opérationnel

Jusqu'à validation explicite du propriétaire/client :

- aucune carte bancaire ;
- aucun abonnement ou plan payant ;
- aucune ressource pouvant générer une facturation ;
- aucun établissement réel ;
- aucune donnée réelle ;
- aucune modification de GestSchool V2 ;
- aucun WhatsApp réel ;
- aucun cutover V2 → V3.

Les études, tests locaux, documents, simulations et validations utilisant les
ressources déjà autorisées restent possibles tant qu'ils n'introduisent pas de
coût.

## Baseline certifiée LOT14

Le staging V3 a démontré :

- frontend Vercel staging ;
- API Render et worker séparé ;
- PostgreSQL 18 avec TLS `verify-full` ;
- Redis TLS/auth et BullMQ ;
- stockage S3 privé ;
- 49 smoke distants PASS ;
- bootstrap synthétique de 2 tenants / 8 utilisateurs ;
- matrice Tenant A/B : 14 PASS / 0 FAIL / 0 SKIP ;
- worker E2E report : PASS / completed ;
- readiness API/worker healthy en fin de certification ;
- flags opérateur LOT14 revenus OFF.

Ces preuves restent des preuves **staging**. Elles ne démontrent ni HA, ni
sauvegarde/restauration, ni capacité de production.

## Matrice d'écarts

| Domaine          | Staging certifié                                        | Exigence avant pilote réel                                                                       | État LOT15             |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| Web              | Vercel Hobby staging, HTTPS et smoke distants           | Domaine/certificat détenus, politique de déploiement, rollback et protections adaptées           | À définir              |
| API              | Render staging, readiness fail-closed                   | Runtime durable, disponibilité cible, scaling/capacité, rollback et observabilité                | À définir              |
| Worker           | Web Service staging, E2E report PASS                    | Exécution durable, réveil/dispatch fiable, reprise après incident et supervision                 | À définir              |
| PostgreSQL       | PG18 staging temporaire, TLS verify-full                | Base durable, moindre privilège, capacité, sauvegardes, restauration, RPO/RTO et HA selon besoin | #69                    |
| Redis/BullMQ     | TLS/auth, workflow réel traversé                        | Persistance/éviction/ACL/quotas, reprise de file, idempotence et incidents                       | #70                    |
| Storage          | Bucket privé S3-compatible, accès anonymes refusés      | Cycle de vie, rétention, chiffrement, moindre privilège, sauvegarde/restauration si requise      | À définir avec #69/#72 |
| IAM              | RBAC/tenant/MFA/session certifiés                       | Rotation secrets, procédures incident, config production et contrôles d'accès opérateurs         | #72                    |
| CSP/Web security | Protections présentes, dette `unsafe-inline` documentée | Nonce/hash ou acceptation formelle du risque avec re-certification                               | #72                    |
| Messaging/Brevo  | Email staging configuré, aucun envoi non autorisé       | Domaine/sender validé, webhook, idempotence, erreurs/retry, destinataires autorisés              | #73                    |
| Reports          | E2E report PASS avec `classId`                          | Corriger `studentId`, re-tester tenant/RBAC/export                                               | #74                    |
| Monitoring       | Health/readiness et diagnostics sûrs                    | Métriques, alertes, seuils, dashboards, runbook incident                                         | #71                    |
| Capacité         | Quelques mesures staging, pas de charge production      | Profils de charge, p50/p95/p99, saturation, seuils GO/NO-GO                                      | #75                    |
| Sauvegarde/DR    | Non certifié production                                 | Backup chiffré, restauration isolée, RPO/RTO mesurés                                             | #69                    |
| Cutover          | V2 explicitement intacte                                | Plan de migration, rollback, critères GO/NO-GO et répétition                                     | #76                    |

## Ordre d'exécution

1. **#68** — figer architecture cible, exigences et gates.
2. **#74** — corriger la dette Students `studentId` avant toute acceptation réelle.
3. **#72** — fermer ou accepter explicitement les dettes sécurité production.
4. **#69** — définir/tester DB durable, backup/restore et RPO/RTO.
5. **#70** — certifier Redis/BullMQ durable et reprise.
6. **#71** — instrumenter monitoring/alerting et incident response.
7. **#73** — certifier le canal de communications autorisé.
8. **#75** — mesurer charge/capacité/résilience.
9. **#76** — préparer pilote, cutover et rollback.

## Gates de décision

### Gate A — architecture prête

Toutes les exigences sont documentées, avec les écarts entre staging et cible.
Aucun achat n'est nécessaire pour franchir ce gate.

### Gate B — sécurité et données prêtes

Les dettes fonctionnelles et sécurité bloquantes sont fermées ; backup/restore,
queues et secrets sont certifiés sur un environnement autorisé.

### Gate C — exploitation prête

Monitoring, alertes, runbooks et charge/capacité ont des preuves mesurées.

### Gate D — autorisation pilote

Le propriétaire/client valide explicitement :

- le fournisseur et le budget éventuel ;
- la création des ressources finales ;
- le périmètre pilote ;
- les destinataires de communication ;
- le plan de rollback.

Avant Gate D, **aucune dépense et aucun établissement réel**.

## Définition du GO LOT15

Le futur verdict LOT15 devra être formulé séparément du LOT14. Il devra
explicitement préciser :

- ce qui a été certifié ;
- sur quelle infrastructure ;
- quelles limites résiduelles restent acceptées ;
- si un pilote est autorisé ou non.

Le tag `lot-15-go` ne devra être créé qu'après revue finale, CI verte, preuve des
gates applicables et autorisation explicite du propriétaire.

## Suivi GitHub

Issue mère : #66.

Sous-chantiers :

- #68 architecture / garde-fou zéro coût ;
- #69 PostgreSQL / backup / restore ;
- #70 Redis / BullMQ ;
- #71 monitoring / incident ;
- #72 hardening production ;
- #73 Brevo / communications ;
- #74 report Students `studentId` ;
- #75 charge / capacité ;
- #76 pilote / cutover / rollback.
