// Frontend logic
const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwO0P3Yo5kw9PPriJPXzUMipBrzlGTR_r-Ff6OyEUnsNu-I9q-rESbBq7l2m6KLA3RJ/exec";

async function apiGet(params) {
  const url = APP_SCRIPT_URL + "?" + new URLSearchParams(params).toString();
  const res = await fetch(url, { method: "GET" });
  const ct = res.headers.get("content-type")||"";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function setToday(inputId) {
  const el = document.getElementById(inputId);
  const today = new Date().toISOString().slice(0,10);
  el.value = today;
}

function toTable(headers, rows) {
  const thead = "<thead><tr>" + headers.map(h=>`<th>${h}</th>`).join("") + "</tr></thead>";
  const tbody = "<tbody>" + rows.map(r=>"<tr>" + r.map(c=>`<td>${c}</td>`).join("") + "</tr>").join("") + "</tbody>";
  return `<table>${thead+tbody}</table>`;
}

async function initLists() {
  const eqSelect = document.getElementById("besoinEquipe");
  eqSelect.innerHTML = "";
  const equipes = await apiGet({ get: "equipes" });
  (equipes||[]).forEach(e => {
    const opt = document.createElement("option");
    opt.value = e; opt.textContent = e;
    eqSelect.appendChild(opt);
  });

  const matSelect = document.getElementById("besoinMateriel");
  matSelect.innerHTML = "";
  const materiels = await apiGet({ get: "materiels" });
  (materiels||[]).forEach(m => {
    const opt = document.createElement("option");
    opt.value = m; opt.textContent = m;
    matSelect.appendChild(opt);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Ping
  document.getElementById("btnPing").addEventListener("click", async () => {
    const status = document.getElementById("pingStatus");
    status.textContent = "Test en cours...";
    try {
      const res = await apiGet({ test: "1" });
      if (res && res.status === "OK") {
        status.textContent = "Connecté ✔";
        status.className = "ok";
      } else {
        status.textContent = "Réponse inattendue";
        status.className = "error";
      }
    } catch (e) {
      status.textContent = "Erreur de connexion";
      status.className = "error";
    }
  });

  // Ajout besoin
  document.getElementById("btnAddBesoin").addEventListener("click", async () => {
    const d = document.getElementById("besoinDate").value;
    const equipe = document.getElementById("besoinEquipe").value;
    const mat = document.getElementById("besoinMateriel").value;
    const cible = document.getElementById("besoinCible").value;
    const comment = document.getElementById("besoinComment").value;
    const msg = document.getElementById("besoinMsg");
    msg.className = "muted";
    msg.textContent = "Ajout en cours...";

    if (!d || !equipe || !mat || !cible) {
      msg.textContent = "Veuillez renseigner date, équipe, matériel et cible.";
      msg.className = "error";
      return;
    }

    try {
      const res = await apiGet({
        action: "addBesoins",
        date: d,
        equipe: equipe,
        materiel: mat,
        cible: cible,
        commentaire: comment
      });
      msg.textContent = (typeof res === "string" ? res : "Ajout effectué");
      msg.className = "ok";
      document.getElementById("besoinCible").value = "";
      document.getElementById("besoinComment").value = "";
    } catch (e) {
      msg.textContent = "Erreur: " + e.message;
      msg.className = "error";
    }
  });

  // Snapshot
  document.getElementById("btnSnapshot").addEventListener("click", async () => {
    const d = document.getElementById("snapshotDate").value;
    const msg = document.getElementById("snapshotMsg");
    msg.textContent = "Snapshot en cours...";
    msg.className = "muted";
    if (!d) { msg.textContent = "Choisissez une date."; msg.className = "error"; return; }
    try {
      const res = await apiGet({ action: "snapshotRestes", date: d });
      msg.textContent = (typeof res === "string" ? res : "Snapshot effectué");
      msg.className = "ok";
    } catch (e) {
      msg.textContent = "Erreur: " + e.message;
      msg.className = "error";
    }
  });

  // Calcul plan
  document.getElementById("btnCalculerPlan").addEventListener("click", async () => {
    const d = document.getElementById("planDate").value;
    const aggDiv = document.getElementById("aggContainer");
    const detDiv = document.getElementById("detailContainer");
    const btnGen = document.getElementById("btnGenererMouvements");

    if (!d) {
      aggDiv.textContent = "Veuillez sélectionner une date.";
      detDiv.textContent = "";
      btnGen.disabled = true;
      return;
    }

    aggDiv.textContent = "Calcul en cours...";
    detDiv.textContent = "";
    btnGen.disabled = true;

    try {
      const res = await apiGet({ plan: "reappro", date: d });
      if (res && res.agregat) {
        const aggRows = res.agregat;
        if (aggRows.length) {
          const headers = ["Date","Matériel","Quantité À Prélever"];
          aggDiv.innerHTML = toTable(headers, aggRows);
          btnGen.disabled = false;
        } else {
          aggDiv.textContent = "Aucun besoin agrégé.";
        }
      } else {
        aggDiv.textContent = "Aucune donnée.";
      }

      if (res && res.details) {
        const headersD = ["Date","Équipe","Zone","Matériel","Restes Veille","Cible Demain","Besoin Réappro"];
        detDiv.innerHTML = toTable(headersD, res.details);
      } else {
        detDiv.textContent = "";
      }
    } catch (e) {
      aggDiv.textContent = "Erreur: " + e.message;
      detDiv.textContent = "";
    }
  });

  // Génération mouvements
  document.getElementById("btnGenererMouvements").addEventListener("click", async () => {
    const d = document.getElementById("planDate").value;
    const aggDiv = document.getElementById("aggContainer");
    if (!d) return;
    aggDiv.textContent = "Génération des mouvements en cours...";

    try {
      const res = await apiGet({ action: "genererReappro", date: d });
      const msg = (typeof res === "string" ? res : JSON.stringify(res));
      aggDiv.innerHTML = `<p class="ok">${msg}</p>`;
    } catch (e) {
      aggDiv.innerHTML = `<p class="error">Erreur: ${e.message}</p>`;
    }
  });

  // Init
  setToday("besoinDate");
  setToday("snapshotDate");
  setToday("planDate");
  initLists();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js');
  }
});
