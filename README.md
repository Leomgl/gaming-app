# GAMING — PWA indépendante

GitHub (source principale) → Cloudflare Worker `gaming-app` → https://gaming-app.q9pfwtztsc.workers.dev/

Le dépôt contient les sources. `npm run build` regénère automatiquement `worker.mjs`. Le déploiement `npx wrangler deploy` peut être configuré sur chaque push dans Cloudflare Builds, sans secret dans le dépôt.

Données locales IndexedDB, export/import JSON. NEXUS/RITUEL restent indépendants. NEXUS LINK n'utilisera jamais les clés des coffres d'autres applications.
