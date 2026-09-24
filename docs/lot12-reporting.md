# LOT 12 — Dashboards, reporting et exports

## Architecture

Les dashboards et rapports partagent les contrats stricts de `packages/contracts` et les moteurs
de lecture de `packages/infrastructure/src/reports`. Les contrôleurs Nest ne font aucun accès
Prisma direct. Ils appellent les cas d'utilisation des modules `dashboard` et `reports`.

Un export suit toujours la chaîne durable suivante, quelle que soit sa taille :

1. transaction PostgreSQL : création `ReportExport(PENDING)` et événement outbox
   `reports.export.requested.v1` ;
2. dispatcher outbox vers la queue BullMQ `reports.generate` ;
3. worker : lease, relecture des données avec le snapshot d'autorisation, sérialisation et écriture
   dans le bucket S3 privé ;
4. transaction de publication `READY`, avec checksum SHA-256 et audit.

Le choix « toujours asynchrone » garde une seule voie de sécurité. Le seuil de référence est
néanmoins fixé et testé à 1 000 lignes (`REPORT_EXPORT_ASYNC_THRESHOLD`). La limite absolue est
25 000 lignes, la pagination API est limitée à 100 lignes et au plus trois exports actifs sont
autorisés par demandeur. Les plages de dates sont limitées à 366 jours.

## Isolation et autorisations

`dashboards.read`, `reports.read` ou `reports.export` ne suffisent jamais seuls : la permission de
la source (`students.read`, `invoices.read`, `grades.read`, etc.) est également exigée. Les
agrégats, aperçus et snapshots d'export appliquent les mêmes prédicats :

- `TENANT` pour les rôles autorisés ;
- `ASSIGNED` pour un enseignant et ses affectations actives ;
- `CHILDREN` pour les enfants liés au parent ;
- `OWN` pour l'élève associé à l'utilisateur.

Les UUID de filtres sont résolus dans le tenant et dans le scope avant toute requête. L'historique
et le téléchargement d'exports sont limités au demandeur, à son tenant et à ses permissions
actuelles. Une ressource étrangère est traitée comme introuvable.

## Exactitude et minimisation

Les montants restent en minor units PostgreSQL `bigint` et sont transportés sous forme de chaînes.
Les encaissements ne considèrent que les paiements `COMPLETED`; allocations et reversals suivent
les règles Finance existantes. Les résultats parent/élève sont limités aux états publiés/verrouillés
et les moyennes proviennent des snapshots `report_cards`.

Chaque handler définit une liste fermée de colonnes. Identifiants de session, credentials, secrets
MFA/provider, contenus sensibles de message et tokens QR ne sont jamais sélectionnés.

PostgreSQL reste en UTC. Les agrégats journaliers utilisent la timezone IANA de
`tenant_settings.timezone`; une valeur absente ou invalide retombe explicitement sur `UTC`.
Aucun cache d'agrégat n'est utilisé dans ce lot : PostgreSQL reste l'unique source de vérité et il
n'existe donc aucun risque de clé de cache partagée entre tenants.

## Formats et stockage

- CSV : UTF-8 avec BOM, échappement RFC 4180 et neutralisation par apostrophe des cellules
  commençant par `=`, `+`, `-` ou `@`.
- XLSX : archive OpenXML réelle, valeurs utilisateur en chaînes inline (jamais en formules), ligne
  d'en-tête figée et autofilter.
- PDF : renderer Chromium local et hors réseau du LOT 10, fontes locales Noto et mise en page RTL
  pour l'arabe. Un PDF est limité à 1 000 lignes pour borner le rendu.

La clé privée est
`tenants/{tenantId}/reports/{reportExportId}/{sha256}.{extension}` et ne contient aucune donnée
personnelle. Le téléchargement est un streaming authentifié après vérification du checksum. Les
exports expirent après 24 heures et ne sont jamais régénérés sous une identité déjà `READY`.

## Reprises et observabilité

La queue effectue trois tentatives avec backoff exponentiel. Un lease empêche le travail concurrent;
un replay `READY` est un no-op. La dernière erreur place l'export en `FAILED` avec un code sûr.
Les audits couvrent la demande, la génération, l'échec et le téléchargement sans inclure les
données du rapport. Le réconciliateur recrée un job absent après redémarrage et clôt les jobs dont
les retries BullMQ sont épuisés.

## Migration

`20260923000100_reporting_exports` est strictement additive : trois enums, la table
`report_exports`, ses FK composites tenant-aware, ses checks et ses index. Aucune migration des
LOTS 0 à 11 n'est modifiée.
