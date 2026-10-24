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
