# Conception — Gestion des entreprises et abonnements KS BTP

**Statut :** conception uniquement — aucune modification Supabase ni activation de paiement.
**Branche de travail :** phase-3-selection-entreprise-cloud

## 1. Décision produit

KS BTP devient une application SaaS multi-entreprises. Chaque entreprise cliente dispose d'un espace isolé. Elle paie un abonnement pour accéder au service ; ses employés autorisés ne paient pas individuellement.

L'administrateur général KS BTP gère les entreprises clientes, les offres, les périodes d'essai, les abonnements et le suivi des paiements. Il ne doit pas pouvoir consulter les stocks et mouvements métier d'une entreprise sans autorisation explicite et traçable.

## 2. Acteurs et responsabilités

| Acteur | Responsabilités |
|---|---|
| Administrateur général KS BTP | Créer/activer/désactiver une entreprise, gérer les offres et abonnements, consulter l'état des paiements et l'historique administratif |
| Propriétaire / directeur de l'entreprise | Gérer son entreprise, inviter les membres, attribuer les rôles, consulter les données métier de son entreprise |
| Magasinier | Gérer le matériel et les mouvements autorisés |
| Chef de chantier | Consulter et suivre les ressources des chantiers qui lui sont affectés |

L'administrateur général et les rôles d'une entreprise sont des périmètres distincts. Un compte ne reçoit aucun privilège métier dans une entreprise par simple accès à la console générale.

## 3. Modules à concevoir

1. **Répertoire des entreprises** : identité, nom commercial, contact, adresse, propriétaire, statut et date de création.
2. **Catalogue des offres** : nom, prix, devise, périodicité, limites et fonctionnalités incluses.
3. **Abonnements** : entreprise, offre, début, fin de période, essai, renouvellement, statut et éventuelle période de grâce.
4. **Paiements** : montant, devise, moyen, référence, date, statut, justificatif et agent ayant validé. Un paiement déclaré n'est pas considéré payé avant vérification.
5. **Journal administratif** : acteur, action, entreprise concernée, date et détails minimaux nécessaires à l'audit.
6. **Contrôle d'accès** : état de l'abonnement vérifié côté serveur ; ne jamais se fier uniquement à un bouton masqué dans l'interface.

## 4. États proposés

- Entreprise : en_attente, active, suspendue, fermee.
- Abonnement : essai, actif, en_retard, en_grace, suspendu, resilie, expire.
- Paiement : en_attente, confirme, rejete, rembourse.

Les transitions doivent être contrôlées côté serveur et historisées. Une résiliation ou suspension ne supprime jamais les données de l'entreprise.

## 5. Règles commerciales à confirmer

- Devise d'affichage et de facturation par défaut : GNF.
- Périodicités possibles : mensuelle et annuelle.
- Période d'essai : durée à décider.
- Tarifs : les montants de 100 000, 250 000 et 500 000 GNF/mois évoqués sont des hypothèses de travail, pas des prix validés.
- Limites des offres : nombre d'utilisateurs, chantiers, stockage et fonctions à définir.
- Moyens de paiement : à sélectionner après vérification de leur disponibilité et des conditions locales. Ne pas intégrer de fausse confirmation automatique.
- Politique en cas d'impayé : délai de grâce à définir ; accès en lecture seule ou suspension à décider.
- Factures et reçus : numérotation, mentions et règles comptables à valider.

## 6. Sécurité et isolation des données

- Toute donnée métier doit rester liée à un company_id.
- Les droits doivent être vérifiés par RLS et, pour les opérations sensibles, par des fonctions serveur sûres.
- L'administrateur général ne reçoit pas automatiquement accès aux données de stock, chantiers ou mouvements.
- Les abonnements et paiements ne peuvent être modifiés que par des rôles administratifs autorisés.
- Les identifiants de paiement et références doivent être uniques lorsque nécessaire et les opérations de confirmation idempotentes.
- Les changements de statut, validations de paiement et suspensions sont journalisés.
- Aucun secret, clé service_role ou mot de passe de base ne doit être placé dans le code client.
- Les anciennes politiques RLS permissives doivent être auditées et remplacées correctement : ajouter une politique restrictive à côté d'une politique permissive ne suffit pas, car les politiques permissives se combinent avec OR.
- Prévoir des tests multi-comptes : entreprise A ne lit ni ne modifie aucune donnée de B ; un membre ne peut pas s'ajouter lui-même à une entreprise ; un abonnement expiré ne permet pas d'opérations métier payantes.

## 7. Écrans prévus

- Console générale : tableau de bord, entreprises, offres, abonnements, paiements, journal.
- Espace entreprise : profil, abonnement courant, échéance, factures/reçus, membres.
- Écran de paiement : instructions, référence et dépôt de justificatif, puis validation administrative.
- Écran d'accès restreint : motif, échéance et instructions de régularisation, sans effacer les données.

## 8. Ordre de réalisation sans risque

1. Valider les règles commerciales et les rôles.
2. Créer les maquettes et données fictives dans la prévisualisation GitHub.
3. Écrire le modèle de données et les migrations en brouillon, sans les appliquer.
4. Faire un audit en lecture seule du schéma, des fonctions et de toutes les politiques RLS existantes.
5. Préparer un environnement de test isolé. La branche Supabase est facultative et payante au tarif communiqué ; aucune branche ne sera créée sans accord distinct.
6. Tester les scénarios multi-entreprises, les paiements fictifs, les impayés et les abonnements expirés.
7. Demander une validation explicite avant toute écriture Supabase, migration, activation de paiement ou mise en production.

## 9. Critères d'acceptation

- Deux entreprises de test ne voient jamais les données l'une de l'autre.
- Un directeur ne peut administrer que sa propre entreprise.
- L'administrateur général gère les abonnements sans accès métier implicite.
- Un paiement en attente ne débloque pas un abonnement actif.
- Une suspension ne supprime ni ne réinitialise aucune donnée.
- Chaque changement administratif sensible laisse une trace.
- Les essais et tests utilisent exclusivement des données fictives.

**Prochaine tâche technique :** réaliser les maquettes de la console générale et de l'espace abonnement dans la prévisualisation, sans connecter de nouveau flux de paiement ni modifier Supabase.
