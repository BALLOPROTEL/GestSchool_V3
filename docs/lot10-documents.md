# LOT 10 — Documents officiels

Périmètre : bulletins publiés, relevés de période publiés, certificats de scolarité,
certificats d'inscription, cartes élève ID-1 et reçus. Aucun travail LOT 11.

## Conservation du socle

Base de départ : `c2c93b2`, 49 modèles, migrations LOT 3–9 conservées byte pour byte.
Une sauvegarde privée de la base et du schéma précède l'évolution. La migration
LOT 10 étend `documents` et `document_templates`, ajoute un compteur tenant/année/type,
et conserve les statuts historiques ACTIVE/ARCHIVED. `generation_status IS NULL`
désigne uniquement les fichiers historiques, exclus des APIs d'émission officielle.
Les nouveaux documents ont un cycle PENDING → PROCESSING → READY ou FAILED ;
une révocation est irréversible et ne détruit ni le fichier ni l'historique.

## Architecture et sécurité retenues

- Le module Documents API valide source, tenant, permission, type, locale et clé
  d'idempotence. Il fige un snapshot et un événement d'outbox dans la même transaction.
- Le worker relaie uniquement les événements documentaires vers `documents.generate`.
  Les jobs contiennent deux UUID : tenant et document. Le job ID est le document ID.
  La base reste l'autorité pour les finalisations idempotentes.
- Templates déclaratifs fermés, versionnés : renderer connu, couleur hexadécimale,
  pied de page texte échappé. Aucun HTML/CSS/JS ou URL utilisateur n'est exécuté.
- Playwright/Chromium dans le worker seulement ; ressources locales embarquées,
  JavaScript et service workers désactivés, réseau bloqué, délai et taille bornés.
- MinIO/S3 privé, clés opaques ; téléchargement authentifié après vérification
  tenant/RBAC/OWN/CHILDREN et empreinte SHA-256.
- QR : 256 bits aléatoires, seulement le SHA-256 en PostgreSQL. Le jeton brut
  existe uniquement pendant le rendu et dans le QR du PDF, jamais dans un job/audit.
- Le bulletin/relevé lit exclusivement le snapshot publié LOT 9. Le relevé MVP
  porte sur la période de ce bulletin, sans fabriquer une moyenne annuelle.
- La réémission crée une nouvelle référence ; la précédente reste dans son état
  explicite (valide ou révoqué). Un paiement reversé rend son document non valide.
- La vérification publique atteste l'émission GestSchool, pas une signature
  électronique qualifiée ni une valeur juridique garantie.

Sources techniques : [jobs BullMQ idempotents](https://docs.bullmq.io/patterns/idempotent-jobs),
[IDs BullMQ](https://docs.bullmq.io/guide/jobs/job-ids),
[retries BullMQ](https://docs.bullmq.io/guide/retrying-failing-jobs),
[isolation réseau Playwright](https://playwright.dev/docs/network),
[PDF Chromium](https://playwright.dev/docs/api/class-page#page-pdf).

## Certification

**GO local, le 14 septembre 2026.** Le [rapport de certification en 70 points](lot10-certification.md)
détaille les commandes, les preuves, les corrections et les limites : 326 tests
unitaires, 342 tests d’intégration, 97 parcours Playwright réussis avec 71
exclusions préexistantes, upgrade LOT 9 et base vide certifiés. La CI GitHub
distante n’a pas été exécutée/observée dans cette certification locale.

## Sources et responsabilités

| Type                   | Source faisant autorité            | Condition d’émission                                           |
| ---------------------- | ---------------------------------- | -------------------------------------------------------------- |
| REPORT_CARD            | Snapshot et lignes LOT 9           | Bulletin PUBLISHED/LOCKED cohérent                             |
| TRANSCRIPT             | Même snapshot de résultats         | Relevé de la période publiée, sans moyenne annuelle inventée   |
| SCHOOL_CERTIFICATE     | Élève, inscription, classe, année  | Élève/inscription/année ACTIVE, inscription non terminée       |
| ENROLLMENT_CERTIFICATE | Même inscription réelle            | Attestation d’inscription distincte du certificat de scolarité |
| STUDENT_CARD           | Même inscription réelle            | Carte ID-1, identité scolaire minimale                         |
| RECEIPT                | Reçu, paiement, ventilations LOT 8 | Paiement COMPLETED, montant/devise concordants                 |

`ATTESTATION`, `HONOR_CERTIFICATE` et `DIPLOMA` pourront recevoir leur propre
résolveur de source, rendu fermé et migration d’enum quand leurs règles seront
définies. Ils ne sont pas acceptés par l’API MVP et aucun moteur supplémentaire
n’est développé.

Le frontend envoie seulement le type, l’UUID de source et la langue, accompagnés
d’une clé `Idempotency-Key` UUID. Une répétition avec la même clé et les mêmes
paramètres retourne la même émission ; un changement de paramètres retourne 409.
Le snapshot est immuable dès la demande. Les mutations ultérieures des sources
n’altèrent ni le snapshot ni les octets du PDF historique.

## Pipeline et reprise

1. Transaction PostgreSQL : contrôle tenant/RBAC/source, version du template,
   compteur atomique, document PENDING, audit et événement d’outbox.
2. Relais worker : événements validés en base, verrou `SKIP LOCKED`, enqueue
   BullMQ avec `jobId=documentId`, puis marque d’acheminement transactionnelle.
3. Traitement : acquisition d’un bail PostgreSQL de 180 secondes, rendu Chromium
   borné, stockage privé puis finalisation sous contrôle du jeton de bail.
4. Une redélivrance READY/REVOKED/FAILED est sans effet. Un bail actif n’est pas
   volé ; un bail expiré est récupérable. Au maximum trois tentatives de rendu.
5. La réconciliation rétablit un job Redis perdu depuis l’état PostgreSQL durable.
   Un épuisement est enregistré FAILED et audité ; une réémission est explicite.

BullMQ utilise son adaptateur officiel node-redis, partagé avec la dépendance
Redis déjà installée, sans second client ioredis. Le worker n’ouvre aucun serveur
HTTP. Deux rendus maximum s’exécutent simultanément. Redis conserve les jobs
terminés pour la déduplication ; une politique de rétention devra respecter les
états terminaux PostgreSQL. Les systèmes indépendants doivent utiliser des bases
Redis distinctes : tous les consommateurs d’une queue doivent viser la même base
PostgreSQL.

La finalisation SQL et le stockage objet ne constituent pas une transaction
distribuée. Après une erreur SQL, le worker ne supprime l’objet candidat que si
PostgreSQL prouve qu’il n’est pas le PDF historique enregistré. Un arrêt brutal
entre upload et commit peut laisser un objet non référencé ; un futur nettoyage
contrôlé du bucket devra uniquement traiter ces objets, jamais les PDF historiques.

## Permissions

| Acteur                          | Types                                        | Portée                         |
| ------------------------------- | -------------------------------------------- | ------------------------------ |
| SCHOOL_ADMIN                    | Six types et modèles versionnés              | TENANT                         |
| SUPER_ADMIN                     | Six types avec permission PLATFORM explicite | Tenant du contexte authentifié |
| DIRECTOR / ACADEMIC_STAFF       | Documents académiques, hors reçus            | TENANT                         |
| ACCOUNTANT                      | Reçus uniquement                             | TENANT                         |
| PARENT                          | Lecture/téléchargement                       | CHILDREN, lien guardian actif  |
| STUDENT                         | Lecture/téléchargement                       | OWN, userId de l’élève         |
| TEACHER / absence de permission | Aucun accès documentaire                     | Refus par défaut               |

La connaissance d’un UUID n’accorde aucun accès. Le téléchargement relit les
relations d’accès après la récupération S3 et vérifie taille et SHA-256 avant de
retourner `application/pdf`, `no-store`, `nosniff` et une disposition attachment.
L’aperçu authentifié charge ces mêmes octets en URL Blob éphémère, révoquée à la
fermeture ; il ne publie pas d’URL S3 et ne régénère pas un document historique.

## Exploitation locale et CI

`DOCUMENT_PUBLIC_ORIGIN` est obligatoire : origine HTTPS en production, HTTP
autorisé seulement en DEV/TEST sur loopback. Aucune URL fournie par un utilisateur
n’est chargée dans Chromium. Les polices Noto locales, le QR data-URL et les styles
fermés sont embarqués dans le rendu. Logo et photo ne sont pas inventés : les
modèles actuels n’exposent pas de source photo/logo sécurisée ; la carte comporte
un emplacement « photo indisponible » et l’identité réelle de l’établissement.

Installer Chromium sur chaque machine worker avec
`pnpm exec playwright install --with-deps chromium`. La CI prépare aussi un MinIO
éphémère privé avant les tests documentaires. Sur ce poste WSL sans sudo, les
bibliothèques Linux locales déjà utilisées au LOT 9 sont transmises via
`LD_LIBRARY_PATH` (configuration `.env` ignorée, sans secret). Pour la CLI
Playwright racine, exporter cette variable dans le shell ; Turborepo la transmet
explicitement sans passer en mode d’environnement permissif.

La vérification publique est limitée à 30 requêtes/minute par adresse réseau
observée par l’API et par endpoint, indépendamment du jeton. Les en-têtes IP
envoyés par un client ne sont pas crus. Derrière un reverse proxy non configuré,
cette limite s’applique donc à l’adresse du proxy : prévoir une limitation par IP
réelle au proxy de confiance avant une exposition production. Ne pas activer
aveuglément `trust proxy`. Les journaux d’accès du proxy doivent également
masquer les segments de jetons des routes `/verify/` ; Next les exclut déjà de ses
journaux de développement. L’API ne journalise ni jeton brut ni URL signée.
La route publique dispose aussi d’un relais Next dédié : il ne transmet aucun
cookie/Authorization, interdit les redirections et termine après cinq secondes.
Ses erreurs renvoient un 503 générique sans journaliser l’URL cible, contrairement
au chemin d’erreur du proxy générique Next. Le statut 429 reste un 429.

Les accès `pnpm dev:access` restent exclusivement DEV/TEST : sept rôles, contrôle
HTTP/MFA réel, fichier `.local/test-access.json` mode 0600. Les démonstrations
ajoutent deux documents READY et un document REVOKED, en conservant les données
des lots précédents. `pnpm dev:totp EMAIL` reste disponible localement et ne doit
pas être redirigé dans des journaux publics.
