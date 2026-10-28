# LOT15 — Brevo et communications

Statut : **contrat applicatif en certification — aucun envoi réel autorisé**.

## Garde-fous

- `NODE_ENV=test` force toujours le provider local, même si Brevo est demandé.
- Le provider local écrit uniquement dans une capture propriétaire `0600`.
- Le staging Brevo reste email-only.
- Sans `BREVO_TEST_RECIPIENT` valide, aucun email staging ne quitte l'application.
- Si une adresse staging est autorisée, seul ce destinataire exact peut être utilisé.
- WhatsApp staging est refusé avant tout appel réseau.
- WhatsApp production est désactivé par défaut.
- Son activation exige explicitement `BREVO_WHATSAPP_ENABLED=true`, un sender valide et les
  templates approuvés FR/EN/AR.
- Aucune CI, aucun test et aucun script LOT15 ne déclenche un envoi Brevo réel.

## Contrat email Brevo

Le provider envoie vers `/v3/smtp/email` avec :

- sender configuré ;
- destinataire résolu ;
- sujet et HTML rendus ;
- clé d'idempotence basée sur l'identifiant du message.

Les réponses provider sont bornées à un `messageId`. Les corps d'erreur Brevo ne sont jamais
journalisés ni renvoyés car ils peuvent contenir coordonnées, payloads ou informations sensibles.

En cas d'échec réseau ou HTTP, le worker conserve l'intention durable en PostgreSQL, applique les
retries BullMQ, puis place le message en `FAILED` à la dernière tentative. Les événements métier
restent intacts.

## Idempotence et rejeu

- PostgreSQL impose une clé d'idempotence logique par tenant / événement / destinataire / canal.
- BullMQ utilise un `jobId` stable.
- Dix replays concurrents sont déjà certifiés pour produire une seule livraison logique.
- Un message déjà finalisé n'est pas renvoyé.
- Les événements outbox PROCESSED peuvent être réconciliés si un job Redis manque.

## Webhook Brevo

Le endpoint public `POST /api/v1/webhooks/brevo` est exempt de CSRF uniquement pour permettre le
callback provider. Il reste protégé par :

- Content-Type JSON ;
- rate limiting ;
- Bearer secret dédié ;
- comparaison constante du secret ;
- schéma strict minimal : event, message-id, ts_event ;
- fenêtre anti-rejeu de 24 h ;
- empreinte SHA-256 stable de l'événement ;
- unicité en base avec `skipDuplicates` ;
- message provider connu obligatoire ;
- transition de statut monotone ;
- payload provider complet non conservé ;
- audit borné au statut, sans adresse, contenu ni secret.

Les callbacks inconnus ou obsolètes ne peuvent pas faire régresser un message déjà livré.

## Preuves sans réseau externe

Les tests de contrat utilisent un `fetch` simulé et vérifient :

- URL email Brevo ;
- payload email et clé d'idempotence ;
- contrat WhatsApp uniquement quand explicitement activé ;
- blocage staging avant réseau ;
- blocage WhatsApp non autorisé avant réseau ;
- erreurs provider sans fuite de réponse ;
- webhook auth, stale/replay, doublons et transitions monotones ;
- retries, final FAILED, isolation tenant et protection des tokens IAM.

Cette preuve valide le **contrat applicatif**. Elle ne prouve pas la configuration du compte Brevo,
la propriété du domaine, la réputation du sender ou la délivrabilité réelle.

## Gate avant tout test externe

Un test Brevo réel ne pourra être effectué qu'après validation explicite du propriétaire sur :

1. le sender/domain Brevo autorisé ;
2. le ou les destinataires de test ;
3. le canal exact autorisé ;
4. la fenêtre du test ;
5. l'absence de coût ou le budget explicitement approuvé.

WhatsApp reste interdit tant que son activation n'est pas explicitement autorisée.

Avant cette validation, le verdict reste : **contrat prêt, aucun envoi réel autorisé**.
