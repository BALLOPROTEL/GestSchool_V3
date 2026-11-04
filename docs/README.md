# Documentation du projet

Le monorepo est organisé autour de trois applications et de six packages internes :

- `apps/web` : interface Next.js du LOT 1, localisée en français, anglais et arabe ;
- `apps/api` : sondes de santé, IAM LOT 4, annuaires LOT 5, référentiel académique LOT 6, inscriptions LOT 7, Finance LOT 8, résultats LOT 9, documents LOT 10, messagerie LOT 11 et dashboards/rapports LOT 12, durcis au LOT13 ;
- `apps/worker` : contexte NestJS, outbox, génération documentaire, messagerie et exports via BullMQ/Chromium ; sonde HTTP explicitement activée en staging ;
- `packages/config` : configurations TypeScript communes ;
- `packages/ui` : tokens et composants visuels réutilisables du LOT 1 ;
- `packages/database` : propriétaire unique du schéma Prisma 7.10, des migrations, du client, du
  seed et des tests d'intégrité PostgreSQL du LOT 3 ;
- `packages/contracts` : contrats IAM et Zod des annuaires, rôles, permissions et scopes ; `shared` reste sans logique métier ;
- `packages/infrastructure` : clients techniques PostgreSQL, Redis, stockage S3 et rendu PDF fermé.

L'audit exhaustif du prototype et les décisions de portage sont documentés dans
[`design/template-audit.md`](design/template-audit.md).
Le modèle relationnel, les frontières de tenant et la politique de suppression sont documentés
dans [`database/data-model.md`](database/data-model.md).
Les flux d'authentification, les guards, les secrets et les limites sont documentés dans
[`security/iam-auth.md`](security/iam-auth.md).
Le compte rendu des commandes, des 50 tests IAM et de la certification navigateur est dans
[`security/lot4-certification.md`](security/lot4-certification.md).
Le LOT 5 et ses accès locaux sont documentés dans [`lot5-directories.md`](lot5-directories.md).
Son compte rendu de certification est dans [`lot5-certification.md`](lot5-certification.md).
Le référentiel académique est documenté dans [`lot6-academics.md`](lot6-academics.md).
Les inscriptions et leur historique sont documentés dans [`lot7-enrollments.md`](lot7-enrollments.md).
Le compte rendu LOT 7 est dans [`lot7-certification.md`](lot7-certification.md).
Finance est documentée dans [`lot8-finance.md`](lot8-finance.md), avec son compte rendu
dans [`lot8-certification.md`](lot8-certification.md).
Les évaluations, calculs, workflows et bulletins métier sont documentés dans
[`lot9-results.md`](lot9-results.md), avec leur compte rendu dans
[`lot9-certification.md`](lot9-certification.md).
Les documents officiels, PDF privés, QR et leur exploitation sont décrits dans
[`lot10-documents.md`](lot10-documents.md), avec les preuves et le compte rendu des
70 points dans [`lot10-certification.md`](lot10-certification.md).
Le correctif de distribution MinIO/mc pour les runners CI vierges est décrit
dans [`lot10-ci-storage.md`](lot10-ci-storage.md).

## État fonctionnel courant

Les LOTS 0 à 17 ont remplacé les principaux mocks métier visibles par des parcours réels.
Le portail comprend aujourd'hui les domaines IAM, annuaires, académique, inscriptions,
finance, résultats/bulletins, documents, communications, dashboards, rapports, paramètres,
audit, profil, recherche globale et présences.

Cette couverture technique ne signifie pas que tous les parcours sont ergonomiquement ou
fonctionnellement parfaits. La recette propriétaire post-LOT17 a identifié plusieurs écarts
réels : onboarding MFA sans QR, absence de photos élève, référentiel académique difficile à
comprendre, réouverture d'inscriptions, persistance/validation des présences, pipeline
évaluation → note → bulletin, cartes scolaires, communications, rapports et certains réglages.

Ces écarts sont la source du LOT18. Ils sont suivis dans
[functional-roadmap.md](functional-roadmap.md).

## Limites et roadmap

- **LOT18 — Stabilisation fonctionnelle & UX** : corriger les parcours existants avant d'ajouter
  de nouveaux grands domaines.
- **LOT19 — Exploitation quotidienne** : emploi du temps, créneaux/salles/conflits, calendrier,
  devoirs/agenda, vie scolaire et admissions.
- **LOT20 — Extensions de gestion** : RH, bibliothèque, cantine, transport, inventaire et
  paiement bancaire/en ligne.

Le paiement en ligne n'est pas implémenté. La production réelle et le cutover V2 → V3 restent
interdits sans autorisation explicite. V2 reste la référence opérationnelle tant qu'une décision
de production n'est pas prise.

## Sécurité LOT13

Le [rapport de certification locale](lot13-certification.md) détaille les 88 points de revue, résultats, premiers échecs et risques résiduels. Voir l’[audit](security-audit-lot13.md), le [modèle de menace](security-threat-model.md), les [contrôles de durcissement](security-hardening.md) et la [checklist de production future](security-production-checklist.md). Ces preuves LOT13 sont locales ; la certification staging acquise ensuite est décrite ci-dessous.

## Certification staging et exploitation

Le [LOT14](lot14-certification.md) a établi le GO staging fonctionnel. LOT15 a ensuite préparé
les prérequis d'exploitation technique et le rollback sans autoriser de production réelle.
LOT16 a préparé la continuité d'identité V2 → V3 sans migration réelle, puis LOT17 a certifié
les parcours visibles sans mocks métier sur le staging fixe.

Le [plan de cutover V2→V3](deployment/cutover-v2-v3.md) reste non exécuté ; V2 est intacte.
La stabilisation fonctionnelle continue au LOT18 avant tout nouveau GO produit.
