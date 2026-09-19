# LOT 10 — Certification locale GO

Certification clôturée le 14 septembre 2026. Les commandes et scénarios ci-dessous
ont réellement été exécutés. Le verdict concerne le LOT 10 local ; il ne certifie
pas un déploiement de production ni une exécution GitHub Actions distante.

Périmètre exclusif : documents officiels, PDF privés, QR, cartes et vérification
publique. Base de départ `c2c93b2`. Aucun travail LOT 11, aucun commit/push effectué.
L’architecture et les limites d’exploitation sont détaillées dans
[lot10-documents.md](lot10-documents.md).

## Commandes et preuves

Les sorties sont conservées localement dans `.local/lot10-certification-F0tb5x/`,
ignoré par Git. Aucun secret n’est reproduit dans ce rapport.

| Vérification réellement exécutée                              | Résultat                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                              | PASS, installation conforme au lockfile, aucune dépendance RC Prisma                 |
| `pnpm infra:up`                                               | PASS, PostgreSQL/Redis/MinIO healthy                                                 |
| `pnpm infra:check`                                            | PASS, PostgreSQL/Redis/S3 et bucket privé                                            |
| `pnpm db:generate`                                            | PASS, client Prisma 7.10.0                                                           |
| `pnpm db:migrate:deploy`                                      | PASS, 11 migrations appliquées ou déjà appliquées                                    |
| `pnpm db:seed`                                                | PASS                                                                                 |
| `pnpm db:test`                                                | PASS, 18/18                                                                          |
| `pnpm dev:access`                                             | PASS, 7/7 connexions HTTP, MFA selon rôle, 3 documents de démonstration              |
| `pnpm dev:totp school-admin@example.invalid`                  | PASS, code masqué dans la sortie de certification ; fichier d’accès mode 0600        |
| `pnpm format:check` / `pnpm lint` / `pnpm typecheck`          | PASS, dont 15 tâches de typage sans cache ; formatage recontrôlé à la clôture        |
| `pnpm test --force`, puis `pnpm test`                         | PASS, 326 tests dont 3 tests de confidentialité du relais public                     |
| `pnpm build`                                                  | PASS, neuf tâches dont la route dédiée du relais public                              |
| `pnpm iam:test`                                               | PASS, 342/342 tests HTTP/intégration des LOT 4 à 10, dont 42 documentaires           |
| Playwright LOT 10, premier parcours mobile                    | PASS, 1/1 sur 360×800 ; parcours contextuels étendus ensuite                         |
| `pnpm test:e2e` complet                                       | PASS : 97 réussis, 71 exclusions préexistantes, 0 échec ; 24,5 min                   |
| Upgrade depuis la sauvegarde LOT 9                            | PASS : 49 tables, toutes les anciennes colonnes et lignes identiques après migration |
| Upgrade : seed → integrity → documents                        | PASS : 18/18 puis 42/42                                                              |
| Fresh : base vide → migrations → seed → integrity → documents | PASS : 0 table avant migration, 11 migrations, 18/18 puis 42/42                      |
| Empreintes des migrations historiques                         | PASS, 9/9 fichiers inchangés                                                         |
| Backup Figma                                                  | PASS, 88 fichiers ; empreinte agrégée identique au LOT 9                             |

La base fresh est `gestschool_lot10_fresh_f0tb5x`, la copie d’upgrade est
`gestschool_lot10_upgrade_f0tb5x`. Les tests documentaires de ces bases utilisent
respectivement les bases Redis 4/5 et les buckets privés dédiés
`gestschool-lot10-fresh-f0tb5x` / `gestschool-lot10-upgrade-f0tb5x`.
La sauvegarde d’origine et la preuve SHA-256 des données restent privées.

### Playwright et démarrage

La campagne finale compte 168 cas planifiés : **97 réussis, 71 exclusions
préexistantes, zéro échec et zéro flaky**. Aucun nouveau skip, aucune assertion
métier supprimée, aucun retry utilisé sur cette campagne. Durée Playwright :
24,5 minutes ; commande racine complète : 25 min 30 s.
Le scénario LOT 10 passe sur les sept formats : 360×800, 414×896, 768×1024,
1024×768, 1366×768, 1440×900 et 1920×1080. Il couvre les documents contextuels
(profil, bulletin, reçu), les langues FR/EN/AR, la vérification publique, la
révocation et les téléchargements selon les rôles. Les parcours des lots
précédents conservent leurs sélections de viewports existantes.

`pnpm dev` a été lancé : `/fr/login` répond HTTP 200, `/health/live` répond
HTTP 200 avec `status: ok`, `/health/ready` répond HTTP 200 avec PostgreSQL,
Redis et stockage `up`. Le worker a annoncé `GestSchool worker is ready`
avec ses trois dépendances `up`, après le redémarrage décrit plus bas. Son
point d’entrée utilise un contexte NestJS sans serveur HTTP.

Preuves finales : `playwright-complete-final.log`, `quality-complete-final.log`,
`fresh-documents-final.log`, `upgrade-documents-final.log`,
`documents-dev-preservation.log`, `documents-layout-final.log`,
`totp-final.log` et `dev-final.log`, dans le répertoire local indiqué ci-dessus.
Les anciens journaux d’essais interrompus ou échoués sont conservés pour
traçabilité ; ils ne sont pas présentés comme des campagnes réussies.

### Indicateurs observés

Dans les scénarios certifiés, hors erreurs volontairement injectées et refus
attendus des tests négatifs :

```text
PDF generation errors = 0
document number duplicates = 0
QR token leaks = 0
verification enumeration leaks = 0
cross-tenant document access = 0
unauthorized downloads = 0
snapshot mutations = 0
destructive document deletes = 0
worker duplicate finalizations = 0
migration errors = 0
orphan records = 0
console errors = 0
page errors = 0
overflow = 0
dev access regressions = 0
```

Ces résultats décrivent les tests exécutés, pas une garantie universelle.
`orphan records` porte sur les relations PostgreSQL contrôlées, pas sur un
inventaire exhaustif du stockage objet après tout type de crash. Le cas
upload S3 réussi puis arrêt brutal avant commit SQL reste explicitement décrit
dans les limites d’exploitation. Les jetons des accès et journaux applicatifs
testés sont protégés ; les logs d’un futur reverse proxy doivent être configurés
avant exposition publique.

## Technologies réellement installées

| Technologie                                   | Version                     |
| --------------------------------------------- | --------------------------- |
| Node.js / pnpm                                | 24.20.0 / 10.24.0           |
| Next.js / React                               | 16.3.4 / 19.2.8             |
| NestJS                                        | 12.0.1                      |
| Prisma CLI / Client / adaptateur PostgreSQL   | 7.10.0 GA / 7.10.0 / 7.10.0 |
| PostgreSQL / Redis serveur                    | 18.6 / 8.10.1               |
| BullMQ / node-redis                           | 6.3.4 / 6.2.1               |
| Playwright / QRCode                           | 1.62.1 / 1.5.4              |
| Noto Sans / Noto Sans Arabic locales          | 5.3.0 / 5.3.0               |
| SDK S3                                        | 3.1126.0                    |
| pdf-lib / jsQR, vérification des PDF en tests | 1.17.1 / 1.4.0              |
| TypeScript / Vitest                           | 6.0.2 / 5.0.0               |
| Turborepo / Oxlint / Prettier                 | 2.10.12 / 1.81.0 / 3.9.6    |

## Fichiers principaux

- API : `apps/api/src/modules/documents/` contient le module, le service, le
  contrôleur, les policies, le repository, les snapshots, les templates et la
  préparation DEV. Intégration dans `app.module.ts`, permissions dans
  `packages/contracts/src/iam.ts`, contrats dans `packages/contracts/src/documents.ts`.
- Pipeline : `apps/worker/src/jobs/documents-runtime.ts` et
  `documents-generation.ts` ; `packages/infrastructure/src/documents/{config,queue,renderer}.ts`
  et adaptateur `storage/s3-storage-adapter.ts`.
- Base : `packages/database/prisma/schema.prisma`, migrations
  `20260912000100_official_documents` et `20260913000100_document_integrity_hardening`,
  preuve d’upgrade `packages/database/tests/migration-proof.ts`.
- Web : `apps/web/src/features/documents/`, page Documents, route publique
  `[locale]/verify/[token]`, relais `api/v1/public/documents/verify/[token]` ;
  branchements dans `student-profile-page.tsx`, `finance-detail.tsx`, `report-cards.tsx`,
  providers et configuration Next. Anciens mocks Documents retirés.
- Tests : `apps/api/tests/documents.test.ts`, `pdf-evidence.ts`, fixtures
  `e2e-server.ts`, `apps/web/e2e/documents.spec.ts`, diagnostics expurgés dans
  `academic-helpers.ts`, tests des policies, du renderer et du relais public.
- DEV/CI : `dev-access.ts`, préservation dans `grades.dev.ts`, événement d’annulation
  dans `finance/infrastructure/payments.ts`, rate limiter IAM, `.github/workflows/ci.yml`,
  `.env.example`, manifestes des trois packages concernés, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, `turbo.json` et scripts racine.
- Documentation : `docs/lot10-documents.md`, ce compte rendu et `docs/README.md`.

## Compte rendu des 70 points demandés

| Nº  | Sujet                    | Réalisation / preuve                                                                                                                                                                                              |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Architecture Documents   | Module API domain/application/infrastructure/presentation ; contrôleurs sans Prisma                                                                                                                               |
| 2   | Fichiers                 | Nouveaux répertoires `apps/api/src/modules/documents`, `apps/worker/src/jobs`, `packages/infrastructure/src/documents`, `apps/web/src/features/documents` ; contrats, routes, tests, CI et documentation associés |
| 3   | Modèles et migrations    | 49 modèles préservés ; 50 au total avec DocumentCounter ; deux migrations additives LOT 10, aucune réécriture historique                                                                                          |
| 4   | Types                    | REPORT_CARD, TRANSCRIPT, SCHOOL_CERTIFICATE, ENROLLMENT_CERTIFICATE, STUDENT_CARD, RECEIPT                                                                                                                        |
| 5   | Templates                | Déclaration fermée renderer/couleur/pied de page, pas de HTML utilisateur                                                                                                                                         |
| 6   | Versioning               | Version par tenant/type/langue ; publication immuable protégée en SQL                                                                                                                                             |
| 7   | Snapshots                | Reconstruction PostgreSQL, figée dès la demande ; aucun contenu métier arbitraire du navigateur                                                                                                                   |
| 8   | Moteur PDF               | HTML/CSS fermé → Chromium/Playwright ; polices embarquées, timeout et limite 10 Mo                                                                                                                                |
| 9   | Worker                   | Contexte NestJS sans serveur HTTP, démarrage et arrêt propres                                                                                                                                                     |
| 10  | BullMQ                   | Queue documentaire seule, node-redis réutilisé ; trois tentatives, backoff exponentiel                                                                                                                            |
| 11  | Outbox                   | Document + événement + audit dans la même transaction ; acheminement sous verrou et jobId idempotent                                                                                                              |
| 12  | S3/MinIO                 | Bucket privé ; téléchargement par l’API authentifiée, aucune URL publique permanente                                                                                                                              |
| 13  | Clés                     | `tenants/{tenantId}/documents/{documentId}/{sha256}.pdf`, sans identité lisible                                                                                                                                   |
| 14  | Checksums                | SHA-256 des octets stockés, revérifié au téléchargement                                                                                                                                                           |
| 15  | Numérotation             | Compteur atomique tenant/préfixe/année ; dix demandes concurrentes testées                                                                                                                                        |
| 16  | QR                       | QR réellement inclus dans le PDF et décodé lors des tests                                                                                                                                                         |
| 17  | Jeton                    | 256 bits aléatoires ; seul SHA-256 en base ; brut en mémoire de rendu et dans le PDF                                                                                                                              |
| 18  | API publique             | `GET /api/v1/public/documents/verify/:token` ; VALID/REVOKED/INVALID, payload minimal                                                                                                                             |
| 19  | UI publique              | `/{locale}/verify/{token}` sans connexion, no-index/no-referrer ; relais Next sans journalisation du jeton en cas de panne                                                                                        |
| 20  | Rate limit               | Redis, 30/minute par IP observée/endpoint, jeton exclu de la clé ; 429 préservé par le relais                                                                                                                     |
| 21  | Révocation               | Motif, acteur, date, audit ; aucun effacement et QR REVOKED                                                                                                                                                       |
| 22  | Réémission               | Nouvel ID, numéro, QR, checksum et lien vers l’original ; original inchangé                                                                                                                                       |
| 23  | Bulletins                | Snapshot/lignes publiés LOT 9, jamais les notes actuelles recalculées                                                                                                                                             |
| 24  | Relevés                  | Relevé de la période publiée ; pas de moyenne annuelle inventée                                                                                                                                                   |
| 25  | Certificats              | Élève/inscription/année actifs, inscription non terminée, source réelle                                                                                                                                           |
| 26  | Attestations             | ENROLLMENT_CERTIFICATE distinct du certificat de scolarité ; inscription/réinscription conservée                                                                                                                  |
| 27  | Reçus                    | Reçu/paiement/ventilations réels, montant exact ; paiement reversed immédiatement non valide publiquement                                                                                                         |
| 28  | Cartes                   | Identité scolaire minimale, QR et fallback photo ; aucune donnée parent/finance/adresse privée                                                                                                                    |
| 29  | Format carte             | PDF d’une page, dimensions 85,60 × 53,98 mm vérifiées ; impression à 100 %                                                                                                                                        |
| 30  | RBAC                     | Types et permissions selon rôle, refus par défaut                                                                                                                                                                 |
| 31  | OWN                      | Vérification du userId de l’élève en lecture et téléchargement                                                                                                                                                    |
| 32  | CHILDREN                 | Relation parent/enfant active relue ; autre enfant refusé malgré UUID connu                                                                                                                                       |
| 33  | Multi-tenant             | Tenant du contexte, relations composites, sources et templates contraints                                                                                                                                         |
| 34  | Audit                    | requested/generated/failed/downloaded/revoked/reissued et template.created/updated/published ; append-only préservé                                                                                               |
| 35  | Documents UI             | Liste réelle, recherche/pagination serveur, état asynchrone, génération/téléchargement/révocation/réémission                                                                                                      |
| 36  | Student Profile          | Onglet Documents branché sur le même module, sans mock                                                                                                                                                            |
| 37  | Finance                  | Génération et téléchargement depuis le reçu réel, statut historique conservé                                                                                                                                      |
| 38  | Results                  | Actions PDF à côté du bulletin publié ; contenu figé de l’aperçu LOT 9 conservé                                                                                                                                   |
| 39  | FR/EN/AR                 | Libellés des interfaces et templates, QR vers la langue d’émission                                                                                                                                                |
| 40  | RTL                      | Cartes FR/EN/AR : limites physiques et glyphes arabes vérifiés ; parcours UI complets PASS                                                                                                                        |
| 41  | Accessibilité            | Dialogues/composants LOT 1 réutilisés ; contrôles axe et débordement dans Playwright                                                                                                                              |
| 42  | Tests PDF                | Signature `%PDF-`, MIME, octets non vides, SHA-256, six types et dimensions physiques                                                                                                                             |
| 43  | Tests QR                 | Décodage de l’image du PDF, format 256 bits, absence du brut en base/audits                                                                                                                                       |
| 44  | Verification tests       | VALID/REVOKED/INVALID, minimalité et limitation 429                                                                                                                                                               |
| 45  | Worker tests             | READY rejoué dix fois, bail actif non volé, bail expiré repris, échec puis FAILED                                                                                                                                 |
| 46  | Outbox tests             | Passage réel outbox → BullMQ → PDF ; redémarrage worker sans double finalisation                                                                                                                                  |
| 47  | Storage tests            | Accès S3 anonyme 403, téléchargement autorisé et empreinte cohérente                                                                                                                                              |
| 48  | Concurrence              | Dix mêmes clés → un document/un événement ; dix clés distinctes → dix références uniques                                                                                                                          |
| 49  | Snapshot tests           | Renommage élève/classe/matière sans mutation des snapshots/PDF historiques                                                                                                                                        |
| 50  | SSRF/injection           | Données échappées, URL/CSS arbitraires rejetées, piège HTTP local non contacté lors d’un vrai rendu                                                                                                               |
| 51  | RBAC tests               | Admin, comptable, enseignant, parent, élève et tenant étranger ; accès non autorisés refusés                                                                                                                      |
| 52  | Playwright               | 97 PASS, 71 exclusions préexistantes, 0 échec/0 flaky ; LOT 10 PASS sur les sept dimensions en FR/EN/AR                                                                                                           |
| 53  | Upgrade LOT 9            | 49 tables et toutes les anciennes valeurs conservées ; 18+42 tests PASS                                                                                                                                           |
| 54  | Fresh DB                 | 0 table initiale ; 11 migrations → seed → 18+42 tests PASS                                                                                                                                                        |
| 55  | Accès DEV                | Sept connexions HTTP/MFA PASS après réexécution ; trois mêmes documents préservés, TOTP revalidé                                                                                                                  |
| 56  | LOT 1                    | Tokens et bibliothèque UI inchangés ; campagne complète PASS, dont accessibilité et sept dimensions                                                                                                               |
| 57  | LOT 2                    | Infrastructure et sondes PASS ; aucun volume détruit                                                                                                                                                              |
| 58  | LOT 3                    | Prisma 7.10 GA, seed et contraintes historiques conservés, 18/18 tests                                                                                                                                            |
| 59  | LOT 4                    | IAM/MFA inchangés en production ; suites HTTP et parcours IAM PASS                                                                                                                                                |
| 60  | LOT 5                    | Identités et liens existants réutilisés ; tests HTTP et E2E annuaires PASS                                                                                                                                        |
| 61  | LOT 6                    | Référentiel et affectations inchangés ; tests HTTP et E2E académiques PASS                                                                                                                                        |
| 62  | LOT 7                    | Workflow/historique inchangés ; tests HTTP et E2E inscriptions PASS                                                                                                                                               |
| 63  | LOT 8                    | Événement d’outbox ajouté à l’annulation ; paiements inchangés ; tests HTTP et E2E Finance PASS                                                                                                                   |
| 64  | LOT 9                    | Calculs/workflows/migrations inchangés ; snapshots publiés conservés ; tests HTTP et E2E Résultats PASS                                                                                                           |
| 65  | Correctifs CI/E2E        | Locators people et helper MFA conservés ; concurrence de tests 2 partagée racine/CI ; aucune assertion retirée                                                                                                    |
| 66  | Backup Figma             | 88 fichiers intacts ; SHA-256 `e6045bf5ccc18cf913756be7dadf5e4c0a6f3b2fc77bffe8c96b21923978abff`                                                                                                                  |
| 67  | Écarts                   | Bibliothèques Chromium locales faute de sudo ; photos/logos absents non inventés ; relevé périodique ; limites d’exploitation documentées                                                                         |
| 68  | Reporté / hors périmètre | Aucun Messaging/Brevo/WhatsApp/SMS/email réel, R2 production, paiement en ligne ou autre module LOT 11                                                                                                            |
| 69  | Verdict                  | GO local : commandes, 342 tests d’intégration, 97 E2E, upgrade et fresh PASS ; CI GitHub distante non observée                                                                                                    |
| 70  | Commit proposé           | `feat(documents): add private official PDFs, secure QR verification and worker pipeline (lot 10)`                                                                                                                 |

## Échecs rencontrés et corrigés

- Le test mobile lisait une réponse de login après navigation : lecture immédiate
  du corps avant navigation, sans affaiblir le login/MFA.
- L’onglet Documents du profil était initialement hors du composant Tabs : replacé
  dans la liste correcte ; parcours contextuel ajouté à Playwright.
- Les actions PDF asynchrones pouvaient modifier le texte du bloc de bulletin
  immuable : déplacées à côté du bloc, assertions LOT 9 conservées.
- Le helper de génération attendait le sélecteur de source même depuis un
  bulletin/reçu, où la source est contractuellement fixée. Il distingue désormais
  les deux points d’entrée, vérifie l’absence attendue du sélecteur contextuel
  et contrôle le type/source/langue réellement envoyés à l’API. La campagne ayant
  reproduit ce défaut sur deux viewports a été arrêtée proprement pour correction.
- Les cinq anciens mocks Documents, devenus inutilisés, ont été retirés ; les
  autres mocks hors périmètre sont conservés.
- Le contrôle du rendu imprimable a montré que la hauteur de ligne native de
  Noto Sans Arabic coupait le bas du QR d’une carte ID-1. Une hauteur de ligne
  explicite et un QR non compressible corrigent ce défaut. Trois tests réels
  FR/EN/AR vérifient les limites physiques, les polices, la direction, la page PDF
  unique et son QR. Les rendus fictifs ont aussi été inspectés visuellement.
- Une seconde exécution DEV sélectionnait la nouvelle inscription documentaire
  au lieu de celle de la démonstration Résultats déjà préparée. La recherche du
  marqueur DEV porte maintenant sur les inscriptions du même élève/tenant avant
  toute création. Le test réel préserve les bulletins et une année à période unique ;
  aucun calendrier ou workflow de production n’est modifié.
- Les diagnostics Playwright expurgent les jetons des URLs de vérification en cas
  d’erreur ; les assertions console/page/API restent strictement à zéro erreur.
- Sous concurrence racine illimitée, Argon2 dépassait 5 s. Limitation des packages
  concurrents à 2, identique à la CI existante ; Argon2 et timeouts inchangés.
  Réexécution sans cache : test cryptographique PASS en environ 3 s.
- Le proxy générique Next journalise son URL cible lors d’une panne réseau : relais
  dédié ajouté pour ne jamais journaliser le jeton QR, avec tests d’erreur/429.
  Le premier lancement complet Playwright a été interrompu volontairement avant
  exécution des scénarios afin d’intégrer ce durcissement.
- `playwright install --with-deps chromium` demande un mot de passe sudo absent
  sur ce poste. Les bibliothèques locales LOT 9 sont utilisées ; la CI conserve
  l’installation officielle.
- Lors du smoke DEV final, la première sonde PostgreSQL du worker a échoué
  (sonde existante bornée à deux secondes). L’API a ensuite confirmé les trois
  dépendances disponibles ; `pnpm infra:check` a repassé tous ses contrôles.
  Sa reconstruction des packages a déclenché le redémarrage des watchers :
  le worker a alors confirmé deux démarrages avec toutes les dépendances `up`.
  Aucun timeout, contrôle de santé ou paramètre de connexion n’a été affaibli.
  Le journal conserve cet incident transitoire ; sa cause temporelle exacte
  n’a pas été instrumentée et n’est donc pas affirmée.

La CI distante ne peut pas être déclarée verte sans push et sans exécution GitHub
observée. Les verdicts de ce document portent exclusivement sur la certification
locale des commandes et des scénarios.
