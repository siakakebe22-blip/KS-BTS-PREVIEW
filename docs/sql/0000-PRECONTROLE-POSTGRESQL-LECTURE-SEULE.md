# KS BTP — Précontrôle PostgreSQL en lecture seule

**Statut :** requêtes SELECT uniquement — aucune modification de la base.  
**Projet attendu :** `KS-BTP-DEV`  
**À utiliser uniquement après avoir vérifié le nom du projet dans Supabase Studio.**

Ces requêtes servent à vérifier l'état initial avant toute proposition de création de tables. Elles ne doivent être lancées que dans le projet de développement KS-BTP-DEV.

## 1. Vérifier la version PostgreSQL

```sql
select
  current_database() as database_name,
  current_user as database_role,
  version() as postgres_version;
```

## 2. Vérifier si les noms des trois tables du brouillon existent déjà

```sql
select
  n.nspname as schema_name,
  c.relname as object_name,
  c.relkind as object_type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('companies', 'user_profiles', 'company_memberships')
order by c.relname;
```

Résultat attendu pour un schéma neuf : aucune ligne. Si une ou plusieurs lignes apparaissent, arrêter et examiner leur définition avant toute création.

## 3. Vérifier les politiques RLS existantes sur ces noms

```sql
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('companies', 'user_profiles', 'company_memberships')
order by tablename, policyname;
```

## 4. Vérifier l'état RLS des tables déjà présentes

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('companies', 'user_profiles', 'company_memberships')
order by c.relname;
```

## 5. Règles de retour

- Transmettre uniquement les résultats de ces requêtes SELECT, jamais le mot de passe de base, les clés API ou les secrets.
- Ne pas exécuter de commande `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE` ou `TRUNCATE` pendant ce précontrôle.
- Si le nom du projet n'est pas exactement `KS-BTP-DEV`, ne rien exécuter.
- Après lecture des résultats, comparer le schéma existant avec le brouillon SQL et demander une autorisation explicite avant toute écriture.
