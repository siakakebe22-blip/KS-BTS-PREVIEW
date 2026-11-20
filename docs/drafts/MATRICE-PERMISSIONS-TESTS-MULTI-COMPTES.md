# KS BTP — Matrice des permissions et plan de tests multi-comptes

**Statut : proposition de conception — aucun compte fictif créé, aucun droit modifié, aucun test d'accès exécuté sur Supabase.**

## 1. Principes non négociables

- Toute requête est limitée à une entreprise dont l'utilisateur est membre actif, sauf accès propriétaire explicitement vérifié.
- Le navigateur ne constitue jamais une preuve d'autorisation.
- Un identifiant de chantier fourni par le client doit être revérifié côté serveur.
- Les politiques RLS existantes permissives doivent être remplacées ou ajustées : les politiques permissives d'une même commande se combinent par OR.
- Les fonctions privilégiées doivent vérifier l'identité et le rôle côté base, utiliser un search_path sûr, et avoir des privilèges EXECUTE strictement limités.
- Les données historiques (mouvements, bons, achats) ne sont jamais effacées lors d'une révocation d'affectation.

## 2. Matrice proposée

Légende : **Oui** = autorisé dans le périmètre indiqué ; **Non** = interdit ; **Conditionnel** = à confirmer dans les règles métier avant migration.

| Action | Propriétaire | admin | manager / directeur | storekeeper | site_manager | accountant | viewer |
|---|---|---|---|---|---|---|---|
| Voir tableau de bord entreprise | Oui | Oui | Oui | Limité stock | Chantiers affectés | Conditionnel | Lecture seule |
| Gérer membres et rôles | Oui | Oui | Non | Non | Non | Non | Non |
| Affecter/révoquer un chef | Oui | Oui | Non (proposition) | Non | Non | Non | Non |
| Voir tous les chantiers | Oui | Oui | Oui | Liste utile au stock | Non | Conditionnel | Non |
| Voir chantier affecté | Oui | Oui | Oui | Selon emplacements | Oui | Conditionnel | Non |
| Créer/modifier chantier | Oui | Oui | Oui | Non | Non | Non | Non |
| Voir catalogue matériaux | Oui | Oui | Oui | Oui | Limité aux besoins affectés | Conditionnel | Lecture seule |
| Gérer catalogue matériaux | Oui | Oui | Conditionnel | Conditionnel | Non | Non | Non |
| Voir soldes de stock | Oui | Oui | Oui | Oui selon emplacements | Affectations seulement | Conditionnel | Lecture seule limitée |
| Entrée/sortie/transfert stock | Oui | Oui | Conditionnel | Oui selon emplacements | Conditionnel, chantier affecté | Non | Non |
| Valider demande/réception chantier | Oui | Oui | Oui | Oui pour remise magasin | Chantier affecté | Non | Non |
| Voir mouvements et pièces | Oui | Oui | Oui | Selon emplacements | Chantier affecté | Conditionnel | Lecture seule limitée |
| Rapports financiers/achats | Oui | Oui | Conditionnel | Non | Non | Oui (à préciser) | Non |
| Réglages et sauvegardes | Oui | Oui | Non | Non | Non | Non | Non |

### Décisions à figer avant le SQL final

1. Le directeur `manager` conserve-t-il une visibilité sur tous les chantiers ? Proposition : oui.
2. Le magasinier `storekeeper` travaille-t-il sur tous les emplacements ou seulement ceux qui lui sont attribués ? Proposition initiale : tous les emplacements de l'entreprise, car aucun mécanisme d'affectation magasinier n'a été audité.
3. Le chef `site_manager` peut-il créer une demande de matériel et confirmer une réception ? Proposition : oui, uniquement sur ses chantiers affectés ; il ne valide pas seul la sortie physique du magasin.
4. Les rôles `accountant` et `viewer` sont présents dans la contrainte de base, mais leurs droits métier doivent être confirmés avant de les élargir.
5. Un membre peut-il être à la fois magasinier et chef de chantier ? Le modèle actuel `company_members.role` stocke un seul rôle. Ne pas inventer un système multi-rôle sans décision dédiée.

## 3. Jeu de comptes de test (à créer uniquement dans un projet de test isolé)

| Compte de test | Entreprise | Rôle | Affectation |
|---|---|---|---|
| T-OWNER-A | Entreprise A | Propriétaire | Toutes |
| T-ADMIN-A | Entreprise A | admin | Toutes |
| T-DIRECTOR-A | Entreprise A | manager | Toutes |
| T-STORE-A | Entreprise A | storekeeper | Tous emplacements (hypothèse à valider) |
| T-CHEF-A1 | Entreprise A | site_manager | Chantier A1 uniquement |
| T-CHEF-A2 | Entreprise A | site_manager | Chantier A2 uniquement |
| T-CHEF-NONE | Entreprise A | site_manager | Aucune |
| T-ACCOUNT-A | Entreprise A | accountant | Aucun chantier |
| T-VIEW-A | Entreprise A | viewer | Aucun chantier |
| T-MEMBER-B | Entreprise B | admin ou membre | Entreprise B seulement |
| T-DISABLED-A | Entreprise A | membre désactivé | Affectation historique inactive |
| T-ANON | Aucune | anon | Aucune session |

Les comptes, entreprises, chantiers et matériaux doivent être des données jetables dans un environnement isolé, jamais les données KS BTP réelles.

## 4. Scénarios de tests positifs et négatifs

| ID | Action testée | Résultat attendu |
|---|---|---|
| AUTH-01 | T-ANON lit une table métier | Refus / zéro ligne |
| TEN-01 | T-MEMBER-B lit ou modifie entreprise A | Refus / zéro ligne |
| OWN-01 | T-OWNER-A lit les données A | Autorisé |
| ADM-01 | T-ADMIN-A crée une affectation sur A1 | Autorisé |
| ADM-02 | T-STORE-A tente d'affecter T-CHEF-A1 | Refus |
| ADM-03 | T-CHEF-A1 tente de modifier son rôle | Refus |
| SITE-01 | T-CHEF-A1 lit chantier A1 | Autorisé |
| SITE-02 | T-CHEF-A1 lit chantier A2 | Refus / zéro ligne |
| SITE-03 | T-CHEF-A2 lit chantier A1 | Refus / zéro ligne |
| SITE-04 | T-CHEF-NONE lit A1 | Refus / zéro ligne |
| SITE-05 | T-CHEF-A1 fournit un site_id de l'entreprise B | Refus |
| SITE-06 | T-CHEF-A1 révoqué tente de relire A1 | Refus immédiat après révocation |
| STOCK-01 | T-CHEF-A1 lit solde d'un emplacement lié à A1 | Autorisé si droit validé |
| STOCK-02 | T-CHEF-A1 lit solde d'un emplacement lié à A2 | Refus / zéro ligne |
| STOCK-03 | T-CHEF-A1 tente mouvement depuis un emplacement A2 | Refus |
| STOCK-04 | T-CHEF-A1 tente mouvement vers un emplacement B | Refus |
| STOCK-05 | T-STORE-A effectue opération autorisée sur stock A | Autorisé |
| IDEM-01 | Même idempotency_key envoyée deux fois | Un seul mouvement enregistré |
| ROLE-01 | Compte désactivé appelle une fonction | Refus |
| HIST-01 | Affectation révoquée | Historique des mouvements et documents conservé |
| RLS-01 | Ancienne policy large est encore active | Test échoue : ne pas déployer |

## 5. Données de test minimales

Dans l'environnement isolé seulement :
- Entreprise A et entreprise B.
- Deux chantiers A1/A2 pour A et un chantier B1 pour B.
- Un emplacement central A, un emplacement chantier A1, un emplacement chantier A2 et un emplacement B1.
- Deux matériaux et soldes initiaux sans valeur réelle.
- Une affectation A1 pour T-CHEF-A1, A2 pour T-CHEF-A2.
- Un mouvement d'essai par type autorisé, avec clés idempotentes dédiées.

## 6. Critères de sortie avant toute mise en production

- Tous les tests négatifs sont refusés, pas seulement masqués par l'interface.
- Les tests positifs ne cassent pas les accès existants du propriétaire/admin.
- Les politiques permissives historiques ont été inventoriées et remplacées proprement.
- Les fonctions SECURITY DEFINER ont été auditées, y compris `apply_stock_movement`.
- Les grants sur tables, séquences et fonctions sont minimaux.
- Les advisors Supabase sont examinés.
- Une sauvegarde restaurable est vérifiée sur un environnement distinct.
- Un plan de retour arrière est écrit et testé.
- Validation métier explicite avant activation sur KS BTP réel.

## 7. État d'exécution

| Élément | État |
|---|---|
| Matrice de permissions proposée | Documentée |
| Comptes de test | Non créés |
| Données isolées | Non créées |
| Tests RLS multi-comptes | Non exécutés |
| Migration Supabase | Non appliquée |
| Production | Inchangée |

**Prochaine opération technique sûre :** obtenir ou créer un projet Supabase de test vide, séparé de `KS-BTP-DEV`, puis y appliquer uniquement une version candidate de la migration après revue. Ne pas utiliser KS-BTP-DEV comme banc d'essai.
