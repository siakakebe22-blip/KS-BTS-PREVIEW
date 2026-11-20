-- KS BTP — REQUÊTES DE CONTRÔLE EN LECTURE SEULE
-- À exécuter uniquement dans un environnement de test après application
-- du brouillon de schéma. Ces requêtes ne modifient aucune donnée.

-- A. Vérifier la structure de la table d'affectation.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'company_site_assignments'
order by ordinal_position;

-- B. Vérifier les contraintes (notamment les clés composites).
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.company_site_assignments'::regclass
order by contype, conname;

-- C. Vérifier que toutes les affectations pointent vers un membre et
-- un chantier de la même entreprise.
select a.id, a.company_id, a.site_id, a.user_id
from public.company_site_assignments a
left join public.construction_sites s
  on s.company_id = a.company_id and s.id = a.site_id
left join public.company_members m
  on m.company_id = a.company_id and m.user_id = a.user_id
where s.id is null or m.user_id is null;

-- Résultat attendu : zéro ligne.

-- D. Repérer les affectations actives pour un utilisateur dont le rôle
-- n'est pas site_manager ou dont l'adhésion est inactive.
select a.id, a.company_id, a.site_id, a.user_id, m.role, m.is_active
from public.company_site_assignments a
join public.company_members m
  on m.company_id = a.company_id and m.user_id = a.user_id
where a.is_active = true
  and (m.is_active = false or m.role <> 'site_manager');

-- Résultat attendu : zéro ligne après mise en place du flux métier
-- de conversion/affectation des rôles.

-- E. Confirmer que RLS est activée.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'company_site_assignments';

-- F. Inventorier les politiques existantes sur les tables sensibles.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'company_site_assignments','construction_sites','stock_locations',
    'stock_balances','stock_movements','materials','company_members'
  )
order by tablename, policyname;
