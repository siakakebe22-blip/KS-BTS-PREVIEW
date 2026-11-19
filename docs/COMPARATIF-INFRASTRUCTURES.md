# Comparatif des infrastructures — KS BTP

**Date de vérification :** 19 novembre 2026  
**Statut :** étude documentaire uniquement ; aucun compte, projet ou service créé.  
**Contrainte du propriétaire :** aucun paiement, aucune suspension/suppression d'un projet existant et aucune modification de forfait sans accord explicite.

## 1. Critères de choix

KS BTP doit être un logiciel commercial multi-entreprises avec données isolées, authentification réelle, rôles, transactions de stock atomiques, API serveur, mode hors connexion, sauvegardes et export. La gratuité est une contrainte de démarrage, mais ne doit pas être confondue avec une garantie de disponibilité ou de sécurité de production.

## 2. Résumé comparatif

| Solution | Atouts vérifiés | Limites / risques | Avis pour KS BTP |
|---|---|---|---|
| **Neon (PostgreSQL + Better Auth géré + Functions)** | Offre gratuite annoncée : 100 projets, 1 Go de stockage par projet, 100 CU-heures par projet/mois, 10 branches, fenêtre de restauration instantanée de 6 h ; Better Auth géré annoncé jusqu'à 60 000 utilisateurs actifs mensuels ; stockage objet et fonctions inclus avec quotas. | Le calcul gratuit s'arrête à l'épuisement des quotas ; restauration instantanée de 6 h n'est pas un système de sauvegarde longue durée ; limites de transfert et d'exécution ; vérifier disponibilité régionale, conditions, sécurité et fonctions exactes avant de s'engager. | **Meilleur candidat à un prototype technique contrôlé**, sous réserve d'une validation détaillée et de tests. Pas encore approuvé pour production commerciale. |
| **Supabase Free** | PostgreSQL, Auth, Storage, API et fonctions dans une plateforme intégrée ; quotas gratuits documentés. | Limite de deux projets gratuits actifs au total pour les propriétaires/administrateurs concernés ; projets gratuits mis en pause après une semaine d'inactivité ; pas de sauvegardes automatiques dans le Free. Le quota actuel de l'utilisateur est déjà atteint. | Très bon ajustement technique, mais **non disponible dans la configuration actuelle** sans modifier les projets ou payer — options refusées par le propriétaire. |
| **Firebase Spark** | Authentification courante sans frais ; Firestore avec quotas gratuits documentés ; pas de carte bancaire requise pour le niveau Spark. | Base NoSQL plutôt que PostgreSQL ; les Cloud Functions ne sont pas disponibles sur Spark ; quotas dépassés entraînent l'arrêt du service concerné jusqu'au prochain cycle ou changement de forfait ; logique transactionnelle et reporting relationnel nécessiteraient une conception différente. | Possible techniquement, mais moins naturel pour le modèle relationnel, les rapports et les transactions de stock de KS BTP. Non recommandé comme premier choix. |
| **Cloudflare Workers + D1** | Workers Free documente 100 000 requêtes/jour et D1 propose un quota gratuit de prototypage ; API serveur possible. | D1 est SQLite distribué, pas PostgreSQL ; limites quotidiennes qui peuvent bloquer les requêtes une fois atteintes ; il faut assembler séparément identité, rôles, stockage de fichiers, sauvegardes et logique métier. | Option légère à étudier, mais demande davantage de composants et de tests pour garantir l'isolation multi-entreprises. |
| **PocketBase auto-hébergé** | Open source, authentification intégrée, API, temps réel et base SQLite ; sauvegarde/restauration intégrées. | Nécessite un serveur hébergé et entretenu ; le projet indique lui-même qu'il n'est pas recommandé pour des applications critiques en production avant la version 1.0, sauf acceptation de migrations manuelles et changements. | Pratique pour démonstration locale, **pas recommandé pour les données commerciales critiques** de KS BTP à ce stade. |
| **Supabase auto-hébergé** | Possibilité d'utiliser la pile Supabase sur une infrastructure contrôlée. | Ce n'est pas réellement gratuit en production : serveur, stockage, sauvegardes, disponibilité, mises à jour et sécurité restent à financer et administrer. | À réexaminer si un budget d'hébergement et une personne responsable de l'exploitation sont disponibles. |

## 3. Vérification des points clés

### Neon

Les informations publiées le 2 octobre 2026 indiquent pour l'offre gratuite : 1 Go de stockage PostgreSQL par projet, 100 CU-heures par mois et par projet, jusqu'à 2 CU en autoscaling, 10 branches, une fenêtre de restauration instantanée de 6 heures, Better Auth géré jusqu'à 60 000 utilisateurs actifs mensuels, 5 Go de stockage objet et 1 million d'invocations de fonctions avec limites de capacité. Ces plafonds sont des quotas, pas une promesse de disponibilité. Source : https://neon.com/blog/neon-free-plan-1-gb-per-project

La documentation de quotas doit être relue au moment de la création, car les limites commerciales peuvent évoluer : https://neon.com/docs/introduction/plans

### Supabase

La documentation de facturation indique deux projets gratuits actifs au total pour les utilisateurs propriétaires/administrateurs concernés, y compris entre organisations. Les projets gratuits peuvent être mis en pause après une semaine d'inactivité et le plan gratuit ne comprend pas de sauvegardes automatiques. Sources :
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/pricing

### Firebase

Le plan Spark ne demande pas de moyen de paiement pour commencer. Firestore a des quotas quotidiens gratuits ; si un quota est dépassé, le service concerné est bloqué pour le reste du cycle. Cloud Functions n'est pas disponible sur Spark. Sources :
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- https://firebase.google.com/pricing

### Cloudflare

La documentation Workers indique 100 000 requêtes quotidiennes sur le plan gratuit. La FAQ D1 confirme que le quota gratuit est destiné au prototypage et que les limites quotidiennes atteintes bloquent les requêtes jusqu'au prochain cycle ou à une mise à niveau. Sources :
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/reference/faq/

### PocketBase

La documentation officielle décrit PocketBase comme un backend open source basé sur SQLite avec authentification et API, mais précise qu'il n'est pas recommandé pour des applications critiques de production avant la version 1.0, sauf à accepter des migrations manuelles et le suivi des changements. Sources :
- https://pocketbase.io/docs/
- https://pocketbase.io/docs/going-to-production/

## 4. Recommandation provisoire

**Étudier Neon en premier pour un prototype multi-entreprises non sensible**, car l'offre actuelle rassemble PostgreSQL, authentification gérée, fonctions serveur et stockage objet dans un même environnement et permet de concevoir un schéma relationnel adapté aux stocks, chantiers, bons et mouvements.

Cette recommandation n'est pas une validation de production. Avant toute utilisation avec de vrais clients, il faudra vérifier :
1. l'emplacement des données et la latence depuis la Guinée ;
2. les conditions de disponibilité et le support ;
3. les sauvegardes indépendantes et les tests de restauration, au-delà de la fenêtre de restauration instantanée ;
4. l'isolation par entreprise dans PostgreSQL, avec politiques de sécurité et tests d'accès négatifs ;
5. la gestion des secrets, des sessions, de la récupération de compte et des révocations ;
6. les quotas, alertes et comportement lorsque les limites gratuites sont atteintes ;
7. la possibilité de migrer les données vers une autre infrastructure sans dépendance bloquante.

Architecture cible à tester : **un projet backend KS BTP partagé, une base PostgreSQL avec cloisonnement strict par `company_id`, authentification gérée, et API serveur contrôlant chaque opération**. La séparation ne doit jamais reposer sur un filtre d'interface. La possibilité de créer ultérieurement des bases séparées pour de gros clients devra rester ouverte.

## 5. Ce que nous ne ferons pas

- Ne pas créer un compte ou projet sans accord explicite.
- Ne pas déplacer ni suspendre un projet Supabase existant.
- Ne pas activer de facturation, d'essai payant ou de carte bancaire.
- Ne pas stocker de vraies données d'entreprise dans un prototype gratuit avant les contrôles de sécurité.
- Ne pas présenter une offre gratuite comme suffisante pour garantir une exploitation commerciale durable.
- Ne pas modifier la production KS BTP ni les données locales existantes.

## 6. Étape suivante proposée

Si le propriétaire l'autorise, la prochaine étape sera une **étude technique sans création de projet** : vérifier précisément les fonctions Neon nécessaires, dessiner les politiques d'isolation PostgreSQL, préparer les migrations SQL et les tests d'accès sur données fictives. La création du projet ne sera demandée qu'après validation séparée.
