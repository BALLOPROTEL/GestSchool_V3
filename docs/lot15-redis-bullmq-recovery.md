# LOT15 — Redis / BullMQ recovery

Statut : **preuve locale/CI en cours — production non certifiée**.

## Contrat applicatif déjà présent

Les files documents, reports et messaging utilisent BullMQ avec Redis.

Les producteurs documents/reports utilisent trois tentatives et un backoff
exponentiel de cinq secondes. Messaging utilise cinq tentatives. Les jobs
terminés ou échoués ne sont pas supprimés automatiquement afin de conserver les
identifiants de déduplication.

Les dispatchers utilisent un `jobId` métier stable et PostgreSQL reste la
source durable de l'intention :

- documents et reports utilisent l'outbox transactionnelle puis réconcilient les
  états PENDING / leases expirés si le job Redis manque ;
- messaging réconcilie tous les événements PROCESSED et recrée un job absent ;
- les handlers rechargent l'état PostgreSQL et utilisent leases / états terminaux
  pour éviter de rejouer aveuglément un effet déjà finalisé ;
- une panne Redis ne doit pas être remplacée par une file mémoire silencieuse.

## Certification locale de redémarrage

La commande :

```sh
pnpm redis:recovery:test
```

est limitée à `NODE_ENV=test` et démarre un Redis dédié local sur le port
6381 avec :

- l'image Redis 8.10.1 verrouillée du projet ;
- authentification ;
- AOF activé ;
- `appendfsync always` ;
- volume Docker dédié et supprimé à la fin.

Elle certifie :

1. création d'un job BullMQ alors qu'aucun worker ne le consomme ;
2. redémarrage Redis ;
3. présence du job après redémarrage ;
4. consommation et état `completed` ;
5. rejeu du même `jobId` sans seconde exécution ;
6. second redémarrage Redis alors que Queue + Worker sont déjà actifs ;
7. reconnexion du producteur et du worker puis traitement d'un nouveau job ;
8. nettoyage du conteneur et du volume de test.

Aucune connexion à Upstash, Render ou à une infrastructure distante n'est faite.

## Persistance production

Cette preuve valide le comportement applicatif avec un Redis local persistant.
Elle ne prouve pas les garanties contractuelles du futur fournisseur.

Avant Gate D, le Redis production devra documenter :

- persistance adaptée aux files BullMQ ;
- politique d'éviction compatible avec queues, sessions et rate limiting ;
- mémoire/quota et seuils d'alerte ;
- disponibilité et maintenance ;
- RPO/RTO applicables à Redis ;
- TLS/authentification ;
- procédure opérateur pour files bloquées, jobs failed et reprise après incident.

## Gate #70

#70 pourra être considéré **code/recovery validé en PR** lorsque la certification
CI est PASS et que les tests métier d'idempotence existants restent verts.

L'issue restera ouverte avant Gate D tant que les garanties de persistance,
éviction, capacité et reprise du fournisseur final ne sont pas explicitement
validées.
