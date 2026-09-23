# LOT 11 — Messagerie transactionnelle

## Architecture

Les écritures métier et l'événement versionné sont atomiques dans PostgreSQL. Le dispatcher de
l'outbox publie ensuite un job `messaging.send` dans BullMQ. Le worker recharge exclusivement les
données à partir des identifiants de l'événement, résout les destinataires et préférences, fige le
template rendu dans `messages`, puis appelle l'adaptateur configuré. Une notification interne est
créée dans la même transaction que son message `IN_APP`.

Le provider est abstrait derrière `MessagingProvider`. `LocalMessagingProvider` capture les envois
dans `.local/messaging-delivery.jsonl` avec des permissions propriétaire uniquement. En production,
`BrevoMessagingProvider` est sélectionné par configuration validée. `NODE_ENV=test` force toujours
le provider local, même si une variable demande Brevo.

## Livraison, idempotence et reprise

La clé logique est dérivée de l'événement, du destinataire, du canal et de la version du template.
PostgreSQL impose son unicité par tenant. Les e-mails Brevo transmettent également l'identifiant du
message comme clé d'idempotence provider. BullMQ effectue cinq tentatives avec un backoff
exponentiel commençant à cinq secondes. Un échec intermédiaire remet le message à `PENDING`; la
dernière tentative le passe à `FAILED`. Les succès déjà enregistrés ne sont jamais renvoyés lors du
rejeu d'un événement.

Les webhooks Brevo utilisent un secret Bearer dédié, une empreinte anti-rejeu et une transition de
statut monotone. Un doublon est sans effet et un statut ancien ne peut pas faire régresser un
message livré. Les payloads provider complets ne sont pas conservés.

## Destinataires, langues et préférences

La langue est résolue dans cet ordre : préférence utilisateur, langue du tenant, puis français.
Les templates système existent en français, anglais et arabe. Les variables sont limitées par une
allowlist et les substitutions HTML sont échappées.

Les messages Finance ciblent les guardians marqués `isFinancialContact`. Les messages scolaires
et académiques ciblent les guardians ayant `receivesNotifications`, ainsi que le compte élève quand
il existe. Un numéro est normalisé en E.164 avant WhatsApp; un numéro absent ou invalide ne fait pas
échouer le worker et laisse les canaux éligibles email/IN_APP s'appliquer.

Les préférences EMAIL, WHATSAPP et IN_APP sont tenant/utilisateur. Le LOT 11 ne contient aucun
marketing : les messages sont strictement IAM, transactionnels, financiers ou scolaires. IN_APP
reste activé pour les communications manuelles contrôlées; les canaux externes respectent les
préférences explicites.

## Sécurité

Les liens utilisent uniquement `APP_PUBLIC_ORIGIN`; le Host reçu n'est jamais consulté. Les tokens
d'activation et de reset sont chiffrés pour le délai de livraison, stockés hashés pour leur
consommation one-shot, puis injectés uniquement dans le contenu privé remis au provider. Le token
brut n'entre jamais dans `messages`, `notifications`, l'audit, les métadonnées provider ou les logs.

L'administration Communications est deny-by-default : SCHOOL_ADMIN au tenant, DIRECTOR pour le
scolaire/académique, ACADEMIC_STAFF pour l'académique, ACCOUNTANT pour la finance et TEACHER pour
ses classes réellement `ASSIGNED`. PARENT et STUDENT n'ont aucun droit d'administration. Toutes les
requêtes incluent le tenant et les relations multi-tenant restent protégées par des clés étrangères
composites.

## Exploitation

`/health/live` ne dépend pas de Brevo. Une panne provider ne fait jamais échouer la transaction
métier : l'outbox et BullMQ assurent la reprise, puis exposent un état final `FAILED`. L'API
principale reste exploitable; les logs structurés signalent la queue, les retries et les failures
sans coordonnées, contenu sensible ni secret.

Commandes locales :

- `pnpm messaging:dev` affiche les dernières captures privées en masquant les liens/token IAM ;
- `pnpm messaging:test` certifie outbox, BullMQ, worker, idempotence, isolation et échec provider ;
- `pnpm dev:access` régénère les sept comptes et prépare des messages EMAIL/WhatsApp ainsi que des
  notifications lues/non lues idempotentes.

La production exige HTTPS, `MESSAGING_PROVIDER=brevo`, les expéditeurs validés, les IDs des
templates WhatsApp FR/EN/AR, `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET` et une clé de chiffrement
32 octets fournis par le gestionnaire de secrets. Aucun smoke Brevo réel n'est lancé implicitement
par les tests ou la CI.
