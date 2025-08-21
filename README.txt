README – v4 (mouvement multi-matériels)

NOUVEAU : dans “Fonctionnalités précédentes”, vous pouvez saisir plusieurs matériels pour un même mouvement.
• Bouton “+ Ajouter une ligne” pour ajouter des lignes Matériel/Quantité
• Bouton “Enregistrer le mouvement (multi-matériels)” pour envoyer tout en une fois

Backend (Apps Script) – nouveau endpoint :
  action=addLegacyBatch
  paramètres: date, type, feuilleCible, zone, lignes = JSON encodé (array d'objets { materiel, quantite })

Déploiement :
1) Collez `code_reappro.gs` dans Apps Script et déployez en “Application Web”.
   - Si besoin : exécutez `creerFeuillesStockONU()` et `creerOngletsReappro()`.
2) Placez `index.html`, `style.css`, `script.js`, `manifest.json`, `service-worker.js` dans un même dossier et ouvrez `index.html`.
