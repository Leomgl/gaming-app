# GAMING — PWA indépendante

GitHub (source principale) → Cloudflare Worker `gaming-app` → https://gaming-app.q9pfwtztsc.workers.dev/

Le dépôt contient les sources. `npm run build` regénère automatiquement `worker.mjs`. Le déploiement `npx wrangler deploy` peut être configuré sur chaque push dans Cloudflare Builds, sans secret dans le dépôt.

Données locales IndexedDB, export/import JSON. NEXUS/RITUEL restent indépendants. NEXUS LINK n'utilisera jamais les clés des coffres d'autres applications.

## NEXUS LINK — jumelage de test V0.2

Gaming V0.2 inclut un client de chiffrement end-to-end indépendant du coffre de NEXUS. Depuis **NEXUS → Réglages → Applications & connexions → Configurer Gaming**, coche au moins une permission puis touche **Jumeler**. NEXUS affiche un code privé `NXL1...` ; colle ce code dans **Gaming → Réglages → NEXUS LINK → Jumeler**.

Dans Gaming, utilise **Envoyer un test**, puis dans NEXUS **Messages** pour voir l'accusé réception. Pour couper l'accès côté serveur, **Révoquer** depuis NEXUS. N'envoie jamais ton code à quelqu'un ni dans un chat.

Aucun paiement, pass, rendez-vous ni jeu n'est importé dans NEXUS automatiquement. Cette version valide uniquement le transport sécurisé. Les données Gaming restent locales.
