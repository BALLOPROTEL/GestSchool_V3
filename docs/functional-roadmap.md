# Roadmap fonctionnelle GestSchool V3

Dernière mise à jour : **après clôture complète du LOT18**.

Cette page est la source de vérité produit. GestSchool V3 reste **staging uniquement** :
aucune production réelle, aucun cutover V2 → V3 et aucun onboarding d'établissement réel
sans autorisation explicite du propriétaire.

## Référence certifiée

- `main` : `9b8ff4196a0352582506be7ce1c3b79b1996cb7a`
- CI main #506 : **SUCCESS**
- Vercel staging : **READY**
- Render API : **LIVE**
- Render worker : **LIVE**
- Codex final : aucun finding non résolu
- Snyk : **SUCCESS**
- recette manuelle propriétaire LOT18 : **PASS**

## État du cœur existant

- **Authentification / MFA / sessions / RBAC / multi-tenant** : opérationnel ; QR MFA + fallback manuel validés.
- **Élèves / parents / enseignants** : opérationnels ; avatars utilisateur et élève privés validés.
- **Référentiel académique** : navigation guidée et prérequis explicites validés.
- **Inscriptions / réinscriptions / transferts** : opérationnels ; réouverture administrative auditée validée.
- **Présences / absences / retards** : persistance, concurrence, validation explicite et export PDF validés.
- **Évaluations / notes / moyennes / rangs / bulletins** : pipeline bout-en-bout et PDF validés.
- **Finance** : fonctionnelle et couverte par les certifications transverses.
- **Documents / cartes scolaires / PDF / QR / branding** : opérationnels et validés.
- **Communications IN_APP / email Brevo staging** : opérationnelles et validées.
- **Dashboards par rôle** : recette multi-rôles validée.
- **Rapports** : CSV/XLSX/PDF, statuts et UX de génération validés.
- **Administration utilisateurs / invitations / rôles** : opérationnelle.
- **Paramètres établissement** : opérationnels.
- **Audit** : journal réel + détail UX sûr et accessible validés.
- **Profil / sécurité** : opérationnel.
- **Recherche globale** : opérationnelle.
- **FR / EN / AR + RTL** : maintenus et certifiés sur les parcours touchés.
- **Continuité identité V2 → V3** : préparée techniquement ; aucune migration réelle autorisée.

## LOT18 — Stabilisation fonctionnelle & UX — TERMINÉ

Parent : #118

- [x] #119 — Documentation, backlog et vérité produit
- [x] #120 — MFA QR + photos utilisateur et élève
- [x] #121 — Référentiel académique : navigation et parcours guidé
- [x] #122 — Inscriptions : réouverture administrative et menu Actions
- [x] #123 — Présences : persistance, validation explicite et export PDF
- [x] #124 — Évaluations → notes → moyennes/rangs → bulletins
- [x] #125 — Documents, cartes scolaires et identité visuelle
- [x] #126 — Communications + livraison Brevo réelle
- [x] #127 — Rapports : PDF, UX génération et statuts élèves
- [x] #128 — Recette multi-rôles + Audit UX
- [x] #129 — Certification finale

Follow-ups absorbés et fermés : #110, #112, #114.

## LOT19 — Exploitation quotidienne — PROCHAIN CHANTIER

Parent : #130 — **READY** après nettoyage GitHub post-LOT18.

Ordre prévu :
1. emploi du temps ;
2. créneaux, salles et détection de conflits ;
3. calendrier scolaire et événements ;
4. devoirs / travail à faire / agenda élève ;
5. vie scolaire : incidents, observations, sanctions ;
6. préinscriptions / candidatures / admissions ;
7. certification finale multi-rôles.

Pré-flight :
- #138 — mode break-glass SUPER_ADMIN audité sur les actions sensibles pertinentes ;
- réévaluer les nouvelles PR Dependabot propres depuis `main` ;
- conserver staging-only tant qu'aucune autorisation de production n'est donnée.

## LOT20 — Extensions de gestion — BACKLOG FUTUR

Parent : #131

- RH personnel / contrats / congés / paie ;
- bibliothèque ;
- cantine ;
- transport scolaire ;
- stock / inventaire ;
- paiement bancaire/en ligne.

LOT20 ne démarre qu'après LOT19 et sa certification finale.

## Règles produit

- Aucun nouveau grand domaine ne doit masquer un défaut bloquant du cœur existant.
- SCHOOL_ADMIN doit pouvoir corriger les erreurs métier réversibles avec confirmation et audit.
- SUPER_ADMIN ne dispose d'aucun bypass silencieux ; tout break-glass légitime doit être justifié et audité (#138).
- Les dépendances entre objets doivent être expliquées dans l'interface avec un CTA vers le prérequis.
- Un état affiché après reload doit provenir de la donnée persistée, pas d'un état React local.
- Les exports doivent être cohérents avec l'écran et les permissions.
- Les recettes staging multi-rôles doivent être possibles sans publier de secrets.
- Aucune production réelle ni migration réelle V2 → V3 sans autorisation explicite.
