# KS BTP — Audit de préparation des rôles et des accès

Date : 20 novembre 2026
Périmètre : branche de prévisualisation et inspection SQL en lecture seule du projet KS-BTP-DEV.

## Résultat

Aucune modification n'a été apportée à Supabase : aucun compte, membre, rôle, schéma, privilège, politique RLS ou enregistrement n'a été créé, modifié ou supprimé.

## Constats vérifiés

### 1. Authentification et navigation
- La page `connexion.html` utilise Supabase Auth avec une clé publishable côté navigateur.
- Les pages cloud vérifient la présence d'une session avant de charger les données.
- La sélection d'entreprise et les pages cloud reposent sur les politiques RLS pour autoriser la lecture.
- L'inscription publique permet à un nouvel utilisateur de créer son propre compte et, via la RPC existante, son propre espace entreprise.
- La page de connexion ne propose pas encore d'invitation d'employé ni de gestion des membres.

### 2. Modèle de rôles actuel
La table `company_members` contient actuellement :
- `company_id`
- `user_id`
- `role`
- `is_active`
- `created_at`

Aucun champ d'affectation à un chantier n'existe dans cette table.

Les politiques RLS et la fonction `apply_stock_movement` utilisent les rôles techniques :
- `admin`
- `manager`
- `storekeeper`

Le rôle métier « Directeur » devra donc être mappé explicitement à `manager`. Le rôle « Chef de chantier » (`site_manager`) n'est pas encore reconnu par les politiques et la fonction de mouvement.

### 3. Limite majeure pour les chefs de chantier
La politique de lecture des chantiers autorise un membre actif à lire les chantiers de toute l'entreprise. Les politiques de lecture des matériels, emplacements, soldes et mouvements sont également au niveau de l'entreprise.

Il n'existe pas de relation membre ↔ chantier dans le schéma audité. Par conséquent, il est impossible aujourd'hui de limiter un chef de chantier à son seul chantier avec les règles actuelles.

### 4. Limite de gestion des membres
La table `company_members` possède une politique de lecture personnelle, mais aucune politique d'insertion ou de modification n'a été trouvée dans l'audit des politiques publiques. L'invitation, l'attribution et la désactivation des rôles ne sont donc pas encore disponibles via un flux applicatif sécurisé.

### 5. Propriétaire de l'entreprise
Plusieurs politiques accordent au propriétaire de l'entreprise les droits de gestion, indépendamment du rôle de membre. Ce comportement doit être conservé pour ne pas verrouiller le compte propriétaire. Les futures règles devront distinguer clairement propriétaire, administrateur délégué et autres membres.

### 6. Fonctions privilégiées
Les fonctions `create_company_with_central_stock`, `apply_stock_movement` et `create_stock_location` sont en `SECURITY DEFINER`. Elles doivent être conservées et auditées individuellement lors de toute évolution. `apply_stock_movement` accepte actuellement les rôles `admin`, `manager` et `storekeeper` pour les membres, avec des contrôles supplémentaires de paramètres et d'appartenance entreprise/emplacements.

## Matrice cible à formaliser

| Rôle métier | Rôle technique provisoire | Portée |
|---|---|---|
| Administrateur | `admin` | Entreprise entière, administration |
| Directeur | `manager` | Entreprise entière, supervision |
| Magasinier | `storekeeper` | Opérations de stock selon règles |
| Chef de chantier | À définir | Chantier(s) explicitement affecté(s) uniquement |

Le rôle technique du chef de chantier ne doit pas être ajouté aux politiques avant la création et la vérification d'un mécanisme d'affectation chantier et de règles RLS cohérentes sur les chantiers, emplacements, soldes et mouvements.

## Plan sûr avant activation

1. Définir la table d'affectation utilisateur ↔ chantier et les contraintes d'intégrité.
2. Définir les permissions métier exactes pour chaque rôle, y compris les opérations interdites.
3. Concevoir les politiques RLS et fonctions RPC avec contrôle serveur de l'entreprise, du rôle actif et du chantier affecté.
4. Concevoir un flux d'invitation sécurisé ; ne jamais laisser l'utilisateur choisir lui-même son rôle privilégié via des métadonnées modifiables.
5. Tester les accès positifs et négatifs avec des comptes de test séparés : propriétaire, directeur, magasinier, chef chantier affecté et chef chantier non affecté.
6. Vérifier les fonctions `SECURITY DEFINER`, les privilèges EXECUTE et les Security Advisors.
7. Sauvegarder et vérifier une procédure de retour arrière avant toute migration.

## Statut

Audit documentaire et SQL en lecture seule uniquement. Aucun test d'accès multi-comptes n'a été effectué. Les rôles ne sont pas activés et aucune migration n'est proposée comme prête à appliquer.
