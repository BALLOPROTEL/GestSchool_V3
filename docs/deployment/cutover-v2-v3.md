# Plan de remplacement V2 → V3 — non exécuté

V2 : `https://gestschool.vercel.app/`, ancienne démo selon le propriétaire, sans donnée utilisateur réelle ni utilisateurs actifs à migrer. Inspection limitée à la page publique le 24 octobre 2026. Aucun projet/domaine V2 n'a été modifié ou supprimé.

## Préparation autorisée au LOT14

1. Certifier un staging V3 distinct et fermer les risques du rapport LOT14. Archiver le SHA certifié, les résultats CI/distants et les références des versions de configuration/secrets, sans valeurs.
2. Inventorier le projet V2, son équipe/propriétaire, domaines/aliases, réglages non secrets, ancienne source et déploiement fonctionnel. Conserver les références permettant rollback ; conserver les secrets uniquement dans leurs stores. Vérifier l'absence de dépendance oubliée avant toute suppression future.
3. Préparer le domaine et le projet V3 futurs : DNS/TLS, CORS exact, origins build/runtime, cookies/CSRF, webhooks, stockage et sauvegardes. Préparer une fenêtre, responsables, critères d'arrêt, contrôles et procédure de retour arrière. Aucune mutation de DNS/alias ni ressource de production pendant cette préparation.

**ARRÊT OBLIGATOIRE AVANT L'ÉTAPE 4.** GO LOT14 et décision explicite du propriétaire requis. Ni la fusion LOT13 ni son tag n'autorisent le remplacement de V2. Ne pas créer `lot-14-go` avant revue.

## Étapes futures hors exécution LOT14

4. Après autorisation distincte seulement, remplacer/diriger le déploiement Vercel prévu vers la V3 certifiée. Conserver une référence de déploiement V2 immédiatement restaurable. Ne pas basculer simplement un build staging vers production en réutilisant ses données/secrets.
5. Réaliser le smoke HTTPS : login/MFA, refresh/logout, sessions et RBAC, isolation tenant, consultation finance/résultats, téléchargement privé, PDF/QR, exports, outbox/worker/Brevo, headers/CORS/CSRF, FR/EN/AR/RTL et viewports. Comparer les données de référence ; pas d'envoi massif ni d'import de données réelles inattendu.
6. Si échec critique, indisponibilité, fuite, mauvaise origine ou régression auth : geler les écritures concernées, conserver des logs expurgés et revenir à la référence V2 documentée avec la configuration/domaine correspondants. Ne jamais exécuter de migration inverse destructive pour simuler un rollback ; préserver l'état DB et réconcilier les jobs avant reprise. Recertifier le rétablissement et faire décider la suite par le propriétaire.
7. Décommissionner l'ancien projet uniquement après validation explicite du fonctionnement V3 et du délai de conservation convenu. Retirer aliases, secrets/webhooks inutilisés et ressources de démonstration par inventaire, avec vérification d'absence de dépendances. Aucun délai de rétention ou RPO/RTO n'est inventé ici.

## Critères de décision

GO LOT14 distant complet, ressources de production préparées et approuvées dans une mission distincte, sauvegarde/restore prouvés, propriétaire disponible pour décision/rollback. Une seule URL staging accessible, un build local ou une CI verte ne suffisent pas. LOT15 et le cutover restent hors de cette exécution.

## Checkpoint Supabase et stratégie gratuite — 25 octobre 2026

Cloudflare R2 abandonné à la demande du propriétaire : aucun paiement ni carte avant validation client. Supabase Storage Free `gestschool-v3-staging` / `rwmuksaafbnphurxaofq` réutilisé en `eu-west-1` ; bucket `gestschool-v3-staging-private` confirmé privé. Les quatre paramètres S3 non secrets sont enregistrés dans Render ; clés S3 et URL TCP TLS Upstash signalées configurées par le propriétaire, sans lecture ni divulgation des valeurs. Aucune modification de l'adaptateur S3 existant.

Le nouveau plan accepte un worker Render Web Service Free avec `/health`, le sommeil des services, Supabase 1 GB / fichiers 50 MB / pause possible / sans HA, PostgreSQL Free temporaire sans backup et les quotas Upstash. Ces limites sont acceptées pour staging uniquement ; elles ne remplacent pas les preuves de certification. Health worker, image Chromium et sonde S3 au build API sont préparés localement et attendent publication/revue ; aucun test S3 distant ou GO n'est encore revendiqué.

HEAD initial `c61652023d03b8637a91f8a278aecf7e2629945f`, branche LOT14, fichiers non committés selon l'instruction antérieure. Le staging reste NO-GO tant que les tests indispensables manquent. Aucun merge main, tag LOT14, production finale ou LOT15. Le projet V2 Vercel, son domaine et Supabase `gestschool_v2BD` restent intacts. Le plan de cutover reste documentaire et l'arrêt avant l'étape 4 reste obligatoire.

Recertification locale complète : 14 étapes PASS, E2E 114 PASS / 89 skips contractuels / 0 FAIL. Image worker vérifiée non root sous 512 Mo et configuration incomplète refusée. Ces preuves locales n'autorisent pas de cutover et ne remplacent pas les tests S3/HTTPS distants.
