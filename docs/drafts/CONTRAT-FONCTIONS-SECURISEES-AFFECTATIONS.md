# KS BTP — Contrat des fonctions sécurisées d'affectation

**Statut : conception seulement — aucune fonction créée ou modifiée dans Supabase.**

## Pourquoi cette étape est nécessaire

L'audit en lecture seule du 20 novembre 2026 a confirmé :
- `company_members` autorise actuellement les rôles `admin`, `manager`, `storekeeper`, `accountant`, `viewer`.
- `site_manager` n'est pas encore un rôle accepté par la contrainte actuelle.
- Les politiques SELECT actuelles sur chantiers, matériaux, emplacements, soldes et mouvements donnent une visibilité à l'échelle de l'entreprise à tout membre actif.
- Les politiques propriétaire donnent aussi un accès entreprise au propriétaire.
- Les politiques RLS sont permissives : ajouter une règle plus stricte sans retirer/remplacer les anciennes ne réduit pas les accès.
- `apply_stock_movement` est une fonction `SECURITY DEFINER` exécutable par `authenticated`. Son contrôle de rôle actuel doit être revu en même temps que les permissions chantier.
- `company_members` ne possède pas de politique d'administration des adhésions dans l'audit précédent.

**Conséquence :** ne pas activer `site_manager` et ne pas publier l'écran d'affectation tant que les anciennes politiques et le contrôle de la fonction de mouvement ne sont pas traités ensemble.

## Fonctions prévues (contrat, pas SQL exécutable)

Les fonctions d'administration seront conçues dans un schéma privé non exposé à l'API, avec des privilèges minimums. Si une fonction doit exceptionnellement être `SECURITY DEFINER`, elle devra :
- vérifier `auth.uid()` explicitement et refuser une session absente ;
- fixer un `search_path` vide et qualifier chaque table par son schéma ;
- vérifier que l'appelant est propriétaire de l'entreprise ou membre actif `admin` ;
- vérifier l'appartenance entreprise/utilisateur/chantier à chaque opération ;
- avoir EXECUTE révoqué de `PUBLIC` et `anon`, puis accordé uniquement au rôle nécessaire ;
- ne jamais accepter un rôle ou un company_id comme preuve d'autorisation venant du navigateur.

### 1. `assign_site_manager(company_id, site_id, user_id)`
- Appelant : propriétaire ou membre actif `admin`.
- Vérifie que le chantier appartient à l'entreprise.
- Vérifie que l'utilisateur est déjà membre actif de cette même entreprise.
- Convertit/valide le rôle métier selon la règle retenue : un membre `site_manager` ne doit pas recevoir implicitement des privilèges globaux.
- Crée ou réactive l'affectation unique.
- Journalise l'auteur et l'heure.
- Refuse un utilisateur inactif, une entreprise étrangère ou un chantier étranger.

### 2. `revoke_site_assignment(company_id, site_id, user_id)`
- Appelant : propriétaire ou membre actif `admin`.
- Désactive l'affectation (historique conservé), ne supprime pas les mouvements ou les documents.
- Refuse toute cible qui ne relève pas de l'entreprise autorisée.

### 3. `list_site_assignments(company_id, site_id)`
- Lecture limitée au propriétaire/admin/manager autorisé.
- Ne retourne pas d'autres entreprises.
- Ne sert jamais de substitut à une politique RLS sur les tables métier.

## Matrice de permissions cible à valider

| Rôle | Portée |
|---|---|
| Propriétaire / admin | Toute l'entreprise, administration des membres et affectations |
| manager (directeur) | Gestion des chantiers et consultation/gestion globale selon les règles métier |
| storekeeper | Stock et mouvements selon les emplacements autorisés |
| site_manager | Chantiers affectés uniquement ; demandes, réceptions, retours et mouvements autorisés uniquement sur les emplacements de ces chantiers |
| accountant / viewer | À définir précisément avant migration ; ne pas leur attribuer de droits par défaut |

Le rôle `site_manager` ne doit pas pouvoir créer une affectation, modifier les rôles, choisir un autre company_id, ni accéder aux stocks des autres chantiers.

## Travaux obligatoires avant activation

1. Décider si un utilisateur peut être affecté à plusieurs chantiers et s'il peut aussi avoir un rôle global.
2. Définir les droits exacts d'`accountant` et `viewer`.
3. Remplacer les politiques larges concernées, sans casser les accès du propriétaire.
4. Ajouter le filtrage par affectation pour SELECT/INSERT/UPDATE/DELETE, selon chaque table.
5. Revoir `apply_stock_movement` : vérifier source ET destination, type de mouvement, entreprise, rôle et affectation ; conserver l'idempotence.
6. Examiner `create_stock_location` et toute autre fonction qui crée un emplacement chantier.
7. Tester avec de vrais comptes de test séparés : propriétaire, admin, directeur, magasinier, chef chantier affecté, chef non affecté, membre autre entreprise, compte désactivé, utilisateur anonyme.
8. Lancer les advisors Supabase et vérifier les grants/RLS avant toute activation.

## Tests d'acceptation indispensables

- Un chef affecté au chantier A peut consulter A, mais pas B.
- Un chef non affecté ne peut ni lire ni modifier A.
- Un chef affecté ne peut pas créer une affectation ni s'attribuer un rôle.
- Un chef ne peut pas fabriquer un company_id d'une autre entreprise.
- Un magasinier conserve les opérations permises par son rôle, sans élargissement accidentel.
- Le propriétaire conserve ses accès existants.
- Un utilisateur désactivé perd l'accès immédiatement selon les règles retenues.
- Une tentative de mouvement depuis ou vers un emplacement non autorisé est rejetée.
- Les anciennes politiques permissives ne laissent aucun accès plus large.
- Les clés idempotentes empêchent le double enregistrement des mouvements.

## Point de sécurité Supabase

La documentation officielle recommande de privilégier `SECURITY INVOKER`. Une fonction `SECURITY DEFINER` exposée aux utilisateurs connectés contourne potentiellement RLS et doit être traitée comme une API privilégiée. Référence : [Supabase — Database Functions](https://supabase.com/docs/guides/database/functions) et [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

**Aucune migration, politique, fonction, permission ou donnée de production n'a été modifiée.**
