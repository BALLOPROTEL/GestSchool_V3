# Runbook LOT14 — MVP staging certifié

Verdict : **GO STAGING FONCTIONNEL**. SHA applicatif certifié :
`39f5cc20aa1c429210a6ab18597e218a1b693e88`. Voir la
[certification finale](../lot14-certification.md), l'[architecture](../lot14-staging.md)
et le [manifeste de preuves](../lot14-final-evidence.json).

## Fonctionnement normal

Les services restent sur leurs commandes normales. Build API Render inchangé :

```sh
pnpm install --frozen-lockfile --prod=false && pnpm --filter @gestschool/api... build
```

Commande API : `node apps/api/dist/main.js`. Le worker utilise son CMD Docker normal.
Les sondes fournisseur sont `/health/ready` ; une liveness ne remplace jamais une
readiness. PostgreSQL, Redis et storage restent tous critiques.

État normal des hooks opérateur, confirmé dans les échanges :

```text
LOT14_BOOTSTRAP_APPLY=false
LOT14_CERTIFICATION_RUN=false
LOT14_STORAGE_PROBE=false
```

Aucune activation, mutation de commande, migration ou probe supplémentaire n'est
demandée par cette clôture. Aucun runner rejoué après le retour OFF. Les hooks
restent explicitement réservés au staging exact et refusent une activation hors
contexte. Voir les runbooks [bootstrap](staging-bootstrap-ab.md),
[hook bootstrap](staging-bootstrap-api-hook.md) et [runner](staging-certification-runner.md).

## Cibles publiques et secrets

- Web : https://gestschool-v3-staging.vercel.app.
- API : https://gestschool-v3-api-staging.onrender.com/health/ready.
- Worker : https://gestschool-v3-worker-staging.onrender.com/health/ready.
- Storage : projet V3 Supabase `rwmuksaafbnphurxaofq`, eu-west-1,
  bucket privé `gestschool-v3-staging-private`, S3 path-style.

Les clés S3, IAM, messaging, connexions DB/Redis et huit credentials synthétiques
restent exclusivement dans les stores/runtime Render. Ne pas les extraire vers
le chat, un rapport, un fichier ou Git. Aucun secret par argument shell/Docker ARG.
TLS vérifié : PostgreSQL verify-full, Redis TCP/TLS/auth, HTTPS pour S3 et les URLs
publiques. Aucun accès ou changement des ressources V2.

## Exploitation staging et limites

Les 14 migrations et leurs checksums sont acquis ; ne pas reset ni rejouer un seed
DEV. Le bootstrap idempotent déjà appliqué n'est pas une commande normale de démarrage.
Le runner ne doit pas être relancé implicitement. Toute future certification doit
être une action opérateur explicite, suivie d'un retour OFF.

Render Free peut dormir et un job Redis n'éveille pas seul un worker Web endormi.
Avant un futur test autorisé, contrôler le réveil et les readiness à fréquence
raisonnable. Aucun keepalive permanent ou service payant n'est ajouté.

Le retry PostgreSQL reste limité à CONNECT_TIMEOUT : deuxième/dernière tentative,
backoff 200 ms, aucun autre retry, succès SELECT 1 obligatoire, deux échecs → 503.
Les limites de chaque tentative et le nettoyage borné restent inchangés. Aucune
résolution définitive de toute panne DB n'est revendiquée.

Les livraisons Brevo externes requièrent un destinataire expressément autorisé ;
aucun email réel n'a été nécessaire au report E2E. WhatsApp staging reste interdit.
Le filtre studentId du rapport Students est une dette connue ; classId a été
utilisé par le runner, sans correction silencieuse du moteur.

## Pourquoi ce GO n'est pas un GO production

Aucun établissement réel à onboarder. HA, base durable, sauvegardes/restauration,
Redis/queues durables, supervision, charge/capacité, CSP et garanties provider
restent des [prérequis LOT15 non commencés](../lot14-certification.md#pourquoi-ce-go-nest-pas-un-go-production).
Le [runbook historique](staging-history.md) conserve les étapes précédentes.
La PR attend la dernière revue/CI et l'autorisation de merge ; aucun tag GO créé.
