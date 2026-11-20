# Procédure — environnement isolé de validation KS BTP

**Statut : préparation uniquement — AUCUNE branche ou base Supabase créée.**  
**Projet de référence :** `KS-BTP-DEV` (`fbqtbaeanxromfksfllr`).  
**Branche GitHub de travail :** `phase-3-selection-entreprise-cloud`.

## 1. État vérifié
- La liste des branches de développement Supabase du projet de référence a été consultée le 20 novembre 2026 : aucune branche n'est actuellement listée.
- Aucune base de test isolée n'est donc confirmée à ce stade.
- Aucune donnée du projet KS-BTP-DEV n'a été copiée, modifiée ou supprimée.

## 2. Option privilégiée
Créer une branche de développement Supabase nommée `ks-btp-rls-validation`, uniquement après vérification du coût et accord explicite sur ce coût.

Attention : une branche de développement applique les migrations du projet parent à une base fraîche. Les données de production ne sont pas copiées. Ne pas considérer cette branche comme une copie complète de KS-BTP-DEV.

Si le coût ou les limites du forfait ne conviennent pas, utiliser un projet Supabase séparé de test, créé explicitement et configuré sans données réelles.

## 3. Garde-fous avant création
- Confirmer l'organisation Supabase concernée et le coût affiché.
- Ne jamais réutiliser de mot de passe ou de clé secrète du projet principal.
- Ne jamais importer le dump réel ni les données personnelles/comptables dans l'environnement de test.
- Préparer uniquement des données synthétiques : entreprise TEST, chantiers TEST-A et TEST-B, matériaux fictifs et comptes de test.
- Ne pas relier l'application de production à l'environnement de test.
- Ne pas fusionner une branche de test vers le projet principal.

## 4. Plan de validation après création
1. Vérifier l'identifiant et l'URL du nouvel environnement pour confirmer qu'il est distinct du projet parent.
2. Auditer les tables, fonctions, privilèges et politiques effectivement présents dans cette base fraîche.
3. Vérifier que les migrations existantes s'appliquent sans erreur.
4. Installer les changements d'affectation uniquement dans cet environnement isolé.
5. Créer des comptes synthétiques pour propriétaire, administrateur, directeur, magasinier, chef de chantier et lecteur.
6. Tester les autorisations positives et négatives, notamment l'interdiction d'accéder au chantier non affecté et aux autres entreprises.
7. Tester les fonctions de mouvement de stock, les doublons et la révocation d'affectation.
8. Conserver les résultats et les erreurs comme rapport de validation.

## 5. Conditions de réussite
- Aucun accès inter-entreprise.
- Un chef de chantier ne voit que les chantiers qui lui sont affectés.
- Une révocation bloque immédiatement les opérations autorisées par cette affectation, après prise en compte du rafraîchissement de session/JWT nécessaire.
- Les rôles de direction et de magasin restent conformes à la matrice approuvée.
- Aucun changement n'est apporté au projet KS-BTP-DEV pendant les essais.

## 6. Interdictions
Ce document n'autorise pas la création d'une branche payante, l'exécution de SQL, le déploiement, la fusion, ni aucune modification du projet principal. Chaque action cloud reste soumise à ses contrôles et autorisations propres.
