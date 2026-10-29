# LOT16 — Continuité d'identité GestSchool V2 → V3

Statut : **IN PROGRESS — MÉCANISME SYNTHÉTIQUE UNIQUEMENT**.

LOT16 prépare la continuité de connexion entre V2 et V3 sans copier de données
réelles dans cette phase.

## Objectif propriétaire

Un utilisateur V2 doit pouvoir, lorsque son identité n'est pas ambiguë :

- utiliser le même email ou le même username ;
- saisir le même mot de passe ;
- retrouver le membership et les droits correspondant à son établissement.

## Compatibilité des identifiants

V3 conserve l'email comme identité globale.

Le username V2 est stocké comme `Membership.legacyUsername`, car V2 le
contraint par tenant. Au login :

1. un email exact est résolu en priorité ;
2. sinon V3 cherche les memberships actifs portant le username legacy ;
3. si tous les résultats appartiennent au même User V3, le login est accepté et
   le membership correspondant est sélectionné ;
4. si plusieurs utilisateurs distincts portent ce username, V3 répond avec
   l'erreur générique `AUTH_INVALID_CREDENTIALS`.

Aucune information de collision n'est exposée au client.

## Compatibilité des mots de passe

V2 utilise bcrypt. V3 utilise Argon2id.

Pendant la transition :

1. V3 reconnaît un hash bcrypt legacy ;
2. le mot de passe fourni est vérifié avec bcrypt ;
3. si la vérification réussit, V3 génère immédiatement un hash Argon2id ;
4. le hash est remplacé atomiquement pendant le login ;
5. `passwordChangedAt` n'est pas modifié, car l'utilisateur n'a pas changé son
   mot de passe ;
6. les connexions suivantes utilisent Argon2id.

Les nouveaux mots de passe V3 restent Argon2id uniquement.

## Garde-fous

- aucun mot de passe en clair n'est exporté ni journalisé ;
- aucun refresh token, cookie, session ou token V2 n'est migré ;
- aucun compte réel n'est importé sans autorisation explicite ;
- les collisions email/username doivent être détectées par le dry-run #82 avant
  tout apply ;
- la recette propriétaire staging est suivie dans #83.


## Dry-run de migration

Le dry-run #82 utilise `scripts/lot16-identity-dry-run.mjs`.

Commande :

```bash
pnpm lot16:identity:dry-run -- --input <export-v2-sans-secret.json>
```

Le format d'entrée accepte uniquement les métadonnées nécessaires au diagnostic :

- identifiant source ;
- tenant source ;
- username ;
- email éventuel ;
- rôle ;
- statut d'activation ;
- type de hash (`BCRYPT`), mais jamais le hash lui-même.

Le dry-run refuse explicitement les champs sensibles comme les mots de passe,
hashes, tokens, cookies, sessions et secrets MFA.

Le rapport ne contient ni email ni username en clair. Les enregistrements sont
référencés uniquement par empreintes SHA-256 tronquées.

### Mapping de rôles

| V2 | V3 |
| --- | --- |
| `ADMIN` | `SCHOOL_ADMIN` |
| `SCOLARITE` | `ACADEMIC_STAFF` |
| `ENSEIGNANT` | `TEACHER` |
| `COMPTABLE` | `ACCOUNTANT` |
| `PARENT` | `PARENT` |
| `STUDENT` | `STUDENT` |

Tout rôle non listé est bloquant.

### Blocages détectés avant toute migration

Le dry-run bloque notamment :

- compte V2 sans email tant qu'une politique dédiée n'est pas approuvée ;
- email global réutilisé par plusieurs comptes source distincts ;
- username global ambigu entre plusieurs identités ;
- doublon username/email à l'intérieur d'un même tenant V2 ;
- rôle non mappé ;
- format de hash autre que bcrypt ;
- présence de données d'authentification sensibles dans l'export de diagnostic.

Aucune écriture en base V3 n'est effectuée par ce script.
