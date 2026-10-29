# LOT15 — Evidence de répétition rollback non destructive

Date : 2026-10-29

Statut : **PASS DOCUMENTAIRE / CI — AUCUNE BASCULE LIVE EFFECTUÉE**.

Cette preuve couvre la répétition opérateur autorisée avant Gate D. Elle ne
constitue ni un cutover, ni une promotion Render/Vercel, ni une modification DNS,
ni un test de trafic réel.

## Références figées

### GestSchool V2

- dépôt : `BALLOPROTEL/GESTSCHOOL_V2`
- branche : `main`
- SHA rollback : `da4728e3084480f06db04603dbf1fdb5387b1ab1`
- PR sécurité V2 #2 : MERGED
- CI post-merge V2 #108 : PASS complet
- audit dépendances production : PASS / 0 advisories
- audit complet dépendances : PASS
- Vercel : PASS

### GestSchool V3

- PR LOT15 : #77
- baseline runtime certifiée : `0659b21ae5f73e15aee5117f1f2c7f0f7c9e8532`
- CI V3 #63 : PASS complet
- les commits LOT15 ultérieurs jusqu'à cette preuve ne modifient que la documentation
  de rollback et les preuves opérateur.

## Contrôles de répétition

| Contrôle                                  | Preuve                                                                 | Résultat |
| ----------------------------------------- | ---------------------------------------------------------------------- | -------- |
| Résolution dépôt / branche / SHA V2       | `GESTSCHOOL_V2@da4728e...`                                             | PASS     |
| CI post-merge V2                          | run #108                                                               | PASS     |
| Audit dépendances V2 production + complet | CI #108                                                                | PASS     |
| Manifest API V2                           | `render.yaml`, auto-deploy désactivé, readiness `/api/v1/health/ready` | PASS     |
| Manifest frontend V2                      | `vercel.json`                                                          | PASS     |
| Runbook rollback V2                       | `docs/runbooks/deployment-rollback.md`                                 | PASS     |
| Ordre rollback applicatif V2              | worker → API → frontend                                                | PASS     |
| Backup / restore V3                       | preuve LOT15 #69 / CI                                                  | PASS     |
| Recovery Redis / BullMQ V3                | preuve LOT15 #70 / CI                                                  | PASS     |
| Aucun secret requis dans la preuve        | références SHA / docs uniquement                                       | PASS     |
| Aucune suppression ou mutation V2         | aucune action destructive exécutée                                     | PASS     |
| Aucune modification DNS                   | aucune action exécutée                                                 | PASS     |
| Aucune promotion Render/Vercel            | aucune action exécutée                                                 | PASS     |
| Aucune migration ou donnée réelle         | aucune action exécutée                                                 | PASS     |

## Simulation opérateur GO → rollback

Scénario simulé :

1. le pilote V3 rencontre un critère NO-GO ;
2. geler toute nouvelle action de cutover ;
3. désactiver / arrêter le worker V3 ;
4. retirer l'API V3 de la route active ;
5. rétablir le routage frontend vers la cible V2 figée ;
6. vérifier la V2 via ses probes / smoke connus ;
7. conserver V3 et ses logs dans un état inspectable ;
8. ne jamais annuler manuellement une migration SQL ;
9. si une restauration est requise, restaurer vers une base séparée avant
   tout repointage approuvé ;
10. ouvrir / classifier l'incident avec le runbook LOT15 #71.

Résultat : **PASS documentaire**. L'ordre de décision est cohérent entre les
runbooks V2 et V3 et ne nécessite aucune destruction de V2.

## Limite de cette répétition

Cette répétition ne mesure pas :

- un temps réel de propagation DNS ;
- un temps réel de promotion Vercel / Render ;
- un RTO fournisseur ;
- une bascule de trafic utilisateur ;
- une restauration sur une base de production ;
- un démarrage / arrêt de ressources payantes.

Ces points restent volontairement non exécutés avant Gate D.

## Décisions encore requises pour Gate D

Le propriétaire doit encore approuver explicitement :

1. fournisseur(s) finaux et budget ;
2. ressources finales ;
3. mécanisme exact de routage / bascule ;
4. fenêtre de cutover ;
5. périmètre pilote et données autorisées ;
6. destinataires de communication ;
7. personnes habilitées à déclencher le rollback.

Verdict actuel : **GO TECHNIQUE PRÉPARATOIRE / NO-GO PILOTE RÉEL**.
