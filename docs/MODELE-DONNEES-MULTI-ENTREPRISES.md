# KS BTP — Modèle de données cible et correspondance avec le prototype

**Phase :** 1 — conception technique  
**Branche :** `phase-1-architecture-multientreprises`  
**Nature :** spécification, aucune migration ni modification des données locales.

## 1. Règles communes

Toutes les tables métier sont rattachées à une entreprise par `company_id`. L'identifiant de l'entreprise est imposé et validé par le serveur à partir de l'appartenance authentifiée de l'utilisateur. Le navigateur ne peut pas choisir librement le périmètre d'accès.

Champs communs recommandés pour les enregistrements métier :
- `id` : identifiant stable (UUID côté serveur) ;
- `company_id` : entreprise propriétaire, obligatoire ;
- `created_at`, `updated_at` : horodatages serveur ;
- `created_by`, `updated_by` : utilisateur responsable, si applicable ;
- `version` : numéro de version pour détection de conflits ;
- `archived_at` : archivage logique si le métier autorise l'archivage.

Les identifiants externes et références lisibles sont uniques dans leur entreprise, pas nécessairement sur toute la plateforme.

## 2. Tables et champs proposés

### `companies`
- `id`, `name`, `legal_name`, `registration_number`, `address`, `phone`, `email`
- `currency_code`, `timezone`, `status`, `created_at`, `updated_at`
- États possibles à préciser : onboarding, trial, active, suspended, closed.

### `user_profiles`
- `id` (lié à l'identité du fournisseur d'authentification), `display_name`, `email`, `phone`, `created_at`.

### `company_memberships`
- `id`, `company_id`, `user_id`, `role_id`, `status`, `invited_by`, `joined_at`.
- Contrainte unique : (`company_id`, `user_id`).

### `roles` et `permissions`
- Rôles attribués dans le périmètre d'une entreprise ; permissions explicites par action et ressource.
- Les autorisations effectives sont contrôlées côté serveur, jamais uniquement par masquage des boutons.

### `sites` (chantiers)
- `id`, `company_id`, `name`, `manager_name`, `address`, `status`, `start_date`, `end_date`.
- Le prototype contient actuellement `id`, `name`, `manager`, `address`, `status`.

### `materials` (matériels et consommables)
- `id`, `company_id`, `reference`, `name`, `category`, `material_type`, `unit`, `threshold`, `description`, `is_active`.
- Contrainte unique : (`company_id`, `reference`).
- Le prototype stocke aussi `quantity`, `location` et `stockBalances`. Dans la cible, le solde est calculé depuis les mouvements ou maintenu dans une table de soldes transactionnellement cohérente ; il ne faut pas conserver plusieurs quantités concurrentes sans règle d'autorité.

### `stock_locations` (magasin central et emplacements)
- `id`, `company_id`, `site_id` nullable pour le magasin central, `location_type`, `name`, `is_active`.
- Un emplacement de chantier doit référencer un chantier de la même entreprise.
- Le stock historique non réparti doit être conservé dans un emplacement explicite de type `unallocated` jusqu'à régularisation validée.

### `stock_movements` (journal des mouvements)
- `id`, `company_id`, `material_id`, `movement_type`, `quantity`, `unit`, `source_location_id`, `destination_location_id`, `occurred_at`, `note`, `document_id`, `operation_id`, `created_by`.
- Types métier à normaliser : entrée, transfert/sortie vers chantier, consommation, retour, ajustement autorisé.
- Quantité strictement positive ; le sens est porté par le type et les emplacements.
- Les mouvements validés sont append-only : correction par contre-mouvement/annulation tracée, pas par réécriture silencieuse.

### `stock_balances` (projection des soldes)
- `company_id`, `material_id`, `location_id`, `quantity`, `version`, `updated_at`.
- Clé unique : (`company_id`, `material_id`, `location_id`).
- Toute écriture de mouvement et mise à jour du solde doit être atomique côté serveur. La quantité ne peut pas devenir négative.

### `stock_documents` et `stock_document_lines`
- En-tête : `id`, `company_id`, `reference`, `document_type`, `occurred_at`, `site_id`, `supplier_id`, `recipient_name`, `note`, `status`, `created_by`.
- Lignes : `id`, `company_id`, `document_id`, `material_id`, `quantity`, `unit`, `unit_price`, `line_total`.
- Contrainte unique : (`company_id`, `reference`).
- Un bon validé génère ses mouvements associés dans une transaction unique. Le document et les mouvements ne doivent jamais être enregistrés séparément avec risque de divergence.

### `suppliers` et `purchases`
- Fournisseurs : identité et coordonnées au niveau de l'entreprise.
- Achats : `id`, `company_id`, `supplier_id`, `purchase_date`, `invoice_reference`, `currency_code`, `total_amount`, `document_id`.
- Lignes d'achat : matériel, quantité, prix unitaire, total et emplacement de réception.
- Le prototype enregistre les achats dans `purchases` et `purchaseHistory`, et copie certaines informations dans les bons. La cible doit définir une source de vérité et éviter les doubles comptages.

### `maintenance_records`
- `id`, `company_id`, `material_id`, `intervention_date`, `description`, `cost_amount`, `currency_code`, `status`, `created_by`, `updated_by`.

### `activity_logs`
- `id`, `company_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `description`, `occurred_at`, `metadata`.
- Journal append-only, accès restreint. Ne pas y placer de secrets ni de données personnelles non nécessaires.

### `devices` et `sync_operations`
- Appareil : `id`, `company_id`, `user_id`, `device_label`, `last_seen_at`, `revoked_at`.
- Opération : `id`, `company_id`, `device_id`, `operation_id`, `entity_type`, `payload`, `created_at_device`, `received_at_server`, `status`, `error_code`.
- Contrainte unique anti-doublon : (`company_id`, `operation_id`).
- Le serveur revalide chaque opération et l'appartenance au tenant avant application.

### `plans` et `subscriptions`
- À concevoir plus tard : offre, limites, période, statut, facturation et historique.
- L'expiration d'un abonnement ne doit pas empêcher l'entreprise d'exporter ses données ou de demander leur restitution.

## 3. Relations essentielles

- Une entreprise possède plusieurs membres, chantiers, matériels, emplacements, documents, mouvements, achats, interventions et journaux.
- Un chantier appartient à une seule entreprise.
- Un matériel appartient à une seule entreprise.
- Un emplacement appartient à une entreprise ; son chantier éventuel appartient à la même entreprise.
- Une ligne de document, un mouvement et une intervention ne peuvent référencer qu'un matériel du même tenant.
- Un mouvement peut être lié à un bon, mais un bon validé et ses mouvements sont créés atomiquement.
- Un utilisateur peut appartenir à plusieurs entreprises ; son rôle peut différer dans chacune.

## 4. Correspondance avec les collections locales actuelles

| Collection actuelle | Destination cible | Traitement |
|---|---|---|
| `materials` | `materials` + `stock_balances` | Séparer fiche et soldes sans perdre les quantités historiques |
| `sites` | `sites` + `stock_locations` | Préserver identifiants et liens historiques |
| `movements` | `stock_movements` | Normaliser les types et rattacher les emplacements |
| `documents` | `stock_documents` + lignes | Convertir chaque bon en en-tête et ligne(s) |
| `purchases` / `purchaseHistory` | `suppliers` + achats + lignes | Dédupliquer les copies d'informations d'achat |
| `maintenance` | `maintenance_records` | Relier le matériel et conserver dates, coût, statut |
| `activityLog` | `activity_logs` | Conserver l'historique et son ordre chronologique |
| paramètres `company/currency/threshold` | `companies` / paramètres | Affecter au premier tenant KS après validation |

## 5. Règles métier à verrouiller avant migration

1. **Sortie de mouvement et bon de sortie :** ce sont deux opérations distinctes. Le mouvement autonome de type « sortie » transfère le stock du magasin central vers le chantier. Le bon de sortie, selon la règle métier déjà retenue pour KS BTP, représente une consommation sur chantier et débite donc le stock du chantier. Le futur modèle doit conserver cette distinction, avec des libellés explicites (transfert vers chantier / consommation sur chantier) pour éviter toute confusion.
2. **Réception :** préciser si la réception est une entrée fournisseur au magasin central ou directement sur un chantier.
3. **Retour :** confirmer le transfert du chantier vers le magasin central.
4. **Consommation :** distinguer le transfert de stock et la consommation réelle sur chantier.
5. **Stock d'ouverture :** documenter comment les quantités historiques non appuyées par des mouvements sont conservées.
6. **Achats :** déterminer si chaque réception correspond à un achat et comment gérer les réceptions sans facture.
7. **Références :** rendre les références des matériels et des bons uniques par entreprise, avec génération transactionnelle pour éviter les collisions multi-utilisateurs.
8. **Unités :** interdire l'addition de quantités de matériels d'unités différentes.

## 6. Contraintes et index serveur à prévoir

- Clés étrangères incluant `company_id` pour empêcher les relations inter-entreprises.
- Index sur (`company_id`, `reference`), (`company_id`, `material_id`), (`company_id`, `site_id`), dates et états.
- Transactions pour valider bon + lignes + mouvements + soldes.
- Contrôle de stock disponible sous verrou ou mécanisme atomique équivalent afin d'empêcher deux sorties simultanées de dépasser le stock.
- Politiques RLS ou autorisations serveur équivalentes sur chaque table exposée.
- Tests automatiques d'accès croisé, y compris accès par identifiant direct et requête API.

## 7. Points non décidés

- Infrastructure backend : Supabase a été choisi pour le prototype de développement. Le propriétaire a créé le projet dédié `KS-BTP-DEV` dans l'organisation `Service KS BTP`, sur l'offre Free. Aucun projet antérieur n'a été suspendu ou modifié et aucun service payant n'a été activé.
- La connexion Supabase actuellement disponible dans les outils n'a pas encore les droits sur ce nouveau projet ; aucune opération distante ne doit être tentée sur les autres projets visibles.
- Fournisseur d'authentification : à choisir avec le backend.
- Règles définitives de sortie/réception : validation métier nécessaire.
- Politique de conservation et suppression des données clients : à définir avant commercialisation.

**Ce document décrit une cible technique. Il ne crée aucune table et n'active aucune authentification ou synchronisation.**
