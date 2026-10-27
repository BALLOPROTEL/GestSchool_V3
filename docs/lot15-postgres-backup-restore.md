# LOT15 — PostgreSQL backup / restore

Statut : **preuve locale/CI en cours — production non certifiée**.

## Objectif

LOT15 doit démontrer qu'une sauvegarde PostgreSQL peut être restaurée et vérifiée
avant tout pilote réel. Cette preuve locale ne remplace pas les sauvegardes
managées d'un futur fournisseur production.

## Preuve automatisée locale

La commande :

```sh
pnpm db:backup-restore:test
```

est volontairement limitée à `NODE_ENV=test` et à PostgreSQL sur
`localhost` / `127.0.0.1`.

Elle utilise la même image PostgreSQL 18.6 verrouillée que la CI et le
`docker/compose.yml`.

Séquence :

1. `pg_dump -Fc` de la base test existante ;
2. création d'une base de restauration isolée avec un nom aléatoire ;
3. `pg_restore --exit-on-error` dans cette base ;
4. comparaison des empreintes de toutes les lignes de toutes les tables ;
5. comparaison de l'état des séquences ;
6. présence de l'historique `_prisma_migrations` ;
7. exécution de la suite d'intégrité DB existante directement sur la base restaurée ;
8. mesure des durées backup / restore / vérification ;
9. suppression de la base restaurée et de l'artefact temporaire.

Aucun mot de passe ni URL de connexion n'est journalisé.

## Limites de cette preuve

Cette certification locale démontre la restaurabilité logique avec la version
PostgreSQL du projet. Elle ne certifie pas :

- le stockage durable d'un fournisseur ;
- le chiffrement des sauvegardes provider ;
- la réplication ou la haute disponibilité ;
- la restauration cross-région ;
- un RPO/RTO production réel ;
- la rétention et rotation des backups.

Ces éléments dépendent du fournisseur final et restent interdits à l'achat sans
validation explicite.

## Objectifs provisoires pilote

Tant qu'aucune exigence métier plus stricte n'est validée :

- RPO cible de conception : **<= 24 h** ;
- RTO cible de conception : **<= 4 h** ;
- sauvegarde durable : **au moins quotidienne** ;
- exercice de restauration isolé : **obligatoire avant Gate D**.

Les durées observées en CI sont des mesures techniques locales et ne doivent pas
être présentées comme le RTO production.

## Gate #69

#69 pourra être considéré **code/runbook validé en PR** lorsque :

- la certification backup/restore CI est PASS ;
- le runbook est revu ;
- aucune donnée réelle n'a été utilisée.

#69 restera ouvert avant Gate D tant que le fournisseur final, la politique de
rétention, le chiffrement provider et le RPO/RTO contractuels ne sont pas
explicitement validés.
