# KS BTP — Authentification isolée (phase 2)

## Page de prévisualisation
Ouvrir `connexion.html` dans le dossier `demo`. Cette page est volontairement séparée de l'application locale existante.

## Protection des données
- Aucun accès à la clé locale `ks_btp_v1`.
- Aucun accès à la base IndexedDB de l'application.
- Aucun import ni synchronisation automatique.
- Le client Supabase utilise uniquement la clé publishable publique.
- Ne jamais placer une clé `sb_secret_*` ou `service_role` dans le navigateur.

## Prérequis Supabase Dashboard
1. Dans Authentication > URL Configuration, définir le Site URL de prévisualisation.
2. Ajouter l'URL exacte de `connexion.html` dans Redirect URLs, avec l'URL GitHub Pages de cette branche/déploiement.
3. Vérifier les réglages de confirmation e-mail et le modèle de confirmation.
4. Vérifier que la fonction RPC `public.create_company_with_central_stock(text,text)` est exposée à l'API Data et exécutable par `authenticated`.
5. Garder RLS activé. Ne pas donner de droits d'écriture directs aux tables de stock depuis le navigateur.

## Comportement
- Inscription avec nom complet, e-mail et mot de passe.
- Le nom est envoyé dans `user_metadata.display_name` pour le trigger de profil déjà installé.
- Connexion par e-mail/mot de passe.
- Réinitialisation du mot de passe par e-mail.
- Création volontaire d'une entreprise via la fonction RPC existante.
- La création de l'entreprise crée son emplacement central, mais ne migre aucune donnée locale.

## Limites assumées
- Cette page ne donne pas encore accès à l'application de gestion des stocks.
- La liste des entreprises, l'invitation des employés, les rôles et la synchronisation multi-appareils restent à développer et tester.
- La page dépend d'Internet et du CDN Supabase JS version 2.119.0 ; elle n'est pas ajoutée au cache hors connexion existant.
- Tester d'abord dans cette branche de prévisualisation. Ne pas fusionner vers la production sans validation explicite.
