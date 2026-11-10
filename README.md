# Gaming V0.1 — PWA autonome

Prototype local-first (IndexedDB). Jeux, supports SSD interne/M.2/USB, passes, DLC, sorties, événements, dépenses prévues. Aucune connexion PSN/NEXUS ni push. Toujours exporter les données JSON avant désinstallation ou migration. Sources temporairement dans le dépôt NEXUS, nouveau dépôt Gaming indépendant à créer ultérieurement.

## Déploiement de la bêta

- **Worker isolé** : `gaming-app` sur Cloudflare Workers Free.
- **Lien** : https://gaming-app.q9pfwtztsc.workers.dev/
- **Stockage** : IndexedDB séparé du domaine GitHub Pages NEXUS / RITUEL.
- **Source serveur** : `worker.mjs` embed les fichiers de l'application, déployable via API Cloudflare.
- **Mise à jour** : modifier les fichiers, régénérer `worker.mjs`, redéployer puis augmenter le cache dans `sw.js`.
- **GitHub indépendant** : dès création du dépôt Gaming, déplacer les sources. Le connecteur GitHub actuel ne dispose pas d'une action de création de dépôt.
- **V0.1** : aucune notification push iOS, aucune importation PSN, aucune connexion NEXUS et aucune facture cloud Gaming. Les prix sont des données purement locales.

## Tests techniques

29 vérifications du bundle (sources, routes Worker, cache, manifest, rendu et calculs), puis 9 tests supplémentaires des formulaires / sauvegardes (création jeu, déplacement USB, pass à 6,99 €, rejet de dates invalides, capacité de stockage, corbeille et restauration). Vérification d'activation workers.dev réussie. **Le rendu Safari iPhone et la livraison HTTP depuis l'appareil restent à confirmer.**
