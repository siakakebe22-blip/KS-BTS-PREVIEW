# KS BTP — Matrice des rôles et permissions

**Phase :** conception — accès multi-entreprises  
**Branche :** `phase-1-architecture-multientreprises`  
**Statut :** proposition à valider avant implémentation.

## 1. Principes

- Un utilisateur agit dans le contexte d'une entreprise à la fois.
- Un utilisateur peut être membre de plusieurs entreprises avec un rôle différent dans chacune.
- Les permissions sont contrôlées côté serveur pour chaque requête.
- Le rôle ne donne jamais accès aux données d'une autre entreprise.
- Les boutons masqués dans l'interface ne constituent pas une protection.
- Les opérations sensibles et changements de rôle sont journalisés.
- Les droits peuvent être affinés par chantier (par exemple, un responsable limité à ses propres chantiers).

## 2. Rôles proposés

| Fonction | Admin entreprise | Gestionnaire | Magasinier | Responsable chantier | Comptable / lecteur |
|---|---:|---:|---:|---:|---:|
| Voir tableau de bord | Oui | Oui | Oui | Limité | Oui |
| Consulter matériels | Oui | Oui | Oui | Limité | Oui |
| Créer / modifier fiche matériel | Oui | Oui | Selon délégation | Non | Non |
| Supprimer fiche matériel | Oui, si non référencée | Selon délégation | Non | Non | Non |
| Consulter chantiers | Oui | Oui | Oui | Ses chantiers | Oui |
| Créer / modifier chantier | Oui | Oui | Non | Non | Non |
| Entrées et réceptions de stock | Oui | Oui | Oui | Selon délégation | Non |
| Transfert magasin vers chantier | Oui | Oui | Oui | Demande ou validation selon règle | Non |
| Bon de sortie / consommation | Oui | Oui | Selon délégation | Demande ou validation selon règle | Non |
| Bon de retour | Oui | Oui | Oui | Demande ou validation selon règle | Non |
| Ajustement d'inventaire | Oui, avec motif | Oui, avec motif | Non ou délégation | Non | Non |
| Maintenance | Oui | Oui | Déclaration / suivi | Déclaration sur ses chantiers | Consultation |
| Achats et fournisseurs | Oui | Oui | Consultation limitée | Non | Consultation / rapports |
| Rapports de stock | Oui | Oui | Opérationnels | Ses chantiers | Oui |
| Rapports financiers d'achat | Oui | Oui | Non | Non | Oui |
| Journal d'activité | Oui | Oui, périmètre | Ses actions / opérations | Ses chantiers | Lecture |
| Gérer les membres et rôles | Oui | Non | Non | Non | Non |
| Modifier paramètres entreprise | Oui | Non | Non | Non | Non |
| Exporter les données de l'entreprise | Oui | Selon délégation | Non | Ses données autorisées | Rapports autorisés |

**Note :** la matrice est une proposition de départ. Les actions « demande », « validation » et « délégation » devront être précisées dans les processus réels avant développement.

## 3. Administrateur de plateforme

L'administrateur de plateforme gère le fonctionnement global : création d'entreprises, assistance, état des licences et sécurité. Il ne doit pas disposer automatiquement d'un accès permanent au contenu métier de toutes les entreprises. Tout accès exceptionnel de support devra être limité, justifié, autorisé et journalisé.

## 4. Permissions atomiques proposées

Les rôles seront assemblés à partir de permissions explicites, par exemple :
- `materials.read`, `materials.create`, `materials.update`, `materials.archive`
- `sites.read`, `sites.create`, `sites.update`, `sites.archive`
- `stock.receive`, `stock.transfer`, `stock.consume`, `stock.return`, `stock.adjust`
- `documents.read`, `documents.create`, `documents.validate`, `documents.cancel`
- `maintenance.read`, `maintenance.create`, `maintenance.update`
- `purchases.read`, `purchases.create`, `purchases.update`
- `reports.read`, `reports.export`
- `members.read`, `members.invite`, `members.update_role`, `members.revoke`
- `company.settings.update`, `company.data.export`

Les permissions de lecture, création, validation, annulation et export sont séparées. Une personne autorisée à créer un bon ne peut pas nécessairement le valider ou l'annuler.

## 5. Tests d'autorisation obligatoires

Pour chaque rôle, vérifier :
1. accès autorisé à ses ressources et à son entreprise ;
2. refus d'accès à un identifiant appartenant à une autre entreprise ;
3. refus d'une écriture en changeant manuellement `company_id` ;
4. refus de relier un matériel d'une autre entreprise à un bon ;
5. refus d'effectuer une opération non accordée par son rôle ;
6. révocation effective d'un membre et de ses sessions ;
7. accès limité aux chantiers assignés si cette restriction est activée ;
8. journalisation des validations, annulations, exports et changements de droits.

## 6. Questions de validation métier

Avant d'implémenter les rôles :
- Le responsable chantier peut-il créer directement un bon ou doit-il soumettre une demande au magasinier ?
- Le magasinier peut-il valider seul une réception fournisseur ou faut-il une approbation du gestionnaire ?
- Qui peut effectuer un ajustement d'inventaire et qui doit l'approuver ?
- Le comptable doit-il voir les coûts de maintenance et les prix d'achat, ou seulement les rapports de stock ?
- L'administrateur entreprise peut-il exporter toutes les données et inviter des utilisateurs sans approbation supplémentaire ?

Aucun rôle réel n'est activé dans cette étape de conception.
