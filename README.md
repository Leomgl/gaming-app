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

## V0.4 — Passes, calendrier, rappels et iOS Safe Area

- **Barre supérieure iPhone** : le header réserve `env(safe-area-inset-top)` sous l'heure, le réseau et la Dynamic Island, dans les 4 thèmes. Le fond est maintenu sous la barre de statut même au défilement.
- **Passes de combat** : niveau actuel, niveau visé, progression, début et fin de saison, statut, prix, jeu associé ; progression rapide +1/+5, réversible dans l'éditeur.
- **Calendrier Gaming** : navigation mois précédent/suivant, sélection d'un jour, échéances associées, distinction visuelle des dates confirmées ou provisoires.
- **Rappels personnalisés par événement** : 7 jours, 1 jour, 2 heures, 45 et 15 minutes et autres délais en minutes ; heure locale libre. Le choix est conservé dans IndexedDB et les exports JSON.
- **Export iCalendar (.ics)** : uniquement les dates explicitement confirmées, avec alarmes `VALARM` lorsqu'il y a des rappels. Compatible avec l'import dans une application de calendrier prenant en charge les alarmes iCalendar. **Pas de push Gaming autonome** : il faut importer le fichier dans un calendrier et autoriser les notifications de ce calendrier. Les informations importées ne se synchronisent pas automatiquement lors des modifications ultérieures.
- **Rétrocompatibilité** : les items V0.2/V0.3 sans niveaux ni rappels continuent d'exister ; aucun effacement, nouveau stockage ou migration D1. NEXUS LINK reste limité aux messages de test.

Parcours iPhone conseillé : vérifier la barre supérieure, enregistrer un pass Delta Force avec niveau et échéance confirmée, choisir les rappels, voir le calendrier, exporter le .ics, fermer/réouvrir, vérifier le jumelage NEXUS LINK.

## Gaming V0.5 — Couvertures de jeux + saisons + Web Push iOS

Les jeux ont désormais des **cartes visuelles**, un badge de plateforme, un favori, et un accès rapide aux saisons/DLC. Des couvertures HTTPS peuvent être ajoutées manuellement. Sans URL, un visuel graphique est généré par genre.

Les saisons sont suivies **même si le pass de combat n'a pas été acheté** : numéro (Delta Force 12, MW4 1), dates de début et de fin, statut « acheté ou non ». Aucune dépense n'est créée automatiquement. Les niveaux de progression de pass V0.4 sont conservés dans les anciennes fiches mais ne sont plus montrés.

Trois rappels par saison, indépendants de l'achat : **mi-saison, 14 jours, 7 jours avant la fin**, à 10 h locale. Ils sont disponibles en notifications iOS Web Push quand la PWA est installée sur l'écran d'accueil et que l'utilisateur autorise les notifications dans Réglages. Les dates doivent être confirmées. Le calendrier et les exports .ics incluent les jalons de saison.

Le Worker Gaming gère ses API push sous /api/v1/gaming-push/ avec D1 EU gaming-push-db, cron 5 minutes, clé VAPID privée dans les secrets Cloudflare (non publiée dans Git). Aucun titre de jeu, coût, note ou numéro de saison n'est conservé côté serveur : seulement des dates, le type d'étape, des ID opaques et l'abonnement du navigateur.

Les jetons de souscription sont stockés localement dans IndexedDB en dehors des exports JSON. Les fiches, préférences et jumelages NEXUS sont conservés. Un test de notification sur iPhone physique reste indispensable avant de considérer les push validés de bout en bout.

## Gaming V0.6 — Jeux possédés mais désinstallés et jaquettes gratuites

La notion de **possession** est distincte de l'installation : une fiche peut être « possédée / non installée », avec toutes ses saisons, DLC et notes conservés. Les états `uninstalled` et `owned` sont sauvegardés dans le JSON et restaurés dans les migrations sans écraser les anciens jeux. Les jeux non installés ne prennent pas de place sur les indicateurs SSD/M.2/USB.

- Bibliothèque : filtres **Possédés**, **Non installés**, **À acheter**, et les filtres existants.
- Carte et fiche : état de possession, bouton d'installation déclarative, action « marquer désinstallé » sans toucher aux fichiers PS5.
- Jaquettes : recherche gratuite **Wikipédia FR/EN** grâce à l'API Wikimedia sans abonnement et sans clé. Vérification automatique uniquement lorsque le titre et sa description correspondent exactement au jeu vidéo ; sinon, **choix manuel** parmi les propositions. L'URL HTTPS manuelle existante reste prioritaire et peut être retirée.
- Les images ne sont pas copiées sur le Worker ni dans D1 : seule une URL Wikimedia et un lien d'attribution sont enregistrés sur le téléphone. Certaines pages fournissent des logos/illustrations plutôt que des pochettes. Les droits d'images dépendent de la source.
- Nouvelle règle CSP autorisant les deux API Wikimedia ; stockage, jumelage NEXUS LINK, rappels push Gaming et clés conservés inchangés.
- Pas de coût supplémentaire : aucune nouvelle base, aucun secret, pas de requêtes d'API payantes.

### Recherche de jaquettes pour une bibliothèque déjà créée

Dans Jeux, **Trouver mes jaquettes** cherche par lot de six jeux sans illustration. Les propositions sont associées automatiquement uniquement si l'article correspond exactement au nom du jeu et sa description indique un jeu vidéo. Les autres images restent accessibles depuis la fiche **Jaquette** pour vérification manuelle ; le champ URL HTTPS est toujours disponible.

Une requête Wikipédia ne comprend que le nom du jeu recherché ; aucune connexion NEXUS ni donnée de pass, budget ou souscription push n'est envoyée. Le service externe peut échouer ou ne pas proposer de couverture, auquel cas la carte graphique par genre reste visible.

## Gaming V0.7 — synchronisation chiffrée vers NEXUS

Le jumelage NEXUS LINK existant sert à envoyer des propositions métier selon les scopes **déjà approuvés dans NEXUS**, sans nouveau code de pairage.

**Gaming → Réglages → NEXUS LINK → Synchroniser avec NEXUS → Envoyer maintenant.** Gaming calcule les propositions éligibles, déduplique les éléments inchangés via une empreinte SHA-256 dans `linkOutbox[]` puis chiffre les différences via AES-GCM. Chaque source reçoit une révision, ce qui permet à NEXUS de reconnaître et proposer la mise à jour d'un élément déjà accepté.

Dans la fenêtre de synchronisation, un réglage facultatif (désactivé par défaut) autorise l'envoi automatique lorsque Gaming est ouverte et connectée. Il est stocké seulement sur l'appareil, et **n'autorise pas les écritures automatiques dans NEXUS**.

Correspondances : saisons → événement de fin + tâches mi-saison/J−14/J−7 ; pass réellement acheté → proposition de dépense (montant, date du paiement à confirmer dans NEXUS) ; dépense prévue → Achat ; DLC et sorties → Agenda et Achat ; événement gaming → Agenda ; compte des jeux possédés/installés/stockés → Note.

Un pass non acheté (Fortnite, par exemple) peut générer ses rappels, **jamais une dépense réelle**. Les titres, prix et dates sont uniquement dans le payload chiffré ; Cloudflare ne les lit pas en clair.

Le lien est volontairement unidirectionnel et soumis à validation humaine : dans NEXUS, Réglages → Applications & connexions → Propositions → Recevoir. Aucun objet NEXUS n'est supprimé si Gaming supprime un élément. La base D1, le Worker et les notifications Gaming n'ont pas été modifiés pour cette évolution.
