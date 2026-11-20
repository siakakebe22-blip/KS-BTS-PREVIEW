-- KS BTP — BROUILLON DE MIGRATION (NE PAS EXECUTER EN PRODUCTION)
-- Objectif : préparer les affectations d'un chef de chantier.
-- État : documenté uniquement, non appliqué à Supabase.
-- Préconditions : sauvegarde restaurable vérifiée, environnement isolé,
-- validation métier, audit des politiques RLS existantes et tests négatifs.
--
-- Schéma confirmé en lecture seule :
-- company_members PK (company_id,user_id), rôle CHECK actuel :
-- admin, manager, storekeeper, accountant, viewer.
-- construction_sites UNIQUE(company_id,id).
-- Aucune affectation utilisateur-chantier existante observée.

begin;

-- 1. Étendre la liste des rôles sans supprimer les rôles existants.
alter table public.company_members
  drop constraint if exists company_members_role_check;

alter table public.company_members
  add constraint company_members_role_check
  check (role = any (array[
    'admin','manager','storekeeper','accountant','viewer','site_manager'
  ]::text[]));

-- 2. Table d'affectation : les clés composites garantissent que le membre
-- et le chantier appartiennent bien à la même entreprise.
create table public.company_site_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  site_id uuid not null,
  user_id uuid not null,
  is_active boolean not null default true,
  assigned_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint company_site_assignments_site_fk
    foreign key (company_id, site_id)
    references public.construction_sites(company_id, id)
    on delete cascade,

  constraint company_site_assignments_member_fk
    foreign key (company_id, user_id)
    references public.company_members(company_id, user_id)
    on delete cascade,

  constraint company_site_assignments_unique
    unique (company_id, site_id, user_id)
);

create index company_site_assignments_user_active_idx
  on public.company_site_assignments(company_id, user_id, is_active);

create index company_site_assignments_site_active_idx
  on public.company_site_assignments(company_id, site_id, is_active);

-- 3. RLS activée sans politique d'accès client à ce stade :
-- les rôles API ne peuvent pas lire/écrire cette table tant que des
-- politiques ciblées et des RPC d'administration n'ont pas été validées.
alter table public.company_site_assignments enable row level security;

commit;

-- IMPORTANT :
-- Aucune politique RLS d'accès n'est ajoutée dans ce brouillon.
-- Le trigger de validation du rôle site_manager, les RPC d'affectation,
-- les permissions GRANT et les politiques de lecture/écriture des tables
-- chantier/stock doivent faire l'objet d'une étape distincte.
-- Avant toute application, tester la migration sur une copie isolée,
-- puis inspecter les contraintes, grants, policies et advisors.
-- Pour annuler après application, il faudra une migration inverse dédiée ;
-- ne pas exécuter DROP TABLE à l'aveugle si des affectations existent.
