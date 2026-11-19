# KS BTP — Brouillon SQL 01 : socle identité et entreprises

**Statut : BROUILLON À RELIRE — NON EXÉCUTABLE EN L'ÉTAT**  
**Cible prévue :** projet Supabase de développement `KS-BTP-DEV`  
**Projet Supabase (référence fournie par le propriétaire) :** `fbqtbaeanxromfksfllr`  
**Branche :** `phase-1-architecture-multientreprises`  
**Aucune requête SQL n'a été exécutée. Aucune table n'a été créée.**

> Ce fichier est une proposition de conception. Il ne doit pas être copié dans le SQL Editor avant validation du périmètre, vérification de l'état réel de la base et autorisation explicite. Il ne contient aucune donnée KS historique et ne migre rien.

## 1. Portée de cette première étape

Créer uniquement les fondations d'identité et d'appartenance :

- `companies` : entreprises clientes ;
- `user_profiles` : profil applicatif lié à `auth.users` ;
- `company_memberships` : appartenance et rôle d'un utilisateur dans une entreprise.

Les tables métier (matériels, chantiers, stocks, bons, achats, maintenance, journaux et synchronisation) seront conçues dans des étapes distinctes, après validation du socle et des permissions.

## 2. Principes de sécurité retenus

1. RLS activé sur chacune des trois tables.
2. Lecture d'une entreprise uniquement si l'utilisateur possède une adhésion active à cette entreprise.
3. Lecture des adhésions limitée à ses propres adhésions.
4. Lecture du profil limitée à son propre identifiant Auth.
5. Aucune politique client d'insertion, de modification ou de suppression pour les entreprises et adhésions dans ce premier brouillon. Leur création et leur gestion passeront par un flux serveur contrôlé, à concevoir séparément.
6. Le rôle est un code texte contrôlé par contrainte, mais cela ne suffit pas à autoriser les opérations métier. Les permissions détaillées feront l'objet d'une matrice et de politiques spécifiques.
7. Aucun rôle plateforme global n'est ajouté à ce stade.
8. Aucune clé `service_role` ou clé secrète ne doit apparaître dans le navigateur.

## 3. SQL proposé — à auditer avant exécution

Le bloc ci-dessous suppose une base de développement vierge pour ces noms de tables. Il doit être précédé d'un contrôle en lecture seule du catalogue PostgreSQL. Si une table portant l'un de ces noms existe déjà, ne pas exécuter ce bloc avant comparaison du schéma.

```sql
begin;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 160),
  legal_name text,
  registration_number text,
  address text,
  phone text,
  email text,
  currency_code text not null default 'GNF'
    check (currency_code ~ '^[A-Z]{3}$'),
  timezone text not null default 'Africa/Conakry',
  status text not null default 'onboarding'
    check (status in ('onboarding', 'trial', 'active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id)
);

create table public.user_profiles (
  user_id uuid primary key references auth.users(id),
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid not null references auth.users(id),
  role_code text not null
    check (role_code in (
      'company_admin',
      'manager',
      'storekeeper',
      'site_manager',
      'accountant_reader'
    )),
  status text not null default 'invited'
    check (status in ('invited', 'active', 'suspended', 'revoked')),
  invited_by uuid references auth.users(id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id),
  unique (company_id, id)
);

create index company_memberships_user_status_idx
  on public.company_memberships (user_id, status);

create index company_memberships_company_status_idx
  on public.company_memberships (company_id, status);

alter table public.companies enable row level security;
alter table public.user_profiles enable row level security;
alter table public.company_memberships enable row level security;

create policy "members can read their active companies"
on public.companies
for select
to authenticated
using (
  exists (
    select 1
    from public.company_memberships m
    where m.company_id = companies.id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

create policy "users can read their own memberships"
on public.company_memberships
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "users can read their own profile"
on public.user_profiles
for select
to authenticated
using (user_id = (select auth.uid()));

commit;
```

## 4. Points à ne pas interpréter à tort

- L'absence de politique INSERT/UPDATE/DELETE est volontaire : ces actions restent refusées aux clients Auth ordinaires tant qu'un flux serveur contrôlé n'a pas été conçu.
- Cette base ne permet pas encore de créer une entreprise depuis l'application. C'est une mesure de prudence, pas un oubli.
- La politique de lecture des entreprises dépend de l'adhésion active. Les utilisateurs ne peuvent pas s'ajouter eux-mêmes à une entreprise.
- Les codes de rôle ne constituent pas encore une matrice de permissions. Les boutons de l'interface ne seront jamais une preuve d'autorisation.
- La création d'un profil lors de l'inscription n'est pas automatisée dans ce brouillon. Aucun trigger Auth n'est ajouté.
- Les tables métier ne sont pas encore présentes ; aucune opération de stock n'est possible via ce socle.
- Le script ne configure aucun droit API supplémentaire. Supabase a modifié l'exposition par défaut des nouvelles tables : à la date de rédaction, les nouvelles tables du schéma `public` ne doivent pas être supposées accessibles via la Data API sans configuration explicite. Nous conserverons l'exposition minimale et n'accorderons que les droits nécessaires après audit.

## 5. Contrôles préalables en lecture seule

Avant toute exécution, vérifier dans le projet de développement :

1. que le projet affiché est bien `KS-BTP-DEV` ;
2. que les tables `companies`, `user_profiles` et `company_memberships` n'existent pas déjà ;
3. qu'aucune donnée ou migration antérieure ne sera écrasée ;
4. la version PostgreSQL et les paramètres RLS/API pertinents ;
5. que l'accès utilisé correspond au compte Supabase du projet de développement, et non à un autre projet.

En cas d'objet existant, arrêter et comparer avant de modifier.

## 6. Tests après exécution — non effectués

- utilisateur non connecté : aucune lecture ;
- utilisateur connecté sans adhésion : aucune entreprise visible ;
- utilisateur A avec adhésion active à A : A visible ;
- utilisateur A sans adhésion à B : B invisible ;
- utilisateur A : seules ses propres adhésions et son propre profil sont lisibles ;
- tentatives client d'insertion ou de modification des adhésions : refusées ;
- aucun accès anonyme ;
- vérification des droits SQL et de l'exposition Data API.

Les tests croisés devront utiliser deux entreprises et deux utilisateurs fictifs. Aucun compte client réel ne doit être utilisé pour ces tests.

## 7. Étape suivante

Après validation de ce brouillon et accès vérifié au bon projet, effectuer d'abord les contrôles de catalogue en lecture seule. Présenter leur résultat, puis demander une autorisation distincte avant toute exécution SQL.