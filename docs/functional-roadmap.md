# Roadmap fonctionnelle GestSchool V3

Dernière mise à jour : après clôture du LOT17.

Cette page est la source de vérité produit. Elle distingue la présence
technique d'un module de son niveau réel d'utilisabilité dans le navigateur.

## État du cœur existant

- **Authentification / MFA / sessions / RBAC / multi-tenant** : fonctionnel,
  onboarding MFA à améliorer. LOT18.1 ajoute le QR Authenticator avec fallback
  manuel.
- **Élèves** : fonctionnel, photo absente. LOT18.1 ajoute une photo élève
  privée.
- **Parents / responsables** : OK à ce stade. Maintien et non-régression.
- **Enseignants** : OK à ce stade. Maintien et non-régression.
- **Référentiel académique** : fonctionnel mais UX confuse. LOT18.2 ajoute une
  navigation dédiée et des prérequis guidés.
- **Inscriptions / réinscriptions / transferts** : fonctionnel mais corrections
  administrateur limitées. LOT18.3.
- **Présences / absences / retards** : partiel en UX, persistance et export.
  LOT18.4.
- **Évaluations / notes / moyennes / rangs / bulletins** : pipeline de bout en
  bout à réparer. LOT18.5.
- **Finance** : non recettée récemment par le propriétaire. À recetter après
  stabilisation des priorités LOT18.
- **Documents / PDF / QR** : fonctionnel mais cartes scolaires bloquées dans la
  recette. LOT18.6.
- **Communications IN_APP** : erreur de chargement observée. LOT18.7.
- **Email / Brevo** : livraison réelle staging à finaliser. LOT18.7 + #110.
- **WhatsApp** : architecture prévue, usage réel gardé derrière opt-in. Pas de
  changement immédiat.
- **Dashboards par rôle** : fonctionnels mais recette propriétaire multi-rôles
  incomplète. LOT18.9.
- **Rapports** : CSV/XLSX visibles, PDF/UX/statuts à corriger. LOT18.8.
- **Administration utilisateurs** : OK. Maintien et non-régression.
- **Paramètres établissement** : OK sauf identité visuelle / composants UI.
  LOT18.6.
- **Audit** : fonctionnel, détail UX manquant. LOT18.9 + #112.
- **Profil / sécurité** : fonctionnel, photo manquante. LOT18.1 + #114.
- **Recherche globale** : OK. Maintien et non-régression.
- **FR / EN / AR + RTL** : OK. Maintien et non-régression.
- **Continuité identité V2 → V3** : préparée techniquement. Aucune migration
  réelle sans autorisation.

## LOT18 — Stabilisation fonctionnelle & UX

Parent : #118

1. #119 — Documentation, backlog et vérité produit
2. #120 — MFA QR + photos utilisateur et élève
3. #121 — Référentiel académique : navigation et parcours guidé
4. #122 — Inscriptions : réouverture administrative et menu Actions
5. #123 — Présences : persistance, validation explicite et export PDF
6. #124 — Évaluations → notes → moyennes/rangs → bulletins
7. #125 — Documents, cartes scolaires et identité visuelle
8. #126 — Communications + livraison Brevo réelle
9. #127 — Rapports : PDF, UX génération et statuts élèves corrects
10. #128 — Recette multi-rôles + Audit UX
11. #129 — Certification finale

## LOT19 — Exploitation quotidienne

Parent : #130

- emploi du temps ;
- créneaux, salles et détection de conflits ;
- calendrier scolaire et événements ;
- devoirs / travail à faire / agenda élève ;
- vie scolaire : incidents, observations, sanctions ;
- préinscriptions / candidatures / admissions ;
- certification multi-rôles.

## LOT20 — Extensions de gestion

Parent : #131

- RH personnel / contrats / congés / paie ;
- bibliothèque ;
- cantine ;
- transport scolaire ;
- stock / inventaire ;
- paiement bancaire/en ligne.

## Règles produit

- Aucun nouveau grand domaine ne doit masquer un défaut bloquant du cœur
  existant.
- SCHOOL_ADMIN doit pouvoir corriger les erreurs métier réversibles avec
  confirmation et audit.
- Les dépendances entre objets doivent être expliquées dans l'interface avec un
  CTA vers le prérequis.
- Un état affiché après reload doit provenir de la donnée persistée, pas d'un
  état React local.
- Les exports doivent être cohérents avec l'écran et les permissions.
- Les recettes staging multi-rôles doivent être possibles sans publier de
  secrets.
- Aucune production réelle ni migration réelle V2 → V3 sans autorisation
  explicite.
