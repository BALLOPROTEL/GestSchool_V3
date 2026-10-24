# Security policy

La branche `main` est la seule version maintenue. Les tags de certification LOT sont des jalons historiques, sans promesse de correctifs séparés. LOT14 staging et LOT15 production ne sont pas certifiés par le LOT13.

Ne publiez pas de vulnérabilité, secret, données d'élèves ou preuve d'exploitation dans une issue publique. Utilisez le signalement privé GitHub du dépôt (`Security` → `Report a vulnerability`) s'il est activé. S'il n'est pas disponible, contactez le propriétaire réel @BALLOPROTEL par un canal privé déjà établi pour convenir d'un canal de transmission ; n'ouvrez pas une issue décrivant la faille. Aucune adresse de signalement non vérifiée n'est publiée ici.

Décrivez le composant, la version/commit, les prérequis et l'impact, avec une reproduction minimale sur des données fictives. Ne testez pas des comptes ou systèmes tiers sans autorisation. Le propriétaire confirme la réception, coordonne le correctif et convient d'une divulgation après disponibilité du correctif ; aucun délai contractuel n'est garanti. Tout secret compromis doit être révoqué/rotaté, même après suppression d'un fichier. Ne réécrivez pas l'historique automatiquement.

Les commandes `pnpm security:test`, `pnpm security:secrets` et `pnpm audit --prod` fournissent des contrôles complémentaires ; aucun scanner ne prouve une absence absolue de vulnérabilité. Voir `docs/security-hardening.md` et le rapport LOT13 pour les limites et preuves.
