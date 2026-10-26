# LOT14 — recertification locale de clôture

Code applicatif inchangé depuis `39f5cc20aa1c429210a6ab18597e218a1b693e88`.
Le checkpoint de clôture modifie uniquement README/documentation et le manifeste
de preuves sûr. Les résultats Render confirmés par l'opérateur restent séparés
dans [la certification finale](lot14-certification.md).

Les suites ci-dessous ont réellement été exécutées dans ce workspace. PostgreSQL,
Redis et stockage de test sont locaux ; les URLs sont vérifiées localhost avant
exécution. Les flags bootstrap/certification/probe Storage sont OFF. Le harnais A/B
crée sa propre base jetable, sans seed DEV et sans accès staging.

| Contrôle                               | Exécution                                                                               | Résultat                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Certification/hooks/classification IAM | Vitest ciblé complet existant                                                           | 144 PASS / 0 FAIL / 0 SKIP                                                                                      |
| Bootstrap                              | `node --test scripts/staging-bootstrap.test.mjs`                                        | 10 PASS / 0 FAIL / 0 SKIP                                                                                       |
| IAM et métiers complets                | `pnpm --filter @gestschool/api test:iam`                                                | 369 PASS / 0 FAIL / 0 SKIP, 10 fichiers                                                                         |
| Harnais HTTP local A/B                 | `LOT14_CERTIFICATION_LOCAL_TEST=1` avec APP_ENV/NODE_ENV test, base jetable             | 14 PASS / 0 FAIL / 0 SKIP ; fixtures idempotentes, MFA initial/rerun, refresh, compteurs et révocation vérifiés |
| Sécurité                               | `pnpm security:test`                                                                    | 496 PASS / 0 FAIL / 0 SKIP                                                                                      |
| Infrastructure                         | `pnpm --filter @gestschool/infrastructure test`                                         | 84 PASS / 0 FAIL / 0 SKIP                                                                                       |
| Worker                                 | `pnpm --filter @gestschool/worker test`                                                 | 17 PASS / 0 FAIL / 0 SKIP                                                                                       |
| Unit                                   | `pnpm test --force`                                                                     | 716 PASS / 0 FAIL / 0 SKIP ; 13 tâches, zéro cache utilisé                                                      |
| Typecheck                              | `pnpm typecheck --force`                                                                | PASS                                                                                                            |
| Lint                                   | `pnpm lint`                                                                             | PASS                                                                                                            |
| Format                                 | `pnpm format:check`                                                                     | PASS                                                                                                            |
| Build Render exact                     | `pnpm install --frozen-lockfile --prod=false && pnpm --filter @gestschool/api... build` | PASS                                                                                                            |
| Build global                           | `pnpm build --force --env-mode=loose --concurrency=2`                                   | PASS ; 9 tâches, zéro cache utilisé                                                                             |
| Scan secrets                           | `pnpm security:secrets`                                                                 | PASS ; zéro signature secrète, aucune valeur affichée                                                           |
| Diff                                   | `git diff --check`                                                                      | PASS                                                                                                            |

Les suites se recouvrent : les compteurs ne doivent pas être additionnés comme
s'ils représentaient des scénarios distincts. Aucune suite/assertion n'a été
réduite. Les assertions documentaires vérifient aussi les 14 résultats, flags OFF
et archives historiques préservées. Aucun correctif applicatif, y compris celui
du filtre Students, n'est ajouté à cette clôture.

La CI GitHub est distincte de ces exécutions locales et sera observée sur la PR
finale. Son état et son lien sont consignés dans la PR et
[l'issue de clôture](https://github.com/BALLOPROTEL/GestSchool_V3/issues/65), sans
présumer son succès à partir des seuls tests locaux.

Aucun runner distant relancé, aucune configuration ou donnée staging modifiée,
aucun merge/tag GO, changement V2, début LOT15 ou ressource payante.
