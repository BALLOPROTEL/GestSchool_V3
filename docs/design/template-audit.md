# Audit du template GestSchool — contrat visuel LOT 1

Date de l'audit : 4 septembre 2026  
Source auditée en lecture seule : `/home/ballo/projets/GestSchool_V3_figma_backup_20260903`  
Périmètre : 88 fichiers, 11 301 lignes, 22 routes rendues en 1440 × 900 et 360 × 800, plus une passe sombre.

## Méthode et intégrité

- Une empreinte SHA-256 triée de chaque fichier a été enregistrée avant l'audit.
- L'original n'a jamais été exécuté ni modifié : une copie isolée dans `/tmp` a servi au build et aux captures.
- L'audit combine lecture du code, inventaire des composants et comparaison des rendus de chaque route.
- Le build Vite de la copie est fonctionnel. Il émet un avertissement de bundle de 983,79 kB et signale Recharts 2 comme obsolète.
- Les 44 rendus light (22 desktop + 22 mobile) n'ont aucun débordement horizontal au niveau du document. Des vues restent néanmoins visuellement coupées dans leur conteneur de défilement interne.
- Les 38 rendus applicatifs produisent des avertissements React identiques : le `Button` source n'utilise pas `forwardRef` alors que Radix `Slot` en attend un. Les trois vues d'authentification n'en produisent pas.

## Direction visuelle

GestSchool adopte une interface SaaS dense et sobre : fond gris bleuté, cartes blanches bordées, accent bleu franc, sidebar bleu nuit et texte compact. La hiérarchie repose davantage sur la taille, le poids et l'espacement que sur les ombres. Les écrans récents sont en français et utilisent des tokens sémantiques ; plusieurs écrans plus anciens sont encore en anglais, USD et couleurs Slate figées.

Le portage conserve cette direction et harmonise les deux familles sans redessiner le produit. Les seules corrections appliquées sont celles autorisées par le LOT 1 : cohérence, réutilisabilité, accessibilité, responsive, dark mode et RTL.

## Tokens de couleur

### Thème clair

| Rôle                    | Valeur source | Usage observé                       |
| ----------------------- | ------------: | ----------------------------------- |
| Background              |     `#f1f5f9` | surface principale                  |
| Foreground              |     `#0f172a` | texte principal                     |
| Card / Popover          |     `#ffffff` | cartes, menus, modales              |
| Primary                 |     `#1d4ed8` | CTA, liens, sélection, progression  |
| Primary foreground      |     `#ffffff` | texte sur primaire                  |
| Secondary               |     `#e2e8f0` | contrôles secondaires               |
| Secondary foreground    |     `#475569` | texte secondaire                    |
| Muted                   |     `#f8fafc` | champs, lignes alternées, skeletons |
| Muted foreground        |     `#64748b` | légendes et métadonnées             |
| Accent                  |     `#dbeafe` | survol et sélection légère          |
| Accent foreground       |     `#1e40af` | texte sur accent                    |
| Success                 |     `#059669` | payé, actif, présent                |
| Warning                 |     `#d97706` | en attente, retard, partiel         |
| Info                    |     `#0284c7` | information                         |
| Destructive             |     `#dc2626` | erreur, impayé, suppression         |
| Border                  |     `#e2e8f0` | bordures et séparateurs             |
| Input background        |     `#f8fafc` | champs                              |
| Switch off              |     `#cbd5e1` | interrupteur désactivé              |
| Focus ring              |     `#93c5fd` | focus visible                       |
| Sidebar                 |     `#0f172a` | navigation principale               |
| Sidebar foreground      |     `#94a3b8` | liens inactifs                      |
| Sidebar primary         |     `#60a5fa` | accent du shell                     |
| Sidebar accent / border |     `#1e293b` | sélection et séparateurs            |

Série des graphiques : bleu, vert, ambre, violet et rouge. Les statuts emploient des fonds 100 et des textes 700, avec équivalents sombres translucides.

### Thème sombre

| Rôle                       | Valeur source |
| -------------------------- | ------------: |
| Background                 |     `#060f1e` |
| Foreground                 |     `#f1f5f9` |
| Card / Popover             |     `#0d1829` |
| Primary                    |     `#3b82f6` |
| Secondary / Border / Input |     `#1e293b` |
| Secondary foreground       |     `#cbd5e1` |
| Muted / Input background   |     `#0f1e33` |
| Muted foreground           |     `#64748b` |
| Accent                     |     `#1e3a5f` |
| Accent foreground          |     `#93c5fd` |
| Success                    |     `#10b981` |
| Warning                    |     `#f59e0b` |
| Info                       |     `#0ea5e9` |
| Destructive                |     `#ef4444` |
| Focus ring                 |     `#1d4ed8` |
| Sidebar                    |     `#040c1a` |
| Sidebar accent             |     `#0f172a` |

Le thème sombre source fonctionne pour le shell et les vues récentes. Les vues anciennes conservent des `text-slate-*`, `bg-white` et styles inline de graphiques, ce qui dégrade le contraste. Le portage remplace ces couleurs structurelles par les tokens.

## Typographie

- Police principale : Plus Jakarta Sans, poids 300 à 800.
- Données techniques et financières : JetBrains Mono 400/500.
- Arabe prévu : Noto Sans Arabic 300 à 700.
- Base : 15 px.
- H1 : 24–26 px, 700, interlettrage `-0.02em`, line-height 1.3.
- H2 : 20–22 px, 600, interlettrage `-0.015em`, line-height 1.35.
- H3 : 18 px, 600, line-height 1.4.
- Corps : 14–15 px, 400, line-height 1.5.
- Labels et tableaux : 11–13 px ; en-têtes souvent uppercase avec espacement accru.
- Nombres clés : 24–28 px, 600/700.

Les fontes ne seront pas chargées depuis Google au runtime : le portage les embarque localement afin de supprimer les appels réseau inattendus.

## Espacements, dimensions, rayons et ombres

- Grille principale basée sur 4 px ; écarts dominants : 8, 12, 16, 24 et 32 px.
- Padding de page : 24 px, 32 px sur grand écran ; 16–24 px sur mobile.
- Topbar : 56 px de haut.
- Sidebar : 260 px ouverte, 60 px repliée.
- Champs : 36–40 px de haut ; boutons 32, 36 ou 40 px.
- Cartes : rayon 8 à 12 px, bordure 1 px.
- Rayon global source : `0.5rem` ; déclinaisons `calc(radius - 2px)` et `calc(radius + 4px)`.
- Badges : pilule ou rayon 4–6 px, padding horizontal 6–8 px.
- Les ombres sont rares : `shadow-xs`/`shadow-sm`, `shadow-md` pour les menus, ombre bleue légère sur le logo et les CTA d'authentification.
- Transitions courtes de couleur, ombre et transformation ; skeletons en pulse.
- Scrollbar source : 5 px, piste transparente, pouce Slate 300/600.

## Shell, navigation et structure

### Sidebar

- Logo carré bleu avec `GraduationCap`, nom GestSchool et sous-titre « Portail Administratif ».
- Groupes : Tableau de bord ; Vie scolaire ; Académique ; Administration ; Système.
- Navigation : Élèves, Parents, Enseignants, Inscriptions, Classes, Matières, Notes & Bulletins, Présences, Finance, Documents, Communications, Rapports, Utilisateurs & Rôles, Paramètres, Audit.
- Indicateur actif : surface `#1e293b`, texte clair, barre bleue de 2 px.
- Badges source : « 1K+ » pour les élèves et « 89 » pour les inscriptions.
- Pied : avatar AK, Amadou Kouyaté, rôle Administrateur ; bouton de repli.
- Desktop : fixe et repliable. Mobile : tiroir avec overlay.

### Topbar

- Sélecteur d'établissement actif : « Lycée Moderne Victor Hugo » ; alternatives Collège Saint-Charles et École Primaire Les Flamboyants.
- Sélecteur d'année scolaire : 2024–2025 et années précédentes.
- Recherche globale avec raccourci Ctrl+K.
- Centre de notifications avec badge 2 et quatre entrées factices.
- Sélecteur de langue FR/EN/AR, thème clair/sombre, profil utilisateur.
- Sur mobile, priorité au menu, à une recherche compacte et aux actions d'icône ; établissement et année sont déplacés dans le tiroir.

### Défauts structurels relevés

- Le RTL source change seulement `document.dir`; la sidebar reste ancrée à gauche, les translations, marges, icônes et alignements ne sont pas inversés.
- Le sélecteur de langue ne traduit pas les pages.
- Le menu mobile conserve des zones trop petites et le contenu de certaines vues est coupé dans un `main` scrollable interne.
- La recherche affiche un pseudo-raccourci sans véritable dialogue.

Le portage utilise des propriétés CSS logiques, un vrai tiroir accessible, un skip-link et une gestion effective du focus.

## Composants et états observés

### Contrôles

- Boutons : primary, secondary, outline, ghost, destructive, link ; tailles small/default/large/icon ; états disabled/loading et icônes.
- Champs : Input, Textarea, Select, Checkbox, Radio, Switch ; normal, focus, invalide, valide et désactivé.
- Navigation : Dropdown, Tabs, Tooltip, Breadcrumb, Pagination.
- Conteneurs : Card, Dialog, Drawer/Sheet, Popover, Separator, ScrollArea.
- Données : tables responsives, en-têtes compacts, hover de ligne, sélection multiple, actions contextuelles.
- Identité : Avatar avec initiales, avatar en ligne.
- Feedback : alertes success/warning/error/info, toasts, Progress, Skeleton.
- États complets : EmptyState, ErrorState avec retry, PermissionDenied.
- Upload : zone drag-and-drop, fichier sélectionné et suppression.

### Badges métier visuels

- Élève : actif, inactif, en attente, transféré.
- Finance : payé, impayé, partiel, annulé.
- Présence : présent, absent, retard, excusé.
- Résultat : excellent, bien, passable, insuffisant.
- Rôles : administrateur rouge, directeur violet, enseignant bleu, comptable vert, scolarité ambre.

Les libellés restent de présentation dans ce lot : aucune règle métier n'est introduite.

## Inventaire des écrans source

| Route source       | Composition observée                                                                                                | État du prototype                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `/login`           | panneau marque, promesse, avantages, témoignage, formulaire                                                         | FR, light, mobile cohérent               |
| `/forgot-password` | retour, logo, formulaire puis succès                                                                                | FR, états simulés                        |
| `/activate`        | stepper OTP, mot de passe, succès                                                                                   | FR, états simulés                        |
| `/`                | 4 KPI, 2 graphiques, activité, alertes, actions                                                                     | ancien EN/USD, dark incomplet            |
| `/students`        | filtres, bulk actions, table, pagination                                                                            | ancien EN, mobile serré                  |
| `/students/:id`    | identité, contact, 4 KPI, onglets notes/inscriptions/finance/présence                                               | ancien EN/USD, fort chevauchement mobile |
| `/parents`         | recherche, table contacts/enfants/statuts                                                                           | FR, tokenisé                             |
| `/teachers`        | recherche, matières/classes/heures/statut                                                                           | FR, tokenisé                             |
| `/enrollments`     | 4 KPI, filtres, table                                                                                               | ancien EN/USD                            |
| `/classes`         | grille de cartes, capacité et titulaire                                                                             | FR, tokenisé                             |
| `/subjects`        | table code/intitulé/coefficient/niveaux                                                                             | FR, tokenisé                             |
| `/grades`          | filtres, onglets trimestres, synthèse, table de notes, commentaires                                                 | ancien EN, échelle /100                  |
| `/attendance`      | filtres date/classe, graphique semaine, feuille d'appel et alertes                                                  | ancien EN                                |
| `/finance`         | 4 KPI, filtres, table factures                                                                                      | ancien EN/USD                            |
| `/documents`       | recherche, liste typée PDF/XLS/DOC et actions                                                                       | FR, tokenisé                             |
| `/communications`  | recherche, liste e-mail/SMS/notif, envoyé/brouillon                                                                 | FR, tokenisé                             |
| `/reports`         | liste de rapports et génération en cours                                                                            | FR, tokenisé                             |
| `/users`           | recherche, table comptes/rôles/statuts                                                                              | FR, tokenisé                             |
| `/settings`        | cinq onglets, établissement, année, rôles, notifications, facturation                                               | ancien EN/USD                            |
| `/audit`           | filtres, table horodatée et export                                                                                  | FR/XOF, tokenisé                         |
| `/profile`         | profil, sécurité, 2FA, notifications, activité, danger                                                              | ancien EN                                |
| `/design-system`   | palette, typo, boutons, badges, formulaires, alertes, skeletons, états, upload, dialogue, avatars, table, contrôles | référence la plus cohérente              |

Le portage expose aussi `/attendance` et `/profile`, présents dans le prototype même s'ils n'étaient pas explicitement nommés dans la liste minimale du LOT 1.

## Responsive observé et cible

- Source desktop : sidebar fixe et zone de contenu fluide ; cartes KPI de 4 à 1 colonne, grilles de 2 à 1 colonne, tables en `overflow-x-auto`.
- Source mobile : topbar compacte, drawer de navigation, cartes empilées. Les vues anciennes ont des headers/actions trop horizontaux, des onglets non enveloppables et des informations de profil qui se chevauchent.
- À 360 px, Student Profile est inutilisable dans sa zone d'identité ; Students, Grades et Settings masquent une partie des actions ou onglets.
- Les tables ne doivent jamais élargir le document : elles restent dans un conteneur scrollable avec indice visuel et colonnes prioritaires.
- Le portage est certifié à 360×800, 414×896, 768×1024, 1024×768, 1366×768, 1440×900 et 1920×1080.

## Accessibilité relevée et corrections prévues

Points positifs : labels présents sur l'authentification, contrôles Radix pour menus/dialogues, focus ring prévu dans les tokens, couleurs de statuts doublées par du texte.

Écarts source : boutons d'icône sans nom accessible, labels de formulaires parfois non associés, bouton d'affichage du mot de passe retiré du parcours clavier, tableaux sans caption, file upload construit avec un `input` impératif, absence de skip-link, `forwardRef` cassé, raccourci recherche non fonctionnel et stepper OTP peu explicite pour lecteur d'écran.

Corrections du portage : HTML sémantique, `aria-label` sur toutes les actions d'icône, `caption`/`scope`, focus visible, zones tactiles suffisantes, dialogue et tiroir Radix, navigation clavier, annonce des états, input file natif masqué, `aria-current`, `aria-live`, contraste AA et réduction des animations selon `prefers-reduced-motion`.

## Internationalisation et RTL

- Français par défaut ; anglais et arabe complets.
- Le shell, les titres, descriptions, actions, formulaires, états, tableaux et données de démonstration visibles passent par les catalogues i18n.
- Les identifiants, noms propres et valeurs de mock restent des données, pas des chaînes UI.
- Arabe : `lang="ar"`, `dir="rtl"`, police Noto Sans Arabic, sidebar et drawer ancrés côté inline-start, icônes directionnelles inversées, alignements et espacements logiques.
- Les dates, nombres et montants utilisent `Intl` selon la locale ; devise XOF partout où le prototype affichait USD.

## Dépendances source impossibles ou non retenues

| Dépendance source                                              | Décision LOT 1                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Vite + plugin React                                            | non intégré ; remplacé par Next.js App Router existant                              |
| React Router                                                   | non intégré ; navigation et routes natives Next.js                                  |
| MUI / Emotion                                                  | non intégré ; Lucide + Tailwind + composants Radix                                  |
| Recharts 2                                                     | non repris ; graphiques légers en SVG/CSS, sans bundle obsolète                     |
| Google Fonts via `@import`                                     | remplacé par fontes npm locales, aucun appel externe                                |
| Sonner                                                         | conservé seulement si utile aux actions mockées                                     |
| Motion, DnD, carousel, resizable panels, date picker, confetti | non requis par les écrans LOT 1, donc non installés                                 |
| Composants shadcn non utilisés                                 | non copiés en masse ; seuls les composants demandés et leurs primitives sont portés |

## Règles de fidélité retenues

1. Conserver la palette, la densité, la typographie, le shell 260/60 px, la topbar 56 px, les cartes bordées et la structure des écrans.
2. Prendre le Design System et les écrans français récents comme référence canonique lorsque deux styles sources se contredisent.
3. Traduire et convertir en XOF les écrans anciens sans modifier leur intention fonctionnelle.
4. Remplacer les données anglo-américaines par des mocks crédibles d'Afrique francophone.
5. Ne créer aucun backend, flux d'authentification réel, persistance, permission effective ou logique métier.
6. Toutes les actions restent simulées localement et sont clairement identifiables comme démonstration.

## Corrections appliquées pendant le portage

- Les contrastes clairs ont été renforcés sans changer la hiérarchie chromatique : texte secondaire `#64748b` → `#526176`, succès `#059669` → `#047857`, avertissement `#d97706` → `#a14607`, information `#0284c7` → `#0369a1`.
- Le profil élève mobile, inutilisable dans la source à 360 px, est recomposé en blocs empilés sans chevauchement.
- Le changement de thème, les trois locales, le sens RTL, le repli de la sidebar et les interactions du catalogue sont persistants ou pilotables au clavier selon leur nature.
- Toutes les routes applicatives portent un préfixe de locale explicite (`/fr`, `/en`, `/ar`) ; `/` redirige vers le français, locale par défaut indépendante des préférences du navigateur.
- Les écrans de démonstration n'effectuent aucun appel API et n'introduisent ni authentification réelle, ni base de données, ni logique métier.
