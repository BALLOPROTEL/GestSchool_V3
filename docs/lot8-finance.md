# LOT 8 — Finance

LOT 8 certifié **GO** : voir [le compte rendu complet](./lot8-certification.md).
Les modules Notes/Bulletins (LOT 9), PDF/QR (LOT 10) et prestataires de paiement restent exclus.

## Architecture et conventions

`apps/api/src/modules/finance` possède frais, grilles, échéanciers, factures, ajustements,
paiements, allocations, reversals, reçus et caisse. Les contrôleurs utilisent le service applicatif,
qui valide les contrats Zod et les permissions avant le port de repository. Les transactions,
lectures, écritures et snapshots restent dans l’infrastructure Finance. `finance.dev.ts` est
l’entrée publique exclusivement locale des fixtures ; aucun autre module ne manipule ses repositories.

- Prisma, client et adaptateur PostgreSQL restent en **7.10.0 GA**.
- Montants SQL `BIGINT`, calculs TypeScript `bigint`, JSON chaînes décimales canoniques.
  Aucun `Number`, `parseFloat` ou arrondi flottant pour l’argent. Les compteurs/paginations/dates
  ne sont pas des valeurs monétaires.
- Registre ISO explicite XOF (0), EUR/USD/GBP (2). Affichage localisé via `Intl` et `BigInt` ;
  les décimales sont produites par division et reste entiers. Extensions de devises via ce registre.
- Un échéancier complet couvre exactement son tarif, avec montants positifs, ordres uniques,
  dates chronologiques dans l’année, au plus 100 échéances par tarif et 100 tarifs par grille.
  Sans échéancier, le tarif est dû intégralement à sa date limite.
- Une facture est créée et émise atomiquement pour une inscription **ACTIVE**, un élève actif,
  une classe/niveau actifs et une année DRAFT/ACTIVE. Les inscriptions historiques terminées,
  transférées hors établissement ou WITHDRAWN ne reçoivent pas de nouvelles factures.
  Le recouvrement des factures historiques reste possible après clôture de l’année.
- Les lignes copient le libellé et chaque échéance ; nom d’élève, classe et année sont figés.
  La modification d’une grille ne réécrit aucune facture émise. Les anciens champs de provenance
  restent nullables pour ne pas inventer de liens historiques.
- Ajustements signés : DISCOUNT/SCHOLARSHIP/CREDIT négatifs, DEBIT positif, CORRECTION signé.
  Raison et acteur obligatoires. Aucun pourcentage implicite. Une réduction ne peut faire tomber
  le total sous le montant déjà encaissé. Les crédits puis paiements couvrent les échéances dans
  l’ordre chronologique ; les débits additionnels sont dus à la dernière échéance de la facture.
- Un paiement couvre une ou plusieurs factures du **même élève, tenant et devise**.
  Pour LOT 8, tout son montant est ventilé : pas de portefeuille de crédits non affectés.
  Une facture peut recevoir plusieurs paiements partiels.
- `PENDING → COMPLETED` par validation explicite. Les paiements PENDING ne réservent pas le solde :
  montant disponible contrôlé à la saisie et revérifié sous verrou à la validation.
  Un paiement PENDING erroné peut être rejeté (`POST payments/:id/reject`, permission
  `payments.validate`, raison obligatoire) : statut FAILED, audit, allocations conservées.
  Cette action libère notamment la clôture d'une caisse sans supprimer le paiement.
  `COMPLETED → REVERSED` exige une demande d’annulation préalable conservant raison/acteur/date,
  puis une contre-écriture intégrale. Le paiement original, ses allocations et son reçu sont conservés.
- Numéros `FAC/PAY/REC/REV-annéeUTC-séquence` distincts des UUID, uniques par tenant.
  Séquence calculée sous verrou du tenant, sans compteur JS flottant.
- Idempotency-Key obligatoire à la création de paiement, préfixée `payment:create:` dans le tenant.
  Empreinte SHA-256 du contrat normalisé (allocations triées). Même clé/contenu : même paiement ;
  contenu différent : 409. Le navigateur conserve la clé lors des reprises réseau/refresh.
- Une seule caisse OPEN par caissier et tenant. CASH exige sa caisse ouverte dans la même devise.
  Clôture interdite si des paiements de cette caisse sont PENDING. Le solde attendu = ouverture +
  encaissements validés initiaux − remboursements effectués dans cette caisse. Une annulation
  après clôture passe par une caisse actuellement ouverte ; elle ne réécrit pas l’ancienne clôture.
- Les lectures utilisent des transactions RepeatableRead. Filtres de propriété appliqués avant
  pagination et agrégats SQL. Hydratation groupée des relations, sans N+1 par facture ou paiement.
- Les écritures partagent le verrou du tenant avec People/Academics/Enrollments. Les triggers
  SQL verrouillent aussi ce tenant. Contrôles différés pour les écritures atomiques et protections
  immédiates contre la réécriture de pièces validées. Ce choix conservateur est adapté au MVP ;
  des verrous plus fins pourront être étudiés sans changer les garanties monétaires.
- Audit append-only avec identifiants tenant/acteur/requête, date serveur et snapshots financiers
  sérialisés sans secrets. Les informations des reçus sont métier, sans génération PDF/QR.

## Autorisations

SCHOOL_ADMIN et ACCOUNTANT : finance opérationnelle TENANT. ACCOUNTANT obtient uniquement les
permissions `academic-years.read`, `levels.read`, `classes.read` et `enrollments.read` nécessaires
à la sélection des références ; aucun droit notes ni mutation académique. La lecture des matières
attachées à une classe utilise déjà `classes.read` dans le LOT 6 ; ce rattachement est conservé.
DIRECTOR : lectures TENANT et validation des paiements. ACADEMIC_STAFF/TEACHER : pas de finance
administrative. PARENT : CHILDREN ; STUDENT : OWN, uniquement les factures/paiements/reçus/soldes.
La caisse et les catalogues de frais ne sont pas exposés aux lectures OWN/CHILDREN.
`RequestContext` est l’unique source du tenant. Body/query stricts ; `X-Tenant-ID` rejeté.

## Migration et premières preuves

Migration additive `20260909000100_finance` : une table `fee_installments`, nouveaux champs,
liens multi-tenant, index, CHECK et triggers ; aucune suppression ou réécriture historique.
Migration additive `20260909000200_finance_workflow_guards` : garde SQL à l'émission pour
l'inscription active et les références académiques, cohérence des dates/tarifs, statut de facture
dérivé du solde et caisse non négative. Aucun changement de migration historique.
L’empreinte locale avant/après migration porte sur les 48 tables et leurs colonnes LOT 7 :
**48 comparées, 0 modifiée**, avant toute exécution du seed et des nouvelles fixtures.

Résultats exécutés : génération Prisma, migrations, seed, 52 tests HTTP Finance,
37 tests unitaires métier/contrats, 15 tests de présentation monétaire et 18 tests d’intégrité.
La base neuve `gestschool_lot8_cert_20260909_01`, créée depuis TEMPLATE0 avec zéro table publique,
a passé les sept migrations, seed, 18/18 tests d'intégrité puis 52/52 tests Finance.
La certification globale ajoute 245 tests HTTP, 221 tests unitaires et 74 parcours Playwright réussis.
Une alerte pg 8.23 sur les relations Prisma parallèles
est traitée par hydratation séquentielle groupée, sans masquer les warnings.

La page Finance et l’onglet Finance du profil sont connectés. Les composants UI LOT 1 sont réutilisés ;
les mocks Finance ne sont plus importés par la route. Traductions FR/EN/AR et montants exacts présents.
Parcours navigateur complets, sept viewports/RTL, fixtures locales idempotentes,
suite IAM/People/Academics/Enrollments et contrôles qualité validés. Les 66 skips Playwright
correspondent aux répétitions réservées à certaines résolutions, aucun scénario échoué n'est ignoré.

## Données locales et préservation de l'historique

`pnpm dev:access` conserve les sept comptes et vérifie leur authentification HTTP/MFA avant
d'écrire le fichier privé `.local/test-access.json` (0600). Chaque exécution renouvelle les secrets.
Finance ajoute trois factures XOF de 300 000 (impayée, partielle de 100 000, soldée de 300 000),
leurs échéances, deux reçus et une caisse ; un marqueur par inscription empêche leur duplication.
Si l'inscription de démonstration a déjà été terminée/retirée par l'utilisateur, la préparation
locale Academics/Enrollments crée un cycle suivant et réutilise l'historique réel du même élève.
Elle ne rouvre ni ne réécrit l'inscription terminée. Ce comportement reste limité aux fixtures
locales explicites ; ni le seed de production ni les règles HTTP ne sont modifiés.
