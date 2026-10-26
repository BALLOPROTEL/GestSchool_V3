# Prérequis d'exploitation — backlog LOT15 non commencé

Le [GO LOT14](lot14-certification.md) certifie le MVP staging seulement. Les cases
ci-dessous restent des contrôles d'exploitation futurs, sans HA, restauration,
charge ou mise en service réelle certifiées. Cette consolidation documentaire ne
commence pas LOT15 et ne coche pas ces prérequis.

- [ ] Vérifier domaine et DNS détenus, certificats TLS/renouvellement et redirection HTTPS. Activer HSTS seulement sur le périmètre maîtrisé, sans preload/subdomains implicites.
- [ ] Examiner séparément Vercel et Render, réseau interne, origins explicites, secrets serveur exclusivement. Fournir la même origine API HTTPS au build et au démarrage Next ; vérifier le routes-manifest compilé. Ne jamais recopier `.env.example` en production ; aucun NEXT_PUBLIC pour credential.
- [ ] Vérifier reverse proxy réel, TLS termination, Forwarded headers et IP client ; conserver direct tant que la chaîne de confiance n'est pas explicitement validée. Ne pas utiliser trust proxy true/hops sans topologie démontrée.
- [ ] PostgreSQL managed : TLS avec vérification complète, utilisateur runtime moindre privilège distinct du migration-user, limites connexions/timeout, migrations additive-only. Aucun accès DB public inutile.
- [ ] Redis managed : TLS/auth/ACL, namespaces et contrôle queues/quotas, supervision mémoire/évictions ; aucune perte des données de sécurité remplacée par de la mémoire process.
- [ ] S3 privé : Block Public Access/politique équivalente, ACL, rôle minimal par usage, chiffrement, rétention et vérification anonyme LIST/GET/PUT sur objet existant ; pas de signed URLs longues ni stockées.
- [ ] Brevo : compte réel et domaines validés, templates FR/EN/AR approuvés, credentials/sender/webhook secrets distincts, test privé de callback/auth/idempotence/horloge. Le bearer ne signe pas le corps ; ne pas inventer une garantie HMAC.
- [ ] Générer les clés IAM Ed25519 et clés MFA/CSRF/messaging indépendantes dans un secret manager ; procédure rotation avec key IDs, révocation sessions et purge/rotation provider après incident. Pas de valeur en Git/logs/bundle.
- [ ] Désactiver toute fonction DEV/fixtures, valider réellement les refus au démarrage production et le fail closed Redis/config.
- [ ] Configurer sauvegardes chiffrées PostgreSQL/S3, rétention, accès restreints, exercice de restauration isolé et validation RPO/RTO définis avec l'opérateur.
- [ ] Monitoring/alerting sur erreurs auth/replay/MFA, queues échouées, saturation quotas, dépendances, sauvegardes ; logs à codes/IDs sans PII ni secrets, accès/rétention maîtrisés.
- [ ] Activer signalement privé GitHub, protection de branche, review CODEOWNERS, CI requise, blocage force-push et suppression, permissions minimales. Dependabot sans automerge.
- [ ] Définir signature des commits/releases/tags et provenance des artifacts, contrôles d'accès au compte mainteneur/MFA. Aucun tag ni historique réécrit automatiquement.
- [ ] Exécuter certification de staging, matrice tenant/RBAC/IDOR et E2E réelle après configuration, audit de dépendances actualisé et validation manuelle des risques résiduels. Ne pas assimiler un succès local à un GO déploiement.
