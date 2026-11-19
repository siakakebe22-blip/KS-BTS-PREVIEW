# KS BTP — Architecture cible multi-entreprises

**Statut :** document de conception — phase 1  
**Branche :** `phase-1-architecture-multientreprises`  
**Application actuelle :** prototype local hors connexion  
**Production :** aucune modification autorisée dans le cadre de cette phase.

## 1. Vision produit

KS BTP doit devenir un logiciel professionnel de gestion des matériels et opérations de chantier, commercialisable auprès de plusieurs entreprises du BTP en Guinée et à l'international.

Chaque entreprise cliente doit disposer de son propre espace, de ses propres utilisateurs, matériels, chantiers, mouvements, documents, paramètres, rapports et sauvegardes. Aucune donnée d'une entreprise ne doit être visible ou modifiable par une autre.

Le produit devra fonctionner sur Android, iPhone et ordinateur, avec une expérience en ligne et hors connexion et une synchronisation contrôlée.

## 2. État constaté du prototype

L'examen du code de la branche principale de prévisualisation montre notamment :
- un stockage métier principal dans le navigateur sous la clé `ks_btp_v1` ;
- une copie de sécurité locale IndexedDB ;
- une configuration d'entreprise unique initialisée avec `KS BTP` ;
- des collections locales : matériels, chantiers, mouvements, maintenance, documents, achats et journal d'activité ;
- des profils utilisateurs en mémoire dans l'application, sans authentification serveur démontrée ;
- aucune isolation multi-entreprises garantie par un serveur.

**Conséquence :** ajouter simplement un champ `companyId` dans l'interface ne suffirait pas à sécuriser le produit. La séparation doit être imposée côté serveur et vérifiée par des politiques d'accès.

## 3. Architecture fonctionnelle cible

### Niveau plateforme
- Administrateur de la plateforme KS BTP.
- Gestion des entreprises clientes et de leur état (essai, actif, suspendu, clôturé).
- Gestion future des offres, licences et abonnements.
- Journal technique et assistance, sans accès libre aux données métier des clients.

### Niveau entreprise
- Profil et paramètres de l'entreprise.
- Administrateur de l'entreprise.
- Membres, invitations et rôles.
- Magasin central, matériels, chantiers, mouvements, bons, achats, maintenance, rapports et historique.
- Paramètres propres à l'entreprise : devise, unités, seuils, identité documentaire.

### Rôles initiaux à valider
- Administrateur plateforme : administration globale strictement contrôlée.
- Administrateur entreprise : configuration et gestion des membres de sa société.
- Gestionnaire : supervision des stocks et opérations.
- Magasinier : entrées, sorties, retours et inventaire autorisés.
- Responsable chantier : consultation et opérations autorisées sur ses chantiers.
- Comptable / lecteur : consultation et rapports selon permissions.

Les permissions devront être explicites, vérifiées côté serveur et limitées au périmètre de l'entreprise. La liste finale des rôles reste configurable après validation métier.

## 4. Principes de données multi-tenant

Chaque enregistrement métier appartenant à une société doit porter un identifiant d'entreprise obligatoire (`company_id`). Les relations doivent empêcher de rattacher par erreur un matériel, un mouvement ou un document d'une société à un chantier d'une autre société.

Entités de référence envisagées :
- `companies` : entreprises clientes ;
- `users` : identités authentifiées ;
- `company_memberships` : appartenance d'un utilisateur à une entreprise et rôle ;
- `sites` : chantiers ;
- `materials` : matériels et consommables ;
- `stock_balances` : quantités par matériel et emplacement ;
- `stock_movements` : événements d'entrée, sortie, retour et consommation ;
- `stock_documents` : bons de réception, sortie et retour ;
- `purchases` : achats et justificatifs ;
- `maintenance_records` : interventions ;
- `activity_logs` : historique des actions ;
- `devices` et `sync_operations` : appareils et opérations de synchronisation ;
- `plans` / `subscriptions` : licences et abonnements, dans une phase ultérieure.

Les clés étrangères composites ou contraintes équivalentes devront garantir la cohérence du `company_id` entre les entités liées.

## 5. Sécurité obligatoire

1. Authentification réelle : aucun compte ou rôle ne doit être simulé uniquement dans le navigateur.
2. Autorisation côté serveur pour chaque lecture et écriture.
3. Isolation stricte par entreprise au moyen de politiques de sécurité au niveau des lignes (RLS) ou d'un mécanisme serveur équivalent.
4. Le `company_id` autorisé doit provenir de l'identité et de l'appartenance vérifiées, jamais d'une valeur librement fournie par le client.
5. Les clés secrètes et clés de service ne doivent jamais être intégrées au code livré au navigateur.
6. Tests négatifs obligatoires : un utilisateur de la société A ne doit ni lire, ni modifier, ni supprimer les données de la société B, même en modifiant manuellement les identifiants ou les requêtes.
7. Les actions sensibles doivent être tracées avec l'auteur, l'entreprise, la date, l'action et l'objet concerné.

## 6. Fonctionnement hors connexion et synchronisation

Le stockage local reste une copie de travail propre à l'entreprise et à l'appareil. Il ne constitue pas une autorité d'identité ni une barrière de sécurité multi-tenant.

Chaque opération hors connexion devra prévoir :
- un identifiant unique généré sur l'appareil ;
- l'identifiant de l'entreprise et de l'utilisateur authentifiés, vérifiés lors de la synchronisation ;
- une date de création et une date de synchronisation ;
- une clé d'idempotence pour empêcher les doublons après une nouvelle tentative ;
- un état local : en attente, synchronisé ou en erreur ;
- une stratégie explicite de résolution des conflits.

Les mouvements de stock devront être traités comme des événements traçables et non comme de simples remplacements silencieux de quantité. Le serveur devra valider les soldes et refuser les opérations incohérentes. Une synchronisation échouée ne doit jamais effacer la file locale ni déclarer une opération synchronisée à tort.

## 7. Migration des données historiques KS

La société KS BTP deviendra le premier espace entreprise, mais uniquement après une migration contrôlée.

Séquence obligatoire :
1. Identifier précisément toutes les sources locales historiques et leurs versions.
2. Demander à l'utilisateur une sauvegarde exportée depuis son appareil ; le développeur ne peut pas lire directement son stockage local.
3. Conserver une copie originale vérifiée et indépendante.
4. Valider le format, les références, les relations, les quantités et les doublons potentiels.
5. Effectuer une simulation sans écriture (dry run) et produire un rapport de différences.
6. Associer les anciens enregistrements à l'entreprise KS BTP sans modifier leur contenu métier.
7. Importer dans une transaction contrôlée, avec journal de migration et mécanisme de reprise.
8. Comparer les nombres d'enregistrements, références, totaux et soldes avant/après.
9. Ne basculer qu'après validation explicite et tests concluants.

Aucune migration ne doit réinitialiser `ks_btp_v1`, supprimer IndexedDB, remplacer les sauvegardes locales ou modifier la production.

## 8. Étapes de réalisation

### Phase 1 — Conception et inventaire
- Documenter le modèle de données actuel.
- Définir les entités multi-entreprises et leurs relations.
- Définir les rôles et permissions.
- Définir les scénarios de migration et les tests de sécurité.

### Phase 2 — Socle serveur
- Choisir et provisionner une infrastructure après décision et autorisation de l'utilisateur.
- Mettre en place authentification, entreprises, membres et politiques d'isolation.
- Tester l'étanchéité entre deux entreprises de démonstration.

### Phase 3 — Données métier
- Migrer progressivement les modules matériels, chantiers, mouvements, bons, achats et maintenance.
- Vérifier les calculs de stock et l'historique.

### Phase 4 — Synchronisation
- File d'attente hors connexion, idempotence, reprise et gestion des conflits.
- Tests de perte réseau, répétition des requêtes et utilisation multi-appareils.

### Phase 5 — Commercialisation
- Onboarding des entreprises.
- Gestion des licences et abonnements.
- Sauvegarde et restauration par entreprise.
- Documentation, assistance, conditions d'utilisation et tests de charge.

## 9. Contraintes de projet actuelles

- Le dépôt de prévisualisation est l'unique zone de travail.
- Le dépôt et le site de production restent intouchés sans autorisation explicite.
- Aucun projet Supabase existant ne doit être suspendu ou modifié.
- Aucun abonnement ou service payant ne doit être activé sans accord explicite.
- La création du projet Supabase dédié KS BTP est actuellement bloquée par la limite de projets gratuits de l'organisation ; aucune infrastructure distante n'est donc présumée disponible.
- Tant que l'infrastructure n'est pas autorisée et disponible, les travaux restent limités à la conception, à l'audit et aux préparatifs non destructifs.

## 10. Critères d'acceptation avant toute mise en service

- Deux entreprises de test ont des données totalement séparées.
- Les tests d'accès croisé échouent correctement.
- Les rôles ne peuvent exécuter que les actions autorisées.
- Les mouvements et bons conservent une traçabilité complète.
- Les calculs de stock sont cohérents après synchronisation.
- Les opérations répétées ne créent aucun doublon.
- Une panne réseau ne perd aucune opération locale.
- Une sauvegarde peut être restaurée et vérifiée.
- La migration KS est comparée avant/après et approuvée.
- La production n'est modifiée qu'après autorisation explicite.

---
Ce document est une base de conception. Il ne signifie pas que l'authentification, la base distante ou la synchronisation multi-entreprises sont déjà opérationnelles.
