# Plan de réalisation technique et critères de validation — KS BTP

**Statut :** document de préparation — aucune modification de l'application active.  
**Branche de travail :** `phase-1-architecture-multientreprises`  
**Périmètre :** transformation progressive du prototype KS BTP en logiciel commercial multi-entreprises.

## 1. Objectif

Mettre en place une plateforme où plusieurs entreprises clientes utilisent le même produit sans jamais accéder aux données des autres. La solution doit fonctionner sur téléphone et ordinateur, tolérer les périodes hors connexion et synchroniser les opérations sans doublons ni perte de mouvements de stock.

Le prototype local actuel ne constitue pas encore une plateforme multi-entreprises sécurisée. Les comptes, rôles et abonnements décrits ici sont des éléments cibles, pas des fonctions déjà actives.

## 2. Contraintes non négociables

1. **Aucune perte de données :** sauvegarde vérifiée avant toute migration ; aucune remise à zéro, suppression ou écrasement implicite.
2. **Aucune exposition inter-entreprises :** l'identifiant d'entreprise est contrôlé côté serveur et en base, jamais seulement dans l'interface.
3. **Aucune fausse sécurité :** pas de comptes ou de permissions simulés présentés comme une authentification réelle.
4. **Aucun coût sans accord :** pas de mise à niveau payante, service payant ou engagement financier sans autorisation explicite.
5. **Aucun changement en production sans accord :** développement, essais et démonstrations sur la branche et l'environnement de prévisualisation.
6. **Compatibilité métier :** conserver les calculs, documents, mouvements, maintenance, rapports et règles existantes.
7. **Traçabilité :** toute opération de stock validée doit être identifiable, datée et attribuée à un utilisateur et à une entreprise.

## 3. Phases et portes de validation

### Phase A — Décisions et choix d'infrastructure

- Comparer les solutions backend réellement disponibles selon le coût, l'authentification, les règles d'accès par entreprise, les sauvegardes, les limites gratuites, la disponibilité régionale et la portabilité.
- Vérifier les conditions et quotas au moment du choix ; ne pas déduire qu'une offre est gratuite ou illimitée.
- Ne pas suspendre de projet existant et ne pas modifier le forfait du compte.
- Présenter une comparaison et obtenir l'accord avant de créer ou configurer une infrastructure.
- Définir les environnements séparés : développement, prévisualisation et production.

**Porte A :** aucun backend n'est activé tant que la solution, ses coûts éventuels et ses limites ne sont pas acceptés.

### Phase B — Fondations d'identité et d'entreprise

- Créer l'entité entreprise et son état (création, actif, suspendu, clôturé).
- Mettre en place les profils, adhésions et rôles réels.
- Prévoir l'invitation, l'acceptation, la révocation et le départ d'un membre.
- Définir le propriétaire initial de l'entreprise et la procédure de récupération d'accès.
- Isoler les fonctions d'administration de la plateforme de celles d'administration d'une entreprise.
- Refuser par défaut tout accès sans adhésion active et permission explicite.

**Porte B :** tests d'authentification et d'isolation réussis avant de connecter les données métier.

### Phase C — Données métier et règles de stock

- Ajouter `company_id` à chaque enregistrement métier appartenant à une entreprise.
- Appliquer les contraintes d'accès au niveau de la base et du serveur.
- Rendre les références uniques dans leur entreprise, pas seulement globalement.
- Enregistrer chaque mouvement de stock comme une opération traçable.
- Appliquer les changements de stock de manière atomique côté serveur.
- Refuser les quantités négatives, les quantités non finies et les opérations incohérentes.
- Conserver la distinction métier :
  - le mouvement autonome « sortie » transfère le stock du magasin central vers un chantier ;
  - le bon de sortie est une consommation sur chantier et débite le stock du chantier.
- Ne pas corriger automatiquement les écarts d'inventaire : l'audit signale, un utilisateur autorisé examine et décide.

**Porte C :** les tests de calcul et de séparation des données réussissent sur des entreprises de test distinctes.

### Phase D — Migration prudente des données KS existantes

1. Inventorier les collections et versions de données réellement présentes.
2. Produire une sauvegarde exportable.
3. Vérifier que la sauvegarde est lisible et restaurable dans un environnement isolé.
4. Préparer une migration idempotente : la relancer ne doit pas créer de doublons.
5. Associer les données historiques à l'entreprise KS uniquement après validation de l'identité et de la sauvegarde.
6. Comparer les nombres d'enregistrements, références, soldes par emplacement et totaux par unité avant/après.
7. Garder un mécanisme de retour arrière documenté.
8. Faire valider le résultat avant toute bascule d'utilisation.

**Porte D :** aucune migration réelle sans sauvegarde vérifiée, comparaison des données et autorisation explicite.

### Phase E — Mode hors connexion et synchronisation

- Stocker localement une file d'opérations avec un identifiant unique généré sur l'appareil.
- Envoyer les opérations avec une clé d'idempotence : une même opération rejouée ne doit être appliquée qu'une fois.
- Conserver l'entreprise, l'utilisateur, l'appareil et l'heure d'origine sur chaque opération.
- Distinguer l'heure de création locale de l'heure de réception serveur.
- Ne pas utiliser une simple règle « dernière écriture gagnante » pour les mouvements de stock.
- Détecter les conflits, mettre en attente les opérations ambiguës et demander une résolution explicite.
- Afficher clairement l'état : local non synchronisé, en attente, synchronisé ou en erreur.
- Ne jamais effacer la file locale tant que la confirmation serveur n'est pas reçue et vérifiée.

**Porte E :** essais de coupure réseau, reprise, répétition d'envoi et conflit réussis sans doublon ni perte.

### Phase F — Exploitation commerciale

- Créer un parcours d'inscription d'entreprise et de configuration initiale.
- Définir les plans, quotas, dates d'essai, renouvellement et suspension avec règles explicites.
- Une suspension commerciale ne doit jamais supprimer les données du client.
- Prévoir export et sauvegarde des données par entreprise.
- Prévoir une procédure de fermeture et de restitution des données.
- Ajouter un journal d'administration et des alertes d'incident.
- Préparer documentation, assistance et procédure de mise à jour.

**Porte F :** parcours client, facturation éventuelle, export et support validés avant ouverture commerciale.

## 4. Batterie minimale de tests

### Isolation des entreprises

- Un utilisateur de l'entreprise A ne peut pas lire, modifier, supprimer ou exporter les données de B.
- Changer manuellement un identifiant d'entreprise dans une requête ne donne aucun accès.
- Un identifiant de chantier, matériel, mouvement ou document appartenant à B est refusé dans une opération de A.
- Les recherches, tableaux de bord, rapports, exports, fichiers et sauvegardes sont filtrés par entreprise.
- Un membre révoqué perd immédiatement l'accès aux données serveur.
- Un utilisateur ne peut pas s'attribuer un rôle supérieur en modifiant une requête.

### Stock et documents

- Une réception augmente le stock de l'emplacement concerné.
- Un transfert central → chantier diminue le central et augmente le chantier.
- Un bon de sortie débite le stock du chantier selon la règle de consommation.
- Un retour débite le chantier et crédite le central.
- Une consommation autonome débite le chantier.
- Une opération invalide ou en double ne modifie pas les soldes.
- Les totaux restent séparés par unité et par emplacement.
- L'audit détecte les incohérences sans modifier les soldes.

### Synchronisation et résilience

- Rejouer dix fois la même opération n'applique qu'une seule transaction.
- Une coupure pendant l'envoi ne perd pas l'opération locale.
- Une réponse serveur perdue ne crée pas un doublon au nouvel essai.
- Deux opérations concurrentes sur le même stock sont traitées de manière atomique.
- Un conflit est signalé et conservé pour résolution ; il n'est pas écrasé silencieusement.
- Une mise à jour de l'application ne détruit pas les données locales existantes.

### Sauvegarde et restauration

- Une sauvegarde contient les données de la bonne entreprise et exclut celles des autres.
- Une sauvegarde peut être vérifiée et restaurée dans un environnement de test.
- Une restauration invalide est rejetée sans écraser les données présentes.
- Toute migration conserve un rapport de comparaison et une procédure de retour arrière.

## 5. Scénarios de recette multi-entreprises

Créer deux entreprises fictives A et B avec des utilisateurs et des données volontairement distincts. Les tests doivent couvrir au minimum :

- A : un dépôt central, deux chantiers, plusieurs matériaux, réceptions, transferts, consommations, retours et maintenance.
- B : un dépôt central, un chantier, des matériaux et des documents différents.
- Un utilisateur multi-entreprises avec adhésions distinctes et sélection explicite de l'entreprise active.
- Un utilisateur révoqué, un compte sans permission et un administrateur d'entreprise.
- Des rapports, exports et sauvegardes générés séparément.

Aucun vrai client ni donnée personnelle ne doit être utilisé dans les tests initiaux.

## 6. Décisions métier encore ouvertes

Ces décisions doivent être confirmées avant de figer les permissions :

1. **Responsable de chantier :** peut-il créer directement un bon de sortie (consommation), ou doit-il demander au magasinier de le préparer ?
2. Qui valide les réceptions fournisseurs ?
3. Qui peut effectuer un ajustement d'inventaire après contrôle ?
4. Le comptable peut-il consulter les coûts d'achat et de maintenance ?
5. Qui peut inviter des membres et exporter les données de l'entreprise ?
6. Une entreprise peut-elle avoir plusieurs administrateurs ?

Tant qu'une décision n'est pas confirmée, la permission correspondante reste non activée dans la conception.

## 7. État réel à ce jour

- Prototype KS BTP : application locale avec fonctionnalités métier existantes.
- Architecture cible : documentée dans `ARCHITECTURE-MULTI-ENTREPRISES.md`.
- Modèle de données cible : documenté dans `MODELE-DONNEES-MULTI-ENTREPRISES.md`.
- Matrice des rôles : documentée dans `MATRICE-ROLES-PERMISSIONS.md`.
- Ce plan de réalisation : document de préparation.
- Authentification multi-entreprises réelle : **non activée**.
- Base de données multi-entreprises : **non déployée**.
- Synchronisation multi-appareils sécurisée : **non activée**.
- Migration des données KS : **non exécutée**.
- Abonnements et facturation : **non activés**.

## 8. Prochaine action autorisée

La prochaine action sûre est de comparer les options d'infrastructure et leurs coûts/limites actuels, puis de présenter une recommandation. Aucune création de projet, modification de forfait, migration de données ou mise en production ne doit être effectuée sans accord explicite.
