# LOT16 — Accès propriétaire et recette staging V3

Statut : **PREPARED — AUCUN COMPTE RÉEL MIGRÉ**.

## Staging identifié

Projet Vercel :
- nom : `gestschool-v3-staging`
- projet : `prj_3UdsP3bidz7SrLfkogJC7VqPrxU8`
- équipe : `protels-projects`
- branche LOT16 : `feat/lot16-v2-identity-continuity`

Les URLs Preview sont dynamiques par commit. Elles ne doivent pas être traitées
comme une URL de production stable.

## Objectif d'accès propriétaire

Le propriétaire ne doit pas recevoir un mot de passe provisoire différent de V2.

La recette cible est :

1. exécuter le dry-run V2 → V3 ;
2. résoudre les collisions bloquantes ;
3. migrer le compte propriétaire vers le staging avec autorisation explicite ;
4. conserver son email / username V2 selon le résultat du dry-run ;
5. conserver son hash bcrypt V2 uniquement pour la transition ;
6. effectuer une première connexion V3 avec le même mot de passe V2 ;
7. vérifier la conversion automatique bcrypt → Argon2id ;
8. vérifier le tenant, les rôles et les droits ;
9. effectuer une deuxième connexion pour confirmer Argon2id ;
10. répéter avec au moins un second rôle utilisateur.

## Garde-fous

- aucune donnée réelle n'est copiée dans cette phase ;
- aucun mot de passe n'est affiché dans GitHub ;
- aucun secret n'est enregistré dans la documentation ;
- aucun partage de preview Vercel n'est créé avant besoin réel ;
- aucune URL Preview ne devient automatiquement une production ;
- aucune session ou token V2 n'est migré.

## Conditions avant de donner l'accès

- PR LOT16 validée ;
- dry-run #82 PASS sur l'export autorisé ;
- décision sur les comptes V2 sans email ;
- collisions username/email résolues ;
- migration staging explicitement autorisée ;
- compte propriétaire vérifié côté V3 ;
- URL Preview du SHA validé disponible.
