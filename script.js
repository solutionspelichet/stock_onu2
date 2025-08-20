// Frontend logic + Tabs
const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwO0P3Yo5kw9PPriJPXzUMipBrzlGTR_r-Ff6OyEUnsNu-I9q-rESbBq7l2m6KLA3RJ/exec";

async function apiGet(params) {
  const url = APP_SCRIPT_URL + "?" + new URLSearchParams(params).toString();
  const res = await fetch(url, { method: "GET" });
  const ct = res.headers.get("content-type")||"";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function setToday(id){const el=document.getElementById(id); if(el) el.value=new Date().toISOString().slice(0,10);}
function toTable(h,rows){const th="<thead><tr>"+h.map(x=>`<th>${x}</th>`).join("")+"</tr></thead>";const tb="<tbody>"+rows.map(r=>"<tr>"+r.map(c=>`<td>${c}</td>`).join("")+"</tr>").join("")+"</tbody>";return `<table>${th+tb}</table>`;}

function initTabs() {
  const buttons = document.querySelectorAll('.tab-button');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b=>b.classList.remove('active'));
      panels.forEach(p=>p.classList.add('hidden'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.remove('hidden');
    });
  });
}

async function initLists() {
  const eqSel = document.getElementById("besoinEquipe"); if (eqSel) { eqSel.innerHTML=""; }
  const equipes = await apiGet({ get: "equipes" });
  (equipes||[]).forEach(e=>{const o=document.createElement("option");o.value=o.textContent=e;eqSel&&eqSel.appendChild(o);});

  const mats = await apiGet({ get: "materiels" });
  const matSel1 = document.getElementById("besoinMateriel");
  const matSel2 = document.getElementById("legacyMateriel");
  [matSel1,matSel2].forEach(sel=>{ if(!sel) return; sel.innerHTML=""; (mats||[]).forEach(m=>{const o=document.createElement("option");o.value=o.textContent=m; sel.appendChild(o);}); });

  const zones = await apiGet({ get: "zones" });
  const zoneSel1 = document.getElementById("legacyZone");
  const zoneSel2 = document.getElementById("etatZone");
  [zoneSel1,zoneSel2].forEach(sel=>{ if(!sel) return; sel.innerHTML=""; (zones||[]).forEach(z=>{const o=document.createElement("option");o.value=o.textContent=z; sel.appendChild(o);}); });
}

// ───────── Events
document.addEventListener("DOMContentLoaded", () => {
  initTabs();

  // Ping
  document.getElementById("btnPing")?.addEventListener("click", async () => {
    const s=document.getElementById("pingStatus"); if(s) s.textContent="Test en cours...";
    try{const r=await apiGet({test:"1"}); if(s){ s.textContent=(r&&r.status==="OK")?"Connecté ✔":"Réponse inattendue"; s.className=(r&&r.status==="OK")?"ok":"error"; }}
    catch(e){ if(s){ s.textContent="Erreur de connexion"; s.className="error"; } }
  });

  // Ajout besoin
  document.getElementById("btnAddBesoin")?.addEventListener("click", async () => {
    const d=besoinDate.value, eq=besoinEquipe.value, m=besoinMateriel.value, c=besoinCible.value, com=besoinComment.value;
    const msg=besoinMsg; msg.textContent="Ajout en cours..."; msg.className="muted";
    if(!d||!eq||!m||!c){msg.textContent="Renseignez date, équipe, matériel et cible."; msg.className="error"; return;}
    try{const r=await apiGet({action:"addBesoins", date:d, equipe:eq, materiel:m, cible:c, commentaire:com});
      msg.textContent=(typeof r==="string"?r:"Ajout effectué"); msg.className="ok"; besoinCible.value=""; besoinComment.value="";
    }catch(e){msg.textContent="Erreur: "+e.message; msg.className="error";}
  });

  // Snapshot
  document.getElementById("btnSnapshot")?.addEventListener("click", async () => {
    const d=snapshotDate.value, m=snapshotMsg; m.textContent="Snapshot en cours..."; m.className="muted";
    if(!d){m.textContent="Choisissez une date."; m.className="error"; return;}
    try{const r=await apiGet({action:"snapshotRestes", date:d}); m.textContent=(typeof r==="string"?r:"Snapshot effectué"); m.className="ok";}
    catch(e){m.textContent="Erreur: "+e.message; m.className="error";}
  });

  // Calcul plan
  document.getElementById("btnCalculerPlan")?.addEventListener("click", async () => {
    const d=planDate.value, a=aggContainer, t=detailContainer, b=btnGenererMouvements;
    if(!d){a.textContent="Veuillez sélectionner une date."; t.textContent=""; b.disabled=true; return;}
    a.textContent="Calcul en cours..."; t.textContent=""; b.disabled=true;
    try{const r=await apiGet({plan:"reappro", date:d});
      if(r&&r.agregat){ if(r.agregat.length){a.innerHTML=toTable(["Date","Matériel","Quantité À Prélever"], r.agregat); b.disabled=false;} else {a.textContent="Aucun besoin agrégé.";} }
      else {a.textContent="Aucune donnée.";}
      if(r&&r.details){t.innerHTML=toTable(["Date","Équipe","Zone","Matériel","Restes Veille","Cible Demain","Besoin Réappro"], r.details);} else {t.textContent="";}
    }catch(e){a.textContent="Erreur: "+e.message; t.textContent="";}
  });

  // Génération mouvements
  document.getElementById("btnGenererMouvements")?.addEventListener("click", async () => {
    const d=planDate.value, a=aggContainer; if(!d)return;
    a.textContent="Génération des mouvements en cours...";
    try{const r=await apiGet({action:"genererReappro", date:d}); a.innerHTML=`<p class="ok">${typeof r==="string"?r:JSON.stringify(r)}</p>`;}
    catch(e){a.innerHTML=`<p class="error">Erreur: ${e.message}</p>`;}
  });

  // Legacy: mouvements
  document.getElementById("btnLegacyAjouter")?.addEventListener("click", async () => {
    const d=legacyDate.value, type=legacyType.value, feuille=legacyFeuille.value, zone=legacyZone.value, m=legacyMateriel.value, q=legacyQuantite.value;
    const msg=legacyMsg; msg.textContent="Traitement..."; msg.className="muted";
    if(!d||!type||!feuille||!m||!q){msg.textContent="Complétez date, type, feuille cible, matériel, quantité."; msg.className="error"; return;}
    try{const r=await apiGet({ action:'addSingleMovement', date:d, type:type, feuilleCible:feuille, zone:zone, materiel:m, quantite:q });
      msg.textContent=(typeof r==='string'?r:'OK'); msg.className='ok';
    }catch(e){msg.textContent='Erreur: '+e.message; msg.className='error';}
  });

  // Legacy: état par zone
  document.getElementById("btnChargerEtat")?.addEventListener("click", async () => {
    const z=etatZone.value; const box=etatTable; box.textContent="Chargement...";
    try{const r=await apiGet({ etat:'1', zone:z });
      if(Array.isArray(r) && r.length>1){ box.innerHTML = toTable(r[0], r.slice(1)); }
      else if (typeof r === 'string') { box.textContent = r; }
      else { box.textContent = 'Aucune donnée.'; }
    }catch(e){ box.textContent = 'Erreur: '+e.message; }
  });

  setToday("besoinDate"); setToday("snapshotDate"); setToday("planDate"); setToday("legacyDate");
  initLists();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
});
