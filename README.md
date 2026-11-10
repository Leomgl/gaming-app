# GAMING — PWA indépendante

GitHub (source principale) → Cloudflare Worker `gaming-app` → https://gaming-app.q9pfwtztsc.workers.dev/

Le dépôt contient les sources. `npm run build` regénère automatiquement `worker.mjs`. Le déploiement `npx wrangler deploy` peut être configuré sur chaque push dans Cloudflare Builds, sans secret dans le dépôt.

Données locales IndexedDB, export/import JSON. NEXUS/RITUEL restent indépendants. NEXUS LINK n'utilisera jamais les clés des coffres d'autres applications.

## NEXUS LINK — jumelage de test V0.2

Gaming V0.2 inclut un client de chiffrement end-to-end indépendant du coffre de NEXUS. Depuis **NEXUS → Réglages → Applications & connexions → Configurer Gaming**, coche au moins une permission puis touche **Jumeler**. NEXUS affiche un code privé `NXL1...` ; colle ce code dans **Gaming → Réglages → NEXUS LINK → Jumeler**.

Dans Gaming, utilise **Envoyer un test**, puis dans NEXUS **Messages** pour voir l'accusé réception. Pour couper l'accès côté serveur, **Révoquer** depuis NEXUS. N'envoie jamais ton code à quelqu'un ni dans un chat.

Aucun paiement, pass, rendez-vous ni jeu n'est importé dans NEXUS automatiquement. Cette version valide uniquement le transport sécurisé. Les données Gaming restent locales.

## Gaming V0.3 — bibliothèque, stockage et thèmes

- **Fiches jeu** : détail central, genre, favori, dernière session, taille, plateforme, support, notes et suivis associés.
- **Bibliothèque** : recherche par titre/genre/notes, filtres état/plateforme/support, tri par nom, favoris, taille ou modification récente.
- **Stockage** : SSD interne, M.2, USB ; chiffres connus distincts des tailles manquantes. Déclaration manuelle des transferts depuis la fiche, sans manipulation réelle de la PS5. Jeux PS5 sur USB marqués « stocké ».
- **Personnalisation** : quatre ambiances (Night Ops, Nebula, Carbon, Ardoise) et cinq couleurs (Lime, Cyan, Violet, Ambre, Rouge) indépendantes.
- **Compatibilité** : le modèle IndexedDB `gaming-personal-v1` ne change pas d'identifiant ; la migration non destructive ajoute `preferences` uniquement, les jeux précédents, les suivis et le secret du jumelage NEXUS restent conservés. Les choix de thèmes sont inclus dans les exports/imports JSON.
- **Pas de nouvelles permissions Cloudflare**, de Worker ou de D1. Aucun lien financier NEXUS actif, uniquement les messages de test déjà disponibles.

**Test iPhone** : Réglages → Personnalisation ; modifier thème et accent ; créer un jeu PS5 sur USB, ouvrir sa fiche, déclarer un transfert M.2 ; ajouter un pass depuis la fiche ; fermer/réouvrir et vérifier les données et la connexion NEXUS LINK.
