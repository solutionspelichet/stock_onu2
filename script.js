
// URL de votre API Google Apps Script
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwO0P3Yo5kw9PPriJPXzUMipBrzlGTR_r-Ff6OyEUnsNu-I9q-rESbBq7l2m6KLA3RJ/exec';

// Variables globales
let materielCounter = 0;

// Fonction pour détecter si on est en développement local
function isLocalDevelopment() {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1' ||
           window.location.hostname === '' ||
           window.location.protocol === 'file:';
}

// Fonction pour contourner CORS en développement
async function fetchWithCorsWorkaround(url) {
    if (isLocalDevelopment()) {
        // En développement local, ouvrir dans un nouvel onglet et demander à l'utilisateur
        console.log('Mode développement détecté - contournement CORS');
        
        // Essayer d'abord une requête normale
        try {
            const response = await fetch(url, { mode: 'no-cors' });
            // En mode no-cors, on ne peut pas lire la réponse, mais on peut détecter si la requête a abouti
            console.log('Requête envoyée en mode no-cors');
            return { ok: true, text: () => Promise.resolve('Requête envoyée (mode no-cors)') };
        } catch (error) {
            console.log('Échec en mode no-cors, ouverture dans un nouvel onglet');
            
            // Ouvrir dans un nouvel onglet comme fallback
            const newWindow = window.open(url, '_blank');
            return { 
                ok: true, 
                text: () => Promise.resolve('Requête envoyée dans un nouvel onglet') 
            };
        }
    } else {
        // En production (GitHub Pages, etc.), utiliser fetch normal
        return fetch(url);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const mouvementForm = document.getElementById('mouvementForm');
    const mouvementMessage = document.getElementById('mouvementMessage');
    const dateMouvementInput = document.getElementById('dateMouvement');
    const feuilleCibleSelect = document.getElementById('feuilleCible');
    const typeMouvementSelect = document.getElementById('typeMouvement');
    const zoneMouvementInput = document.getElementById('zoneMouvement');
    const zonesDatalist = document.getElementById('zonesList');
    const materielsDatalist = document.getElementById('materielsList');
    const zoneInputFieldGroup = document.getElementById('zoneInputFieldGroup');
    const addMaterielBtn = document.getElementById('addMaterielBtn');

    const selectZoneVisualisation = document.getElementById('selectZoneVisualisation');
    const chargerStockBtn = document.getElementById('chargerStockBtn');
    const stockDisplayArea = document.getElementById('stockDisplayArea');
    const visualisationMessage = document.getElementById('visualisationMessage');

    // Afficher le mode de développement
    if (isLocalDevelopment()) {
        console.log('🔧 Mode développement local détecté - contournement CORS activé');
        const devWarning = document.createElement('div');
        devWarning.style.cssText = 'background: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin: 10px; border-radius: 4px; color: #856404;';
        devWarning.innerHTML = '⚠️ Mode développement : Certaines fonctionnalités utilisent un contournement CORS. Pour une expérience complète, hébergez sur GitHub Pages.';
        document.body.insertBefore(devWarning, document.body.firstChild);
    }

    // --- Initialisation et pré-remplissage ---
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateMouvementInput.value = `${yyyy}-${mm}-${dd}`;

    loadAllZonesForDatalist();
    loadAllMaterielsForDatalist();
    loadAvailableZonesForVisualization();

    // Ajouter le premier champ matériel
    addMaterielItem();

    // Mapping pour la PWA
    const NOM_FEUILLE_TO_NOM_ZONE_FRONTEND = {
        "Stock Voie Creuse": "Voie Creuse",
        "Stock Bibliothèque": "Bibliothèque",
    };

    // --- Gestion de la visibilité des champs et textes des labels ---
    function updateFormLabelsAndVisibility() {
        const typeSelected = typeMouvementSelect.value;
        const feuilleCible = feuilleCibleSelect.value;
        const zoneLabel = zoneInputFieldGroup.querySelector('label');

        if (typeSelected === "Transfert") {
            feuilleCibleSelect.querySelector('option[value="Stock Voie Creuse"]').disabled = false;
            feuilleCibleSelect.querySelector('option[value="Stock Bibliothèque"]').disabled = false;
            feuilleCibleSelect.querySelector('option[value="Répartition Journalière"]').disabled = true;
            feuilleCibleSelect.querySelector('option[value="Restes Zones"]').disabled = true;
            zoneLabel.textContent = 'Zone de Destination du Transfert:';
            if (!['Stock Voie Creuse', 'Stock Bibliothèque'].includes(feuilleCible)) {
                feuilleCibleSelect.value = 'Stock Voie Creuse';
            }
        } else if (typeSelected === "Entrée" || typeSelected === "Sortie") {
            feuilleCibleSelect.querySelector('option[value="Stock Voie Creuse"]').disabled = false;
            feuilleCibleSelect.querySelector('option[value="Stock Bibliothèque"]').disabled = false;
            feuilleCibleSelect.querySelector('option[value="Répartition Journalière"]').disabled = true;
            feuilleCibleSelect.querySelector('option[value="Restes Zones"]').disabled = true;
            if (typeSelected === "Entrée") {
                zoneLabel.textContent = 'Zone de Destination (où le matériel est ajouté):';
            } else {
                zoneLabel.textContent = 'Zone d\'Origine (d\'où le matériel est retiré):';
            }
            zoneMouvementInput.value = NOM_FEUILLE_TO_NOM_ZONE_FRONTEND[feuilleCible] || '';
        } else if (feuilleCible === "Répartition Journalière") {
            zoneLabel.textContent = 'Zone de Distribution:';
            typeMouvementSelect.value = "Entrée";
            typeMouvementSelect.disabled = true;
        } else if (feuilleCible === "Restes Zones") {
            zoneLabel.textContent = 'Zone d\'Inventaire:';
            typeMouvementSelect.value = "Entrée";
            typeMouvementSelect.disabled = true;
        }

        if (feuilleCible !== "Répartition Journalière" && feuilleCible !== "Restes Zones") {
            typeMouvementSelect.disabled = false;
        }

        zoneMouvementInput.required = true; 
    }

    // --- Gestion des matériels multiples ---
    function addMaterielItem() {
        materielCounter++;
        const container = document.getElementById('materielsContainer');
        
        const materielDiv = document.createElement('div');
        materielDiv.className = 'materiel-item';
        materielDiv.dataset.id = materielCounter;
        
        materielDiv.innerHTML = `
            <input list="materielsList" 
                   placeholder="Sélectionner ou saisir un matériel" 
                   class="materiel-input" 
                   required>
            <input type="number" 
                   placeholder="Quantité" 
                   class="quantite-input" 
                   min="1" 
                   required>
            <button type="button" class="remove-materiel-btn">Supprimer</button>
        `;
        
        container.appendChild(materielDiv);
        
        const removeBtn = materielDiv.querySelector('.remove-materiel-btn');
        removeBtn.addEventListener('click', () => removeMaterielItem(materielDiv));
        
        updateMaterielCounter();
    }

    function removeMaterielItem(materielDiv) {
        const container = document.getElementById('materielsContainer');
        if (container.children.length > 1) {
            materielDiv.remove();
            updateMaterielCounter();
        } else {
            showMessage('Au moins un matériel est requis.', 'error');
        }
    }

    function updateMaterielCounter() {
        const count = document.getElementById('materielsContainer').children.length;
        document.getElementById('materielCount').textContent = count;
    }

    function showMessage(message, type) {
        mouvementMessage.textContent = message;
        mouvementMessage.className = `message ${type}`;
    }

    // Event listeners
    typeMouvementSelect.addEventListener('change', updateFormLabelsAndVisibility);
    feuilleCibleSelect.addEventListener('change', updateFormLabelsAndVisibility);
    addMaterielBtn.addEventListener('click', addMaterielItem);
    updateFormLabelsAndVisibility();

    // --- Gestion du formulaire d'enregistrement de mouvement ---
    mouvementForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        mouvementMessage.textContent = 'Enregistrement en cours...';
        mouvementMessage.className = 'message info';

        try {
            const formData = {
                feuilleCible: feuilleCibleSelect.value,
                date: dateMouvementInput.value,
                type: typeMouvementSelect.value,
                zone: zoneMouvementInput.value,
                items: []
            };

            const materielItems = document.querySelectorAll('.materiel-item');
            for (const item of materielItems) {
                const materiel = item.querySelector('.materiel-input').value.trim();
                const quantite = item.querySelector('.quantite-input').value;
                
                if (!materiel || !quantite) {
                    throw new Error('Tous les matériels doivent avoir un nom et une quantité.');
                }
                
                if (parseInt(quantite) <= 0) {
                    throw new Error('La quantité doit être un nombre positif.');
                }
                
                formData.items.push({
                    materiel: materiel,
                    quantite: parseInt(quantite)
                });
            }

            if (formData.items.length === 0) {
                throw new Error('Au moins un matériel est requis.');
            }

            // Validation des transferts
            if (formData.type === "Transfert") {
                const feuilleSource = formData.feuilleCible;
                const zoneDestination = formData.zone;
                if (!feuilleSource || !zoneDestination) {
                    throw new Error('Pour un Transfert, la Feuille de Journalisation (Source) et la Zone de Destination sont obligatoires.');
                }
                const zoneSourceLogique = NOM_FEUILLE_TO_NOM_ZONE_FRONTEND[feuilleSource];
                if (!zoneSourceLogique || zoneSourceLogique === zoneDestination) {
                    throw new Error('Pour un Transfert, la Feuille de Journalisation doit être un Stock principal et la Zone de Destination doit être différente de la source.');
                }
            }

            // Enregistrement avec contournement CORS si nécessaire
            if (isLocalDevelopment()) {
                mouvementMessage.textContent = 'Mode développement : Traitement en cours...';
                mouvementMessage.className = 'message warning';
            }

            let totalMouvements = 0;
            
            for (let i = 0; i < formData.items.length; i++) {
                const item = formData.items[i];
                
                mouvementMessage.textContent = `Enregistrement ${i + 1}/${formData.items.length}: ${item.materiel}...`;
                
                try {
                    const params = new URLSearchParams({
                        action: 'addSingleMovement',
                        feuilleCible: formData.feuilleCible,
                        date: formData.date,
                        type: formData.type,
                        zone: formData.zone,
                        materiel: item.materiel,
                        quantite: item.quantite.toString()
                    });

                    const url = `${APP_SCRIPT_URL}?${params.toString()}`;
                    console.log(`Envoi matériel ${i + 1}:`, params.toString());

                    const response = await fetchWithCorsWorkaround(url);

                    if (response.ok) {
                        totalMouvements++;
                        console.log(`✅ ${item.materiel} enregistré`);
                    } else {
                        console.error(`❌ Erreur pour ${item.materiel}`);
                    }
                    
                    // Délai entre les requêtes
                    await new Promise(resolve => setTimeout(resolve, 300));
                    
                } catch (error) {
                    console.error(`Erreur pour ${item.materiel}:`, error);
                }
            }

            if (totalMouvements > 0) {
                mouvementMessage.textContent = `Succès: ${totalMouvements}/${formData.items.length} matériels traités.`;
                mouvementMessage.className = 'message success';
                
                if (isLocalDevelopment()) {
                    mouvementMessage.textContent += ' (Mode développement - vérifiez vos données dans Google Sheets)';
                }
                
                resetForm();
                loadAllZonesForDatalist();
                loadAllMaterielsForDatalist();
                loadAvailableZonesForVisualization();
            } else {
                mouvementMessage.textContent = 'Aucun matériel n\'a pu être traité.';
                mouvementMessage.className = 'message error';
            }
            
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement:', error);
            mouvementMessage.textContent = 'Erreur lors de l\'enregistrement: ' + error.message;
            mouvementMessage.className = 'message error';
        }
    });

    function resetForm() {
        mouvementForm.reset();
        dateMouvementInput.value = `${yyyy}-${mm}-${dd}`; 
        const container = document.getElementById('materielsContainer');
        container.innerHTML = '';
        materielCounter = 0;
        addMaterielItem();
        updateFormLabelsAndVisibility();
    }

    // --- Fonctions pour charger les données ---
    async function loadAllZonesForDatalist() {
        try {
            const response = await fetch(`${APP_SCRIPT_URL}?get=zones`);
            if (response.ok) {
                const zones = await response.json();
                zonesDatalist.innerHTML = '';
                zones.forEach(zone => {
                    const option = document.createElement('option');
                    option.value = zone;
                    zonesDatalist.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Erreur zones:', error);
            if (isLocalDevelopment()) {
                console.log('Chargement des zones échoué en mode développement - normal avec CORS');
            }
        }
    }

    async function loadAllMaterielsForDatalist() {
        try {
            const response = await fetch(`${APP_SCRIPT_URL}?get=materiels`);
            if (response.ok) {
                const materiels = await response.json();
                materielsDatalist.innerHTML = '';
                materiels.forEach(materiel => {
                    const option = document.createElement('option');
                    option.value = materiel;
                    materielsDatalist.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Erreur matériels:', error);
            if (isLocalDevelopment()) {
                console.log('Chargement des matériels échoué en mode développement - normal avec CORS');
            }
        }
    }

    async function loadAvailableZonesForVisualization() {
        try {
            const response = await fetch(`${APP_SCRIPT_URL}?get=zones`);
            if (response.ok) {
                const zones = await response.json();
                
                selectZoneVisualisation.innerHTML = '<option value="">-- Sélectionner une zone --</option>';
                zones.forEach(zone => {
                    const option = document.createElement('option');
                    option.value = zone;
                    option.textContent = zone;
                    selectZoneVisualisation.appendChild(option);
                });

                if (zones.length > 0) {
                    selectZoneVisualisation.value = zones[0];
                    loadStockData(zones[0]);
                }
            }
        } catch (error) {
            console.error('Erreur visualisation zones:', error);
            if (isLocalDevelopment()) {
                selectZoneVisualisation.innerHTML = '<option value="">Mode développement - données limitées</option>';
            }
        }
    }

    chargerStockBtn.addEventListener('click', () => {
        const selectedZone = selectZoneVisualisation.value;
        if (selectedZone) {
            loadStockData(selectedZone);
        } else {
            visualisationMessage.textContent = 'Veuillez sélectionner une zone.';
            visualisationMessage.className = 'message error';
        }
    });

    async function loadStockData(zone) {
        visualisationMessage.textContent = `Chargement du stock pour "${zone}"...`;
        visualisationMessage.className = 'message info';
        stockDisplayArea.innerHTML = '';

        try {
            const response = await fetch(`${APP_SCRIPT_URL}?etat=1&zone=${encodeURIComponent(zone)}`);
            
            if (response.ok) {
                const data = await response.json();
                displayStockData(data, zone);
            } else {
                throw new Error(`Erreur HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Erreur stock:', error);
            if (isLocalDevelopment()) {
                visualisationMessage.textContent = 'Mode développement - visualisation limitée par CORS';
                visualisationMessage.className = 'message warning';
            } else {
                visualisationMessage.textContent = 'Erreur lors du chargement: ' + error.message;
                visualisationMessage.className = 'message error';
            }
        }
    }

    function displayStockData(data, zoneName) {
        stockDisplayArea.innerHTML = '';
        visualisationMessage.textContent = '';

        const title = document.createElement('h3');
        title.textContent = `État des stocks pour ${zoneName}:`;
        stockDisplayArea.appendChild(title);

        if (data && data.length > 1) {
            const table = document.createElement('table');
            table.classList.add('stock-table');

            let html = '<thead><tr>';
            data[0].forEach(header => {
                html += `<th>${header}</th>`;
            });
            html += '</tr></thead><tbody>';

            for (let i = 1; i < data.length; i++) {
                html += '<tr>';
                data[i].forEach(cell => {
                    html += `<td>${cell}</td>`;
                });
                html += '</tr>';
            }
            html += '</tbody>';
            table.innerHTML = html;
            stockDisplayArea.appendChild(table);
            visualisationMessage.textContent = `Affichage de ${data.length - 1} articles.`;
            visualisationMessage.className = 'message info';
        } else {
            stockDisplayArea.innerHTML += '<p>Aucune donnée de stock trouvée pour cette zone ou le stock est vide.</p>';
            visualisationMessage.textContent = 'Aucune donnée de stock trouvée.';
            visualisationMessage.className = 'message warning';
        }
    }
});
