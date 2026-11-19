# Structure PostgreSQL et plan de tests de sécurité multi-entreprises — KS BTP

**Statut :** document de conception uniquement. Le propriétaire a créé un projet Supabase de développement `KS-BTP-DEV` dans l'organisation `Service KS BTP`. Aucun schéma SQL ni aucune migration n'ont été exécutés. L'accès par l'intégration Supabase actuellement connectée n'est pas encore confirmé pour ce projet.

**Branche de travail :** `phase-1-architecture-multientreprises` du dépôt `siakakebe22-blip/KS-BTS-PREVIEW`.

## 1. Objectif

Définir une base PostgreSQL capable d'héberger plusieurs entreprises clientes dans une même application KS BTP, tout en garantissant l'isolation stricte de leurs données.

Le document sert de référence pour une future implémentation. Il ne constitue pas une preuve de sécurité tant que les politiques sont déployées et testées sur un environnement réel.

## 2. Principes non négociables

1. Toute donnée métier appartenant à une entreprise porte un `company_id` non nul.
2. L'entreprise active est déterminée côté serveur à partir d'une adhésion vérifiée. Une valeur `company_id` envoyée par le navigateur n'est jamais considérée comme une autorisation.
3. Les contrôles d'accès sont appliqués côté serveur et dans PostgreSQL, avec Row-Level Security (RLS) ou mécanisme équivalent.
4. Les relations entre deux enregistrements doivent appartenir à la même entreprise.
5. Les références métier sont uniques dans leur entreprise, pas nécessairement à l'échelle mondiale.
6. Les opérations de stock sont atomiques, traçables et idempotentes. Aucun calcul critique ne dépend uniquement du navigateur.
7. Aucune migration des données KS existantes sans sauvegarde vérifiée, plan de retour arrière et autorisation explicite.
8. Aucun mélange entre les données KS historiques et les données de démonstration ou d'autres clients.

## 3. Schéma logique proposé

### Identité et entreprises

| Table | Rôle | Champs principaux |
|---|---|---|
| `companies` | Fiche de chaque entreprise cliente | `id`, `name`, `status`, `created_at` |
| `user_profiles` | Profil global d'un utilisateur | `user_id`, `display_name`, `created_at` |
| `company_memberships` | Rattachement d'un utilisateur à une entreprise | `id`, `company_id`, `user_id`, `status` |
| `roles` | Rôles disponibles | `id`, `company_id`, `code`, `name` |
| `permissions` | Autorisations détaillées | `code`, `description` |
| `membership_roles` | Rôles attribués aux adhésions | `membership_id`, `role_id` |

Un même utilisateur pourra appartenir à plusieurs entreprises. Le changement d'entreprise active devra refaire vérifier son adhésion et ses droits.

### Données opérationnelles

| Table | Rôle |
|---|---|
| `sites` | Chantiers et lieux de stockage |
| `materials` | Catalogue des matériels et matériaux |
| `stock_locations` | Magasin central, dépôts et stocks de chantier |
| `stock_documents` | En-têtes des bons de réception, sortie et retour |
| `stock_document_lines` | Lignes des bons et quantités |
| `stock_movements` | Journal des mouvements physiques de stock |
| `stock_balances` | Soldes calculés ou maintenus de façon transactionnelle |
| `suppliers` | Fournisseurs |
| `purchases` | Achats et approvisionnements |
| `maintenance_records` | Entretiens, pannes et réparations |
| `activity_logs` | Journal d'audit non destructif |
| `devices` | Appareils enregistrés pour la synchronisation |
| `sync_operations` | File d'opérations hors ligne à synchroniser |
| `plans`, `subscriptions` | Offres commerciales et abonnements |

Chaque table métier doit avoir au minimum `company_id`, `id`, `created_at`, `created_by` et, lorsque cela s'applique, `updated_at`, `updated_by` et `version`.

## 4. Contraintes d'intégrité

- Clés primaires UUID générées côté serveur.
- `NOT NULL` sur les champs obligatoires, notamment `company_id`.
- Clés étrangères composites pour empêcher les relations interentreprises. Exemple conceptuel : une ligne de bon référence un matériel par le couple `(company_id, material_id)`.
- Index sur `(company_id, id)`, `(company_id, site_id)`, `(company_id, created_at)` et les colonnes de recherche utilisées par les écrans.
- Index uniques composés, par exemple `UNIQUE(company_id, document_number)`.
- Quantités numériques décimales lorsque l'unité métier l'exige; valeurs finies et strictement positives pour les quantités de transaction.
- Les suppressions d'enregistrements référencés sont bloquées ou remplacées par une annulation tracée. Pas de suppression en cascade sur les historiques financiers ou de stock.
- Les dates sont enregistrées en UTC et présentées dans le fuseau choisi par l'entreprise.

## 5. Isolation des entreprises

### Règle d'autorisation

Le serveur récupère l'utilisateur authentifié, vérifie son adhésion active à l'entreprise demandée, puis établit le contexte d'entreprise pour la transaction. Il ne fait jamais confiance à un simple identifiant fourni dans le corps de la requête.

### Politique RLS conceptuelle

Pour chaque table métier :

- activer RLS;
- refuser l'accès par défaut;
- autoriser SELECT, INSERT, UPDATE et DELETE seulement si l'utilisateur possède une adhésion active à la ligne de l'entreprise et la permission métier nécessaire;
- vérifier également `WITH CHECK` sur les nouvelles valeurs lors des INSERT et UPDATE;
- interdire à un utilisateur ordinaire de changer `company_id`;
- réserver les opérations interentreprises à un rôle de plateforme séparé, fortement limité et audité.

La fonction de vérification d'adhésion doit être sécurisée, non récursive, et ne doit pas contourner accidentellement RLS. Les clés secrètes serveur ne doivent jamais être intégrées au JavaScript livré au navigateur.

**Important :** cette section décrit le résultat attendu, pas une politique RLS déjà installée. Le SQL final dépendra du fournisseur d'authentification et de l'hébergement retenus.

## 6. Règles de stock à préserver

Les opérations suivantes restent distinctes :

- Réception au magasin ou dépôt : augmente le stock de l'emplacement destinataire.
- Transfert autonome « sortie » : diminue le magasin source et augmente le stock du chantier destinataire.
- Bon de sortie KS BTP : représente une consommation sur chantier et diminue le stock du chantier.
- Retour : diminue le stock du chantier et augmente le stock central ou l'emplacement de retour.
- Consommation autonome : diminue le stock du chantier sans créer un transfert.
- Ajustement d'inventaire : opération réservée aux personnes autorisées, avec motif obligatoire et journal d'audit.

Chaque opération doit être validée dans une seule transaction PostgreSQL : contrôle du solde, écriture du mouvement, mise à jour du solde et enregistrement de l'opération idempotente. Si une étape échoue, toute la transaction est annulée.

Le solde ne doit jamais devenir négatif, sauf décision métier future explicitement approuvée. Les corrections ne doivent pas effacer l'historique.

## 7. Hors ligne et synchronisation

Chaque opération créée hors ligne reçoit un UUID d'opération stable, un identifiant d'appareil, une date de création locale et une version de l'enregistrement de référence.

À la synchronisation :

1. authentifier l'utilisateur et vérifier l'entreprise;
2. vérifier l'identifiant d'opération pour empêcher les doublons;
3. contrôler les permissions et les références;
4. vérifier les versions et les conflits;
5. appliquer les mouvements de stock atomiquement côté serveur;
6. retourner un accusé de réception durable;
7. conserver une trace de réussite ou d'échec.

Une opération de stock ne doit jamais être fusionnée par simple « dernière écriture gagnante ». En cas de conflit, elle est mise en attente pour résolution contrôlée.

## 8. Tests de sécurité obligatoires

| ID | Test | Résultat attendu |
|---|---|---|
| SEC-01 | L'utilisateur A lit les données de l'entreprise B | Refus / aucune ligne exposée |
| SEC-02 | L'utilisateur A modifie un enregistrement de B | Refus |
| SEC-03 | L'utilisateur A envoie le `company_id` de B à l'insertion | Refus |
| SEC-04 | L'utilisateur tente de changer le `company_id` d'une ligne | Refus |
| SEC-05 | Une ligne de bon de A référence un matériel de B | Refus par contrainte |
| SEC-06 | Un utilisateur sans permission crée un bon | Refus |
| SEC-07 | Un utilisateur révoqué réutilise une ancienne session | Accès refusé après révocation effective |
| SEC-08 | Un identifiant d'opération est envoyé deux fois | Une seule opération appliquée |
| SEC-09 | Deux appareils consomment simultanément le dernier stock | Pas de stock négatif; une opération échoue ou attend |
| SEC-10 | Une synchronisation échoue au milieu d'une opération | Aucune écriture partielle |
| SEC-11 | Un export de A est demandé par B | Refus; export limité à A |
| SEC-12 | Une sauvegarde de A est restaurée dans B | Refus ou procédure de migration contrôlée |
| SEC-13 | Un utilisateur tente d'obtenir un rôle administrateur | Refus sans permission dédiée |
| SEC-14 | Une adhésion d'entreprise est suspendue | Accès métier refusé |
| SEC-15 | Les journaux d'audit sont consultés ou modifiés sans droit | Lecture limitée; modification interdite |

Tous ces tests doivent être exécutés avec au moins deux entreprises fictives et plusieurs utilisateurs aux rôles différents. Les tests doivent inclure les appels API directs, pas seulement les boutons de l'interface.

## 9. Tests métier de non-régression

Avant toute migration, comparer les résultats de l'ancien système et du nouveau sur un jeu de données de test sauvegardé :

- stock initial + réceptions + transferts entrants - consommations - retours sortants;
- distinction entre transfert autonome « sortie » et bon de sortie consommé;
- unités différentes jamais additionnées ensemble;
- références de bons uniques dans l'entreprise;
- liens entre chantier, matériel, bon et mouvement;
- rapport général identique aux journaux sources;
- annulation et correction traçables;
- répétition d'une synchronisation sans doublon.

Aucun test ne doit être exécuté contre les données réelles de production.

## 10. Stratégie de migration KS

1. Inventorier les collections locales actuelles et leurs champs.
2. Demander une sauvegarde complète depuis l'application.
3. Vérifier le fichier de sauvegarde : format, intégrité, volumes et lisibilité.
4. Construire un outil de prévisualisation qui compte les enregistrements à importer sans écrire.
5. Associer les anciennes données au tenant KS uniquement après confirmation explicite.
6. Importer par lots avec identifiants de migration et journal de correspondance.
7. Comparer les totaux avant/après.
8. Prévoir une procédure de retour arrière documentée.
9. Conserver les données locales d'origine tant que l'utilisateur n'a pas validé la migration.

La migration doit être idempotente : relancer le même lot ne doit pas dupliquer les données.

## 11. Décisions encore à confirmer

- Fournisseur final pour PostgreSQL et authentification.
- Politique de sauvegarde, durée de conservation et restauration.
- Qui peut créer un bon de sortie : responsable chantier directement ou demande au magasinier?
- Qui valide les réceptions fournisseurs et les ajustements d'inventaire?
- Droits de consultation des coûts pour le rôle comptable.
- Règles commerciales des abonnements, suspension et export à la fin d'un abonnement.

## 12. Critères d'acceptation avant toute mise en service

La fondation ne sera considérée comme prête que lorsque :

- deux entreprises peuvent être créées sans partager leurs données;
- tous les tests SEC-01 à SEC-15 passent;
- les tests métier de stock passent;
- les sauvegardes et restaurations sont testées;
- l'authentification est réelle et les permissions sont appliquées côté serveur;
- la synchronisation est idempotente et résistante aux conflits;
- la migration KS a été répétée sur une copie de test et rapprochée;
- les coûts et limites de l'offre d'hébergement ont été vérifiés;
- l'utilisateur a autorisé explicitement la mise en place sur un environnement choisi.

**Aucune de ces conditions n'est réputée satisfaite par la seule présence de ce document.**
