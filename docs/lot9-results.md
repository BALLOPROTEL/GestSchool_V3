# LOT 9 — Évaluations, notes et bulletins métier

Implémentation certifiée **GO local** : voir le [compte rendu de certification](lot9-certification.md).
Socle : commit `a75ad90`, [CI LOT 8 verte](https://github.com/BALLOPROTEL/GestSchool_V3/actions/runs/34514962794).
Prisma/client/adapter-pg restent en 7.10.0 GA. Aucun LOT 10, PDF ou QR.

## Architecture et préservation

Le module Grades possède les évaluations, notes, corrections et bulletins, avec les couches
`application`, `domain`, `infrastructure`, `presentation/http`. Contrats HTTP partagés dans
`packages/contracts/src/results.ts`. Aucun accès Prisma depuis les contrôleurs.
Les 49 modèles courants, dont les 43 modèles historiques, sont conservés.
La migration LOT 9 est nouvelle ; aucune migration antérieure n'est réécrite.

Les notes et moyennes persistées restent NUMERIC(7,2). Un outcome explicite SCORED, ABSENT,
EXCUSED ou NOT_GRADED détermine si la valeur numérique doit exister. Les anciens CHECK positifs
restent présents ; les NOT NULL des notes sont remplacés par des contraintes conditionnelles
plus précises, sans convertir les absences en zéro. Les anciennes notes deviennent SCORED.
Les corrections gardent ancien/nouveau score, outcome, commentaire, acteur, raison et requestId.

## Calculs déterministes

Les entrées décimales sont des chaînes (deux décimales maximum). Le stockage utilise Prisma
Decimal/PostgreSQL NUMERIC ; les calculs utilisent des fractions exactes de BigInt, sans float.
Échelle officielle : `tenant_settings.values.gradingScale`, ou 20 si absente.

- Note normalisée : score / maximum de l'évaluation × échelle officielle.
- Moyenne matière : somme(note normalisée × poids) / somme(poids).
- Moyenne générale : somme(moyenne matière exacte × coefficient class_subjects) / somme(coefficients applicables).
- Aucun arrondi intermédiaire ; affichage/persistance finale à deux décimales, HALF_UP.
- Rang de compétition sur la moyenne générale affichée : 1, 2, 2, 4. Les résultats insuffisants n'ont pas de rang.
- EXCUSED est exclu des poids ; une matière entièrement dispensée est exclue des coefficients.
- ABSENT, NOT_GRADED ou une saisie manquante rendent le résultat incomplet, jamais égal à zéro.
- Une matière sans évaluation n'est pas assimilée à une dispense. Une publication incomplète est refusée.
- Les calculs de période utilisent uniquement les évaluations PUBLISHED/LOCKED ; la présence d'évaluations non publiées empêche la finalisation.

## Historique et population

L'éligibilité repose sur l'inscription et son dernier événement effectif à la date de l'évaluation.
Pour les inscriptions sans événements historiques, seules les dates et le statut connus sont utilisés.
Le classement d'une période utilise la classe d'inscription à la fin de cette période, sans mélanger
les classes ou tenants. Une évaluation antérieure à l'arrivée dans la classe n'est pas une note manquante.

Le workflow des évaluations et de leurs notes est atomique : DRAFT → SUBMITTED → VALIDATED →
PUBLISHED → LOCKED. La seule réouverture prévue est SUBMITTED → DRAFT, par un valideur avec raison.
Une version optimiste empêche l'écrasement des saisies concurrentes. Le verrou du tenant est commun
à ceux des modules Academics/Enrollments/Finance pour les écritures dépendantes.

Les bulletins publiés sont immuables dès publication, comme au LOT 3, y compris leurs lignes.
Leur verrouillage ultérieur est un événement d'audit append-only unique ; le statut présenté devient
LOCKED sans UPDATE de la ligne publiée. Le trigger historique `report_cards_snapshot_guard` reste
strictement inchangé. Aucune correction exceptionnelle de note LOCKED ni révision d'un bulletin
publié n'est autorisée dans ce MVP.

Les parents/élèves ne voient que leurs notes publiées et les snapshots publiés de leurs bulletins.
Les moyennes live et la population détaillée de classe sont réservées aux gestionnaires autorisés.
Les enseignants ne voient/saisissent que les couples classe-matière-période réellement affectés.

## API

Préfixe commun `/api/v1`, IAM, CSRF et RequestContext existants. Toutes les listes sont
paginées et filtrées dans PostgreSQL avant comptage ; aucun tenantId ne vient du formulaire.

| Méthode     | Chemin                                            | Fonction                                                |
| ----------- | ------------------------------------------------- | ------------------------------------------------------- |
| GET / POST  | `/assessments`                                    | Liste filtrée / création sur affectation réelle         |
| GET / PATCH | `/assessments/:id`                                | Détail / modification du brouillon avec expectedVersion |
| POST        | `/assessments/:id/archive`                        | Archivage du brouillon, jamais DELETE                   |
| GET / PUT   | `/assessments/:id/grades`                         | Population datée / sauvegarde bulk transactionnelle     |
| PATCH       | `/grades/:id`                                     | Modification en brouillon via les mêmes contrôles bulk  |
| POST        | `/assessments/:id/submit`                         | Soumission complète                                     |
| POST        | `/assessments/:id/validate`                       | Validation indépendante du soumetteur                   |
| POST        | `/assessments/:id/publish`                        | Publication atomique évaluation + notes                 |
| POST        | `/assessments/:id/lock`                           | Verrouillage irréversible                               |
| POST        | `/assessments/:id/reopen`                         | SUBMITTED → DRAFT, raison obligatoire                   |
| POST / GET  | `/grades/:id/correct`, `/grades/:id/changes`      | Correction publiée / historique autorisé                |
| GET         | `/results/class?classId=…&academicPeriodId=…`     | Moyennes matières/générale, population et rangs         |
| GET         | `/report-cards?studentId=…&academicPeriodId=…`    | Résultats historiques élève/période                     |
| GET / PATCH | `/report-cards/:id`                               | Snapshot / appréciations en brouillon                   |
| POST        | `/report-cards/generate`, `/report-cards/publish` | Génération/finalisation de toute une classe/période     |
| POST        | `/report-cards/:id/lock`                          | Événement de verrouillage append-only                   |

Les décimaux transitent en chaînes ; `expectedVersion` est obligatoire sur les mutations des
évaluations/notes. Une version périmée produit `RESULT_STALE_VERSION` (409), sans écrasement.
Les corps sont des objets Zod stricts : tenant, rôle, statut arbitraire ou propriétés inconnues refusés.

## Permissions et audit

SCHOOL_ADMIN et DIRECTOR : permissions académiques TENANT. ACADEMIC_STAFF : saisie,
validation indépendante et publication, sans correction publiée ni verrouillage élevé.
TEACHER : lecture/création/modification/soumission ASSIGNED, vérifiée sur le couple exact
class_subject + période + enseignant actif lié au userId. Aucun droit implicite sur les autres matières.
PARENT : CHILDREN réels et actifs ; STUDENT : OWN réel ; tous deux uniquement en lecture publiée.
ACCOUNTANT : aucun accès aux notes. SUPER_ADMIN nécessite explicitement le scope PLATFORM et
le rôle système correspondant. Les agrégats live de classe ne sont pas exposés aux familles ni enseignants.

Les actions `assessment.created/updated/submitted/validated/published/locked`,
`grade.created/updated/corrected` et `report_card.generated/published/locked` sont auditées.
Les réouvertures, archivages et appréciations le sont également. Le requestId accompagne
les valeurs avant/après ; aucun secret IAM. Le journal de correction est protégé contre
UPDATE/DELETE/TRUNCATE. Une correction publiée nécessite en base son entrée historique exacte.

## Interface et données locales

La page `/grades` utilise les composants UI existants, sans nouvelles dépendances. Les faux
résultats ont été retirés. Filtres année/période/classe/matière/statut, saisie bulk, barème/poids,
validation inline, état enregistré, navigation Tab/Shift+Tab/Enter/Shift+Enter, dialogues de
confirmation, historique de correction, résultats de classe et prévisualisation des bulletins.
Les filtres/changements d'évaluation sont bloqués pendant une saisie non enregistrée ; la
fermeture du navigateur avertit. Les tables défilent localement sans élargir la page.
Toutes les nouvelles chaînes et erreurs sont traduites en FR/EN/AR, avec chiffres isolés en RTL.
Le profil élève charge les mêmes API dans l'onglet académique ; Finance et inscriptions restent en place.
Les familles utilisent les mêmes écrans avec les scopes serveur, sans filtre de sécurité côté client.

`pnpm dev:access` prépare, via l'entrée publique locale `grades.dev.ts`, une évaluation publiée,
un brouillon sur 50, une soumission sur 20, plusieurs élèves inscrits et un bulletin historique
avec ex æquo. Le marqueur transactionnel évite toute duplication ou remise à zéro des essais
utilisateur. Si d'autres matières ont été ajoutées à la classe de démo, les bulletins restent
en brouillon tant que leurs résultats ne sont pas complets. Aucun état historique n'est forcé.
Les sept comptes et `pnpm dev:totp school-admin@example.invalid` sont conservés ; comme auparavant,
`dev:access` renouvelle les secrets locaux et révoque leurs anciennes sessions. Les secrets sont
uniquement dans `.local/`, ignoré par Git, jamais dans cette documentation.

Sur le poste WSL de certification, les trois bibliothèques Chromium manquantes sont extraites
localement depuis les paquets Ubuntu, sans modification des dépendances du projet. Après le
redémarrage du poste, leur copie persistante permet de relancer la suite depuis la racine :

```bash
env -u NO_COLOR \
  LD_LIBRARY_PATH="$PWD/.local/lot9-certification-tnEsFO/browser-libs/usr/lib/x86_64-linux-gnu" \
  TURBO_ENV_MODE=loose pnpm test:e2e
```

Ce chemin est propre au poste local, pas à la production. La CI installe les dépendances
système Chromium via `playwright install --with-deps chromium`.

## Migration et limites explicites

Deux migrations nouvelles : `20260911000100_results` (outcomes, versions, FK composite des
auteurs, protections de workflow/historique) et `20260911000200_results_write_guards`
(contexte SQL des notes et index daté des événements d'inscription). Aucun db push/reset,
aucune suppression de migration historique. Le trigger d'immuabilité LOT 3 est inchangé.
La seule adaptation du test d'intégrité historique est l'ajout d'une inscription valide dans
sa fixture de note : les 18 assertions sont conservées.

Limites : 1 000 élèves/classe, 100 matières, saisie de 1 000 notes maximum par requête ; pas
de moteur reporting général. L'absence bloque le résultat complet jusqu'à régularisation ;
la dispense est exclue, jamais zéro. Une note publiée peut être corrigée avec raison sans
recalculer un ancien bulletin ; les bulletins publiés ne sont pas révisables dans ce MVP.
Les snapshots antérieurs sans format LOT 9 restent préservés et explicitement sans nouvelle
prévisualisation détaillée. Aucun PDF, QR, carte, certificat, R2, Brevo, Mobile Money, présence,
emploi du temps, bibliothèque ou RH. Tout le LOT 10 reste hors périmètre.

## Références officielles

[PostgreSQL 18 — triggers différables](https://www.postgresql.org/docs/18/sql-createtrigger.html)
et [Zod — contrats stricts et safeExtend](https://zod.dev/api).

Empreinte initiale du backup Figma (liste triée des SHA-256, hors .git/node_modules) :
`e6045bf5ccc18cf913756be7dadf5e4c0a6f3b2fc77bffe8c96b21923978abff`.
