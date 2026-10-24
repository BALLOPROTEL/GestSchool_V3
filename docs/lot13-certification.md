# LOT13 — rapport de validation avant commit

Date : 24 octobre 2026. Travail dans l'environnement distant fourni ; aucun commit, push, tag ou déploiement. Ce rapport distingue les protections présentes, les tests réellement exécutés et leurs limites. Il ne s'agit pas d'une certification de staging/production.

## Bootstrap et périmètre

- Workspace : `/workspace/GestSchool_V3` ; origine vérifiée `https://github.com/BALLOPROTEL/GestSchool_V3.git`.
- Branche fournie : `work`, au même commit que `origin/main` au départ, conservée.
- HEAD initial : `88e7003004605dfaf48db6e20f1ee4c45f27567c` ; ancêtre `lot-12-go` vérifié par Git (commit `5208841520f5e7e994a8a5f18c76573fbf4da9d8`). Tags récupérés en lecture seule.
- `git status` initial : propre ; aucune modification utilisateur préexistante à écraser. Aucun reset, clean, restore global ni worktree.
- LOT13 uniquement : aucun nouveau métier et aucun travail de déploiement LOT14/15. Migrations historiques inchangées, aucune nouvelle migration.

## Exécutions et résultats

Les sorties détaillées sont conservées dans `.local/lot13-*.log`, privées et ignorées. Le fichier `.local/lot13-results.tsv` conserve les codes de sortie des séquences principales, y compris les premiers échecs et interruptions. Les sorties des outils DEV ne sont pas recopiées dans ce rapport.

| Contrôle                   | Résultat vérifié                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installation frozen        | Réussie ; verrou régénéré uniquement pour les corrections ciblées puis réinstallation frozen réussie                                                                        |
| Infrastructure             | PostgreSQL/Redis/S3 privés opérationnels ; SQL/PING/HeadBucket et accès anonyme refusé                                                                                      |
| Prisma / migrations / seed | Génération réussie, migrations appliquées sur développement et deux bases neuves isolées ; seed local réussi                                                                |
| Intégrité PostgreSQL       | 18 tests réussis sur chaque base testée                                                                                                                                     |
| Accès DEV                  | Sept connexions HTTP vérifiées, MFA pour les rôles privilégiés ; credentials uniquement `.local/test-access.json` 0600                                                      |
| Messaging isolé            | Outbox → BullMQ → worker → capture privée, dix rejeux concurrents, isolation IAM tenant, arabe et échec/retry provider : PASS                                               |
| Reports isolé              | Première initialisation Nest interrompue avant les tests ; après reconstruction cohérente, 11/11 réussis. La suite complète ultérieure inclut aussi le nouveau scénario SQL |
| Intégration IAM / métiers  | 357 tests réussis dans neuf fichiers : IAM, People, Academic, Enrollments, Finance, Results, Documents, Reports et quotas sécurité                                          |
| Unitaires                  | Exécution finale complète : 472 tests réussis ; canari de logs vérifié ensuite à nouveau dans les 30 tests HTTP/JWT ciblés                                                  |
| Typage                     | Exécution finale globale : 15 tâches réussies ; typage web revalidé après le contrôle des rewrites de production                                                            |
| Build/canari public        | Dernier build frais forcé réussi, canaris de neuf variables serveur absents des 57 fichiers publics ; pas de source maps navigateur ; origine API compilée vérifiée         |
| Dépendances                | Initial : 4 Critical, 13 High, 12 Moderate, 4 Low. Après corrections : zéro alerte production                                                                               |
| Secrets arbre/historique   | Zéro signal non expliqué ; exceptions strictes pour trois fixtures publiques, pas de secret réel trouvé                                                                     |
| E2E initial                | Exécution interrompue après diagnostic CSP : 38 réussis, 3 échecs PDF, 1 interrompu, 35 skips, 126 non exécutés. Elle ne constitue pas une réussite                         |
| E2E après correction       | 114 réussis, 89 skips prévus, zéro échec et zéro cas restant ; 203 cas, sept viewports, un worker, 16,4 minutes                                                             |
| Format/lint/diff           | Formatage, lint et git diff --check finaux réussis ; deux erreurs de style initiales et une portée de helper de test corrigées sans réduire les assertions                  |

L'échec Reports initial a eu lieu pendant le renouvellement des builds locaux. Nest avortait le processus et son logger de test capturait l'exception ; la cause détaillée initiale n'est pas récupérable. La reconstruction des dépendances a permis un succès complet. Le harness utilise désormais `abortOnError: false` pour que toute future erreur d'initialisation soit rapportée par le runner plutôt que par SIGABRT ; aucune assertion métier n'est retirée.

Le premier E2E a démontré une régression de notre CSP : `default-src 'self'` refusait les iframes PDF `blob:`. Correction : `frame-src 'self' blob:` explicite. `frame-ancestors 'none'`, `object-src 'none'` et l'absence d'unsafe-eval en production restent exigés. La relance complète valide le correctif ; les échecs initiaux restent visibles ci-dessus.

## Les 88 points demandés

| Nº  | Point                            | Résultat / preuve / limite                                                                                                                                   |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Environnement détecté            | `/workspace/GestSchool_V3`, checkout distant fourni, ressources inspectées                                                                                   |
| 2   | Branche                          | `work` conservée, initialement identique à origin/main                                                                                                       |
| 3   | HEAD initial                     | SHA complet dans le bootstrap ci-dessus                                                                                                                      |
| 4   | Relation lot-12-go               | `git merge-base --is-ancestor` : exit 0                                                                                                                      |
| 5   | Status initial                   | Arbre propre                                                                                                                                                 |
| 6   | Fichiers créés                   | Liste exhaustive en annexe finale ; tous non commités                                                                                                        |
| 7   | Fichiers modifiés                | Liste exhaustive en annexe finale ; tous non commités                                                                                                        |
| 8   | Migrations                       | Aucune ajoutée ; déploiement des existantes testé                                                                                                            |
| 9   | Migrations historiques modifiées | Zéro, vérifié par Git                                                                                                                                        |
| 10  | Threat model                     | `security-threat-model.md`, frontières Browser/Next/API/DB/Redis/queues/worker/S3/Brevo et menaces, contrôles et risques résiduels                           |
| 11  | Attack surface                   | `security-audit-lot13.md` : 179 endpoints Nest, routes Next, variables, appels sortants, stockage et SQL                                                     |
| 12  | Production fail closed           | Config partagée, IAM, messaging, web startup et worker ; matrices négatives et exécutions de refus réels ; origine de réécriture compilée liée au runtime    |
| 13  | DEV protections                  | CLI DEV et provider local refusent production ; seed de démonstration explicitement DEV/TEST                                                                 |
| 14  | Passwords                        | Argon2id 64 MiB, t=3,p=1, sels indépendants et dummy hash ; tests unitaires et IAM                                                                           |
| 15  | Tokens                           | CSPRNG 32 bytes, hash SHA256, chiffrement messaging AES-GCM ; one-shot/expiration et révocation testés                                                       |
| 16  | JWT                              | EdDSA allowlist, issuer/audience, 300s, session DB ; malformé/expiré/signature/clé/alg/typ/header/taille testés                                              |
| 17  | Refresh replay                   | Rotation A→B, refus A et révocation, concurrence couverte par IAM                                                                                            |
| 18  | Sessions                         | Contrôle état DB, logout/all, changement password/MFA/tenant, révocation immédiate ; tests IAM                                                               |
| 19  | MFA                              | TOTP strict six chiffres, fenêtre bornée et compteur anti-rejeu ; quotas Redis et audit d'échec sans code                                                    |
| 20  | Cookies                          | Set-Cookie réellement sérialisé : Secure/HttpOnly/Strict, sans Domain, refresh Path minimal et expiration                                                    |
| 21  | CSRF                             | Origin exact + HMAC/cookie/header ; absent, étranger, malformé et doublons refusés ; exception webhook distincte                                             |
| 22  | CORS                             | Égalité exacte ; null/evil/suffix confusion refusés ; aucun wildcard credentials                                                                             |
| 23  | Redirects                        | Pas de callback utilisateur arbitraire identifié ; chemins auth internes ; validator négatif schémas/encodages                                               |
| 24  | RBAC                             | Deny-by-default, sept rôles métier et SUPER_ADMIN plateforme conservés ; suites métier et IAM                                                                |
| 25  | Tenant isolation                 | Tenant de session/membership ; FK tenant-aware ; suites People à Reports et worker                                                                           |
| 26  | Mass assignment                  | DTO stricts, injections tenant/status/rôle non autorisées refusées ; fixtures d'intégration existantes                                                       |
| 27  | Input validation                 | UUID/email/chaînes/listes bornés, pages plafonnées, prototype properties et query dupliquée rejetés                                                          |
| 28  | Body limits                      | JSON 64 KiB, forms 16 KiB/50 paramètres ; 413 et compression 415 testés                                                                                      |
| 29  | Rate limiting                    | Redis IP/identifier auth/QR/webhook ; quotas route+tenant+user exports/communications, isolation testée                                                      |
| 30  | Trust proxy                      | Modes explicites direct/loopback ; en-têtes Forwarded d'un peer direct ignorés ; topologie Render à valider ultérieurement                                   |
| 31  | HTTP hardening                   | Délais LOT12 conservés, request timeout 120s, 100 headers, limite native Node des tailles ; pas de stress massif                                             |
| 32  | Errors                           | Filtre central à codes et IDs ; Reports/Dashboard ont une allowlist de codes ; canaris sans SQL/stack/credentials                                            |
| 33  | Logs                             | Pas de request dumps ; erreurs renderer/provider réduites à codes, startup worker fixe, URLs auth/QR ignorées par Next                                       |
| 34  | PII                              | IDs et masquage destinataires ; pas de contenu scolaire/financier dans les logs runtime examinés                                                             |
| 35  | Headers                          | nosniff, referrer no-referrer, permissions et framing ; HSTS production                                                                                      |
| 36  | CSP                              | Production sans unsafe-eval ; inline nécessaire à Next/next-themes/styles, risque résiduel documenté                                                         |
| 37  | Clickjacking                     | frame-ancestors none ; enfants PDF blob explicitement autorisés sans autoriser le framing du portail                                                         |
| 38  | Cache                            | API et pages localisées privées/no-store ; exports stockés private/no-store                                                                                  |
| 39  | XSS                              | React + échappement HTML/XML PDF ; payloads renderer et test navigateur de noms hostiles ; scénario navigateur de stockage/affichage hostile réussi          |
| 40  | SQL injection                    | Inventaire tagged templates bindés ; seul Unsafe dans preuve migrations à identifiants internes ; requêtes adversariales Reports réussies                    |
| 41  | Query DoS                        | Pages/ranges/row caps, quotas et exports concurrents existants ; pas de benchmark destructif                                                                 |
| 42  | SSRF                             | Destinations fixes serveur ; validator IPv4/IPv6/private/schemes/userinfo sans requête ; pas de fetch URL utilisateur                                        |
| 43  | PDF isolation                    | JS off, offline, routes abort, fonts locales ; rendus documents/reports exercés par intégrations                                                             |
| 44  | Uploads                          | Aucun upload HTTP métier ; génération serveur PDF/rapports avec limites/MIME/magic ; antivirus non revendiqué                                                |
| 45  | Path traversal                   | Clés générées UUID/hash/tenant validées avant toutes opérations S3 ; matrice traversal testée                                                                |
| 46  | S3                               | Bucket local privé, requêtes anonymes refusées, téléchargement serveur avec droits/checksum ; aucune signed URL persistée                                    |
| 47  | QR                               | 256-bit token hashé, données minimisées, quota IP, révocation ; pas de TTL calendaire arbitrairement ajouté aux documents historiques                        |
| 48  | Brevo webhooks                   | Bearer temps constant, fenêtre 24h, digest unique et transitions monotones ; quota réel ; pas de fausse garantie body-HMAC                                   |
| 49  | BullMQ                           | Noms/DTO stricts, IDs only, état DB/leases ; acteur reports lié au tenant/requester et droits actifs intersectés                                             |
| 50  | Redis                            | Obligatoire et fail closed, TLS production, aucun fallback mémoire ; tests arrêt logique client et quotas                                                    |
| 51  | PostgreSQL                       | Prisma sans logging SQL demandé ; TLS verify-full prod ; séparation runtime/migration user en checklist future                                               |
| 52  | Crypto                           | Node crypto, jose, Argon2, HMAC/SHA256/AES-GCM ; aucune primitive maison                                                                                     |
| 53  | Entropy                          | randomBytes/randomUUID ; pas de Math.random dans le runtime audité ; clés prod répétitives/placeholder refusées                                              |
| 54  | Repository secrets               | Scanner signatures y compris nouveaux fichiers ; valeurs jamais affichées ; zéro secret réel identifié                                                       |
| 55  | Git history secrets              | Tous les blobs de l'historique local connu ; fixtures publiques identifiées ; pas de réécriture                                                              |
| 56  | Dependency audit                 | Initial 4 Critical/13 High ; corrections ciblées, production zéro alerte après installation                                                                  |
| 57  | GitHub Actions                   | contents:read, pas de pull_request_target ni interpolation event dangereuse, SHA officiels vérifiés                                                          |
| 58  | Docker supply chain              | Digests PostgreSQL/Redis inspectés ; build MinIO/mc et références historiques conservés ; devcontainer versionné                                             |
| 59  | Dependabot                       | npm/pnpm et GitHub Actions hebdomadaire, pas d'automerge                                                                                                     |
| 60  | CODEOWNERS                       | Propriétaire réel @BALLOPROTEL pour les zones critiques ; activation review requise côté GitHub                                                              |
| 61  | SECURITY.md                      | Version main supportée, signalement privé sans email inventé, coordination responsable                                                                       |
| 62  | Source maps                      | productionBrowserSourceMaps false ; scanner public refuse toute map publiée                                                                                  |
| 63  | Client secrets                   | Neuf canaris serveur injectés au build ; aucune occurrence dans artifacts publics vérifiés                                                                   |
| 64  | Health endpoints                 | États uniquement, aucun host/credential/version DB ou stack                                                                                                  |
| 65  | Security audit events            | Refresh replay et changements admin existants ; mfa.failed ajouté ; volume borne par quotas                                                                  |
| 66  | Security test results            | 144 tests réussis, séquentiels et sans provider réel ; certains réutilisent les suites unitaires, ne pas additionner les compteurs comme des tests distincts |
| 67  | Auth tests                       | Matrice JWT, mots de passe, tokens/rejeux et sessions/MFA ; intégration IAM réussie                                                                          |
| 68  | IDOR tests                       | Huit domaines dans les suites métier ; OWN/CHILDREN/ASSIGNED et agrégats tenant couverts                                                                     |
| 69  | XSS tests                        | HTML/XML/React ; noms hostiles en E2E, scénario navigateur hostile réussi, sans script/img exécutable ni dialogue                                            |
| 70  | SQL tests                        | Métacaractères et payload OR dans Reports ; contraintes SQL/FK/immutabilité métier exercées                                                                  |
| 71  | SSRF tests                       | Validator uniquement, aucune requête metadata/private réellement émise                                                                                       |
| 72  | Webhook tests                    | Secret invalide, événements périmés/malformés/inconnus, doublons/états ; corps non signé par contrat provider                                                |
| 73  | Rate limit tests                 | Burst local 41 webhooks, 21 actions user/tenant ; 429 et isolation, puis fail closed client Redis                                                            |
| 74  | Log canary                       | Exceptions HTTP et services plus redaction récursive ; canaris absents des sorties capturées                                                                 |
| 75  | Bundle canary                    | Build frais forcé avec canaris, cible public static uniquement ; aucun secret réel injecté                                                                   |
| 76  | Fresh DB                         | Deux bases gestschool_lot11/lot12_security créées vides, migrations/seed/18 tests ; pas de reset de base existante                                           |
| 77  | Regression LOT0–12               | 357 intégrations et unités réussies ; E2E finale réussie : aucune régression observée dans les cas exécutés                                                  |
| 78  | E2E                              | 203 cas : 114 réussis et 89 skips explicites (83 préexistants, 6 du nouveau scénario XSS ciblé desktop), zéro échec ; aucun ancien test désactivé            |
| 79  | pnpm audit --prod                | Dernier audit initial de correction : zéro alerte ; répétition finale enregistrée                                                                            |
| 80  | CI changes                       | Étape Security hardening certification, history scan, suite locale et build canari ; lock frozen conservé                                                    |
| 81  | Residual risks                   | Format détaillé ci-dessous ; aucune limite non testée présentée comme garantie absolue                                                                       |
| 82  | Manual actions                   | Paramètres GitHub et infrastructure future/checklist ; aucun secret à envoyer dans le chat                                                                   |
| 83  | Codespaces limitations           | Proxy/TLS/DNS Docker adaptés pendant setup, cache Docker libéré (disque 87→45%), 4 CPU cgroup et suites séquentielles                                        |
| 84  | Versions                         | Node24.20.0, pnpm10.24.0, Prisma7.10.0, Next16.4.1, Nest12.0.1, TS6.0.2, Vitest5.0.0, Playwright1.62.1, PG18.6, Redis8.10.1                                  |
| 85  | git diff --check                 | Réussi aux contrôles intermédiaires ; répétition finale obligatoire                                                                                          |
| 86  | Status final                     | Annexe générée à la fin ; fichiers non commités uniquement                                                                                                   |
| 87  | Verdict                          | GO local LOT13 pour revue avant commit ; aucun GO staging/production ni exécution GitHub Actions distante revendiquée                                        |
| 88  | Commit proposé                   | Seulement si GO : `chore(security): harden application runtime and supply chain` ; aucun commit exécuté                                                      |

## Risques résiduels

Risk: CSP conserve unsafe-inline pour scripts Next/next-themes et styles UI.
Severity: Medium.
Evidence: `apps/web/security-headers.mjs` et tests de policy ; unsafe-eval est absent en production.
Why not fixed: une CSP nonce imposerait une modification du rendu/cache de nombreuses pages, au-delà d'une correction minimale sans régression ; aucune donnée utilisateur n'est rendue comme HTML exécutable.
Current mitigation: échappement React/HTML/XML, object-src none, frame-ancestors none, base/form/connect restreints et tests XSS.
Future action: évaluer une CSP à nonce/hashes sur le rendu réel et revalider la matrice UI.
Target LOT: LOT14, avant exposition staging si la topologie le permet.

Risk: le webhook Brevo utilise un bearer, sans signature cryptographique du corps.
Severity: Medium.
Evidence: contrat et tests `validBrevoBearer`, fenêtre 24h et digest idempotent.
Why not fixed: aucun contrat provider de body-HMAC n'est inventé pour prétendre vérifier une signature inexistante.
Current mitigation: HTTPS, secret fort indépendant/rotation, comparaison constante, limites body/quota, fenêtre temporelle et transitions monotones ; rejeu identique ne remute pas les données.
Future action: confirmer les garanties disponibles dans le compte/provider réel et appliquer un mécanisme signé officiellement supporté ou un relais de confiance audité si nécessaire.
Target LOT: LOT14, avant activation externe.

Risk: configuration réseau/TLS/proxy, ACL stockage et sauvegardes distantes non testées.
Severity: High pour un déploiement non configuré ; aucun service distant n'est déployé ici.
Evidence: tests sur PostgreSQL/Redis/MinIO locaux ; aucune modification Vercel/Render.
Why not fixed: le déploiement LOT14/15 est explicitement exclu de cette mission.
Current mitigation: production refuse les paramètres DEV/defaults, checklist explicite, aucune exposition publique des services locaux.
Future action: vérifier TLS/proxy/CIDR, comptes runtime/migration, ACL, backups et restauration isolée sur l'infrastructure retenue.
Target LOT: LOT14/15 avant exposition.

Risk: le validator d'URL ne résout pas le DNS et ne protège pas seul du DNS rebinding.
Severity: Medium si un fetch utilisateur arbitraire est ajouté ultérieurement.
Evidence: `requirePublicHttps` ne fait aucune requête ; destinations runtime fixes et PDF offline.
Why not fixed: aucune URL utilisateur arbitraire à récupérer n'est proposée ; tester metadata/private en réseau est interdit par la mission.
Current mitigation: validateurs de configuration, destination Brevo fixe sans redirects, PDF sans réseau, pas d'API de fetch arbitraire.
Future action: pin DNS/IP et egress réseau audité si une telle fonctionnalité est ultérieurement autorisée.
Target LOT: lot introduisant cette capacité, aucun développement ajouté ici.

Risk: signatures de secrets et audit npm ne détectent pas toutes les compromissions possibles.
Severity: Medium.
Evidence: scanner borné à signatures et historique local connu ; audit ponctuel dépend des advisories disponibles.
Why not fixed: aucun scanner ne fournit une preuve exhaustive de non-compromission.
Current mitigation: locks, références immuables, review, Dependabot, scan historique, canaris et absence de secrets réels détectés.
Future action: activer secret scanning/private reporting et règles GitHub, surveiller les nouveaux avis, vérifier provenance/signatures des releases.
Target LOT: LOT14 puis exploitation LOT15.

Risk: les QR de documents historiques n'ont pas de TTL calendaire automatique.
Severity: Low, selon la politique de rétention documentaire.
Evidence: jeton 256 bits hashé, statut/révocation et vérification minimale ; aucune signed URL d'objet public.
Why not fixed: invalider arbitrairement des documents scolaires historiques changerait leur comportement métier certifié.
Current mitigation: révocation, contrôle d'état, minimisation et quota IP ; exports ont une expiration et un contrôle serveur distincts.
Future action: définir une politique d'expiration/rétention avec le propriétaire avant de modifier ce contrat.
Target LOT: décision documentaire ultérieure ; aucune nouvelle règle métier dans LOT13.

## Actions manuelles et état de publication

Examiner le diff et les risques, configurer les protections GitHub/private reporting et les paramètres d'infrastructure uniquement dans un travail ultérieur autorisé. Ne fournir aucun credential en chat. Aucun commit, push, tag, déploiement ni changement Vercel/Render n'est effectué. Le message de commit n'est qu'une proposition après un éventuel GO local.

## Contrôles complémentaires finaux

- Reports sur la base isolée LOT12 : 13/13, dont payloads SQL, job avec tenant étranger sans mutation, snapshot acteur étranger refusé et requester suspendu refusé avant stockage ; aucune génération auditée pour ces tentatives.
- Suite sécurité finale : 144 tests réussis (50 config, 53 API/IAM/webhook, 30 infrastructure, 1 worker, 4 web/CI/rewrites, 3 refus runtime/DEV/provider, 3 quotas Redis). Elle réutilise certains tests unitaires, les compteurs ne doivent pas être additionnés comme des scénarios tous distincts.
- Production web : démarrage réel avec build/runtime origins concordants, page française, no-store, nosniff, HSTS, CSP sans unsafe-eval, frame-ancestors none et frame-src self/blob vérifiés. Une origine API de démarrage différente du manifest est refusée. Ce contrôle utilise des domaines de fixtures publics sans émettre de requête externe ; il ne certifie pas du TLS déployé.
- `pnpm dev` : liveness/readiness HTTP 200, trois dépendances up, message worker ready et formulaire français sur les ports attendus. Un premier serveur de contrôle encore présent a causé un fallback 3001 ; il a été fermé, puis le démarrage a été répété et validé sur 3000/3100.
- S3 : écriture/lecture authentifiées, LIST/GET/PUT anonymes HTTP 403 sur un objet existant, contenu inchangé et probe supprimée.
- Un premier enregistrement du smoke HTTP a échoué pour un chemin `.local` relatif incorrect (curl 23) ; corrigé en relançant depuis la racine avec propagation stricte des erreurs, puis tous les contrôles HTTP ont réussi. Aucun défaut applicatif n’est masqué par cette erreur d’outil.
- Instructions cloud `install_script` et `start_skill` actualisées dans le brouillon ; syntaxe du script contrôlée, étapes et démarrage vérifiés dans cette instance. Aucune publication et aucune validation dans une future tâche ne sont revendiquées. Après revue et sauvegarde des paramètres, une publication éventuelle reste une action utilisateur distincte, après validation du travail.
- Processus temporaires arrêtés ; volumes locaux conservés. Le fichier Next généré par le mode DEV a été remis exactement à son contenu suivi initial, après vérification des seules différences de chemins de types.
- Aucun commit, push, tag, déploiement, changement Vercel/Render ou modification de migration historique.

Le dernier contrôle de production a fermé un écart entre variables de démarrage et réécritures compilées : Next refuse maintenant une origine API locale/différente cachée dans le manifest. Quatre tests web/CI couvrent notamment cette matrice ; la suite sécurité complète de 144 tests a été répétée avec succès, et un vrai démarrage avec origines concordantes a servi la connexion française avec tous les headers attendus. Le package de configuration est désormais une dépendance de production du web ; le graphe `--prod`, le verrou et l’installation frozen ont été vérifiés après ce déplacement, puis l’audit est resté à zéro alerte.

## Fichiers et status final

48 fichiers suivis modifiés et 23 nouveaux fichiers, aucune suppression. Rien n’est indexé/commité. `M` désigne une modification, `??` une création ; cette liste exhaustive répond aux points 6, 7 et 86. Les fichiers `.local`, dépendances, caches et builds sont ignorés.

```text
 M .github/workflows/ci.yml
 M README.md
 M apps/api/package.json
 M apps/api/src/main.ts
 M apps/api/src/modules/dashboard/application/dashboard.service.ts
 M apps/api/src/modules/iam/application/mfa.service.ts
 M apps/api/src/modules/iam/domain/security.test.ts
 M apps/api/src/modules/iam/infrastructure/crypto.ts
 M apps/api/src/modules/iam/infrastructure/iam-config.ts
 M apps/api/src/modules/iam/infrastructure/iam-runtime.ts
 M apps/api/src/modules/iam/infrastructure/rate-limiter.ts
 M apps/api/src/modules/iam/presentation/http/security.ts
 M apps/api/src/modules/messaging/application/communications.service.ts
 M apps/api/src/modules/notifications/application/notifications.service.ts
 M apps/api/src/modules/reports/application/reports.service.ts
 M apps/api/tests/finance-helpers.ts
 M apps/api/tests/reports.test.ts
 M apps/api/vitest.iam.config.ts
 M apps/web/e2e/people.spec.ts
 M apps/web/next.config.ts
 M apps/web/package.json
 M apps/web/playwright.config.ts
 M apps/web/src/proxy.ts
 M apps/worker/src/jobs/messaging/local-runtime.ts
 M apps/worker/src/jobs/reports/generation.ts
 M apps/worker/src/jobs/reports/runtime.ts
 M apps/worker/src/main.ts
 M docker/compose.yml
 M docs/README.md
 M package.json
 M packages/config/package.json
 M packages/config/src/environment.ts
 M packages/config/src/messaging.test.ts
 M packages/config/src/messaging.ts
 M packages/contracts/package.json
 M packages/contracts/src/documents.ts
 M packages/contracts/src/reports.ts
 M packages/contracts/src/results.ts
 M packages/database/prisma/seed.ts
 M packages/infrastructure/src/documents/config.ts
 M packages/infrastructure/src/documents/queue.ts
 M packages/infrastructure/src/messaging/provider.ts
 M packages/infrastructure/src/messaging/queue.ts
 M packages/infrastructure/src/reports/queue.ts
 M packages/infrastructure/src/storage/s3-storage-adapter.ts
 M pnpm-lock.yaml
 M pnpm-workspace.yaml
 M turbo.json
?? .github/CODEOWNERS
?? .github/dependabot.yml
?? SECURITY.md
?? apps/api/src/security-hardening.test.ts
?? apps/api/tests/security.test.ts
?? apps/api/vitest.config.ts
?? apps/web/security-headers.d.mts
?? apps/web/security-headers.mjs
?? apps/worker/src/jobs/reports/security.test.ts
?? docs/lot13-certification.md
?? docs/security-audit-lot13.md
?? docs/security-hardening.md
?? docs/security-production-checklist.md
?? docs/security-threat-model.md
?? packages/config/src/security.test.ts
?? packages/config/src/security.ts
?? packages/infrastructure/src/queue-security.test.ts
?? packages/infrastructure/src/storage/storage-security.test.ts
?? scripts/security-bundle.mjs
?? scripts/security-runtime.test.mjs
?? scripts/security-secrets.mjs
?? scripts/security-test.mjs
?? scripts/security-web.test.mjs
```

Verdict final : **GO local LOT13 pour revue avant commit**, avec les limites et actions futures explicitement documentées. Aucune certification de déploiement n’est accordée. Message proposé uniquement : `chore(security): harden application runtime and supply chain`.
