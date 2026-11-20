# KS BTP — Conception des affectations aux chantiers et permissions

Statut : proposition technique de prévisualisation — NON APPLIQUÉE
Date : 20 novembre 2026

## Objectif

Permettre à un chef de chantier de consulter et d'effectuer uniquement les opérations autorisées sur le ou les chantiers auxquels il est affecté, sans lui ouvrir l'ensemble des données de l'entreprise.

Aucune table, politique RLS, fonction, permission ou donnée Supabase n'a été modifiée pour ce document.

## 1. Modèle de données proposé

Créer une table dédiée `company_site_assignments` :

| Colonne | Type | Rôle |
|---|---|---|
| id | uuid, clé primaire | Identifiant d'affectation |
| company_id | uuid, obligatoire | Entreprise concernée |
| site_id | uuid, obligatoire | Chantier affecté |
| user_id | uuid, obligatoire | Utilisateur affecté |
| is_active | boolean, défaut true | Activation/révocation de l'affectation |
| assigned_by | uuid, nullable | Utilisateur ayant fait l'affectation |
| created_at | timestamptz, défaut now() | Date de création |

Contraintes à prévoir :
- clé étrangère `company_id` vers `companies(id)`;
- clé étrangère `site_id` vers `construction_sites(id)`;
- clé étrangère `user_id` vers `auth.users(id)`;
- unicité du couple `(site_id, user_id)` pour éviter les affectations répétées ;
- contrôle serveur garantissant que le chantier et l'utilisateur appartiennent à la même entreprise ;
- index sur `(company_id, user_id, is_active)` et `(site_id, is_active)`.

La cohérence entreprise/chantier doit être garantie par une contrainte composite ou un trigger soigneusement testé. Une simple clé étrangère sur `site_id` ne suffit pas à garantir que `company_id` correspond.

## 2. Rôles métier et droits cibles

| Fonction | Administrateur | Directeur | Magasinier | Chef de chantier |
|---|---:|---:|---:|---:|
| Voir tableau de bord entreprise | Oui | Oui | Limité | Non |
| Voir les chantiers | Tous | Tous | Selon besoin | Affectés seulement |
| Voir catalogue matériel | Oui | Oui | Oui | Matériel autorisé |
| Créer/modifier catalogue | Oui | Oui | Selon procédure | Non |
| Enregistrer réception centrale | Oui | Oui | Oui | Non |
| Transférer vers un chantier | Oui | Oui | Oui | Demande seulement |
| Enregistrer réception sur son chantier | Oui | Oui | Oui | Oui, chantier affecté |
| Consulter mouvements | Tous | Tous | Opérations magasin | Chantier affecté seulement |
| Gérer les membres et rôles | Oui | Non | Non | Non |
| Affecter les chefs aux chantiers | Oui | Oui, si autorisé | Non | Non |
| Modifier les paramètres globaux | Oui | Consultation | Non | Non |
| Supprimer ou désactiver des données | Selon procédure | Non par défaut | Non | Non |

Les droits du directeur et les opérations de validation doivent être confirmés par l'entreprise avant mise en service. Les permissions ci-dessus sont une proposition prudente, pas une autorisation déjà appliquée.

## 3. Correspondance avec les rôles techniques existants

- Administrateur : `admin`
- Directeur : `manager`
- Magasinier : `storekeeper`
- Chef de chantier : nouveau rôle technique proposé `site_manager`

Le rôle `site_manager` ne doit pas être ajouté aux politiques existantes tant que les règles d'affectation et les restrictions de portée ne sont pas installées et testées.

## 4. Point de sécurité essentiel : remplacer les règles larges

Les politiques RLS actuellement observées sont permissives et certaines autorisent tout membre actif d'une entreprise à lire tous ses chantiers, matériels, emplacements, soldes et mouvements.

Dans PostgreSQL, plusieurs politiques permissives sont combinées par OR. Ajouter une nouvelle politique restrictive pour les chefs de chantier ne neutraliserait donc pas automatiquement une ancienne politique permissive trop large.

La future migration devra examiner et remplacer précisément les politiques de lecture concernées, en conservant l'accès du propriétaire, de l'administrateur, du directeur et du magasinier selon la matrice approuvée.

Portée d'accès recommandée :
- `construction_sites` : chantier affecté uniquement pour `site_manager`;
- `stock_locations` : emplacements dont le `site_id` correspond à un chantier affecté ;
- `stock_balances` : soldes des emplacements des chantiers affectés ;
- `stock_movements` : mouvements dont la source ou la destination est un emplacement autorisé, avec contrôle des deux côtés pour empêcher la fuite d'informations entre chantiers ;
- `materials` : catalogue de l'entreprise en lecture si nécessaire au travail sur chantier, sans droit de modification pour le chef ;
- `company_members` : pas d'accès à la liste générale des employés pour le chef de chantier.

Les politiques d'écriture doivent aussi vérifier le rôle actif, l'entreprise, le chantier affecté, les emplacements concernés et les paramètres du mouvement. Une simple restriction de l'interface web ne protège pas les données.

## 5. Fonctions serveur à revoir

La fonction `apply_stock_movement` accepte actuellement les rôles techniques `admin`, `manager` et `storekeeper` pour les membres. Elle ne doit pas accepter `site_manager` sans logique spécifique.

Avant d'autoriser un chef de chantier à réceptionner ou retourner du matériel, définir précisément :
- les types de mouvements autorisés ;
- le chantier et l'emplacement de destination ;
- l'interdiction d'utiliser un emplacement d'un autre chantier ;
- la quantité positive et le matériel actif de la même entreprise ;
- la clé d'idempotence et la traçabilité de l'auteur.

Les fonctions en `SECURITY DEFINER` doivent conserver un `search_path` sûr, vérifier `auth.uid()` et contrôler explicitement les appartenances. Aucun privilège `service_role` ne doit être placé dans le navigateur.

## 6. Ordre de réalisation sans risque

1. Valider cette matrice métier.
2. Écrire une migration isolée pour la table d'affectation et ses index/contraintes.
3. Préparer le remplacement des politiques RLS existantes, sans les empiler.
4. Adapter les fonctions RPC et la gestion des membres.
5. Créer des comptes de test distincts et des chantiers de test isolés.
6. Tester refus et autorisations pour chaque rôle, y compris tentative d'accès à un chantier non affecté.
7. Vérifier les Security Advisors et sauvegarder avant application.
8. Seulement après validation, planifier l'application sur le projet cible.

## 7. Tests négatifs obligatoires

- Un chef affecté au chantier A ne peut pas lire le chantier B.
- Il ne peut pas lire les soldes ou mouvements du chantier B.
- Il ne peut pas transférer du stock depuis ou vers un emplacement du chantier B.
- Il ne peut pas ajouter ou désactiver un membre.
- Un membre désactivé ne conserve aucun accès.
- Un utilisateur d'une autre entreprise ne peut pas affecter ou consulter un chantier.
- Le propriétaire et les rôles autorisés conservent leurs accès existants.

## Décision de sécurité

Cette proposition n'est pas une migration prête à exécuter. Il faut confirmer les droits métier et réaliser les tests sur un environnement isolé. Aucun changement Supabase ne doit être appliqué sur la seule base de ce document.
