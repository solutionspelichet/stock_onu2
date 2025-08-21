// Frontend logic + Tabs + Multi-matériels (legacy) + Aperçu Réappro
const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwO0P3Yo5kw9PPriJPXzUMipBrzlGTR_r-Ff6OyEUnsNu-I9q-rESbBq7l2m6KLA3RJ/exec";

async function apiGet(params) {
  const url = APP_SCRIPT_URL + "?" + new URLSearchParams(params).toString();
  const res = await fetch(url, { method: "GET" });
  const ct = res.headers.get("content-type")||"";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function setToday(id){const el=document.getElementById(id); if(el) el.value=new Date().toISOString().slice(0,10);}
function toTable(h,rows){
  const th="<thead><tr>"+h.map(x=>`<th>${x}</th>`).join("")+"</tr></thead>";
  const tb="<tbody>"+rows.map(r=>"<tr>"+r.map(c=>`<td>${c}</td>`).join("")+"</tr>").join("")+"</tbody>";
  return `<table>${th+tb}</table>`;
}

function initTabs() {
  const buttons = document.querySelectorAll('.tab-button');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach(btn => { btn.addEventListener('click', () => {
    buttons.forEach(b=>b.classList.remove('active'));
    panels.forEach(p=>p.classList.add('hidden'));
    btn.classList.add('active');
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.classList.remove('hidden');
  }); });
}

// ───────── Réappro – aides dynamiques
let _matsList = [];
let _cacheEquipeInfo = new Map();

function buildMatSelect(value=""){
  const sel = document.createElement('select');
  _matsList.forEach(m=>{ const o=document.createElement('option'); o.value=o.textContent=m; sel.appendChild(o); });
  if(value) sel.value=value;
  return sel;
}

function addLegacyRow(value="", qty=""){
  const tbody = document.getElementById('legacyItems');
  const tr = document.createElement('tr');
  const tdMat = document.createElement('td'); const tdQty = document.createElement('td'); const tdRm = document.createElement('td');
  const sel = buildMatSelect(value);
  const input = document.createElement('input'); input.type='number'; input.min='1'; input.step='1'; input.value = qty;
  const btn = document.createElement('button'); btn.textContent='Supprimer'; btn.className='remove-btn'; btn.addEventListener('click', ()=> tr.remove());
  tdMat.appendChild(sel); tdQty.appendChild(input); tdRm.appendChild(btn);
  tr.appendChild(tdMat); tr.appendChild(tdQty); tr.appendChild(tdRm);
  tbody.appendChild(tr);
}

async function initLists() {
  const eqSel = document.getElementById("besoinEquipe"); if (eqSel) { eqSel.innerHTML=""; }
  const equipes = await apiGet({ get: "equipes" });
  (equipes||[]).forEach(e=>{const o=document.createElement("option");o.value=o.textContent=e;eqSel&&eqSel.appendChild(o);});

  _matsList = await apiGet({ get: "materiels" }) || [];
  const matSel1 = document.getElementById("besoinMateriel");
  [matSel1].forEach(sel=>{ if(!sel) return; sel.innerHTML=""; (_matsList||[]).forEach(m=>{const o=document.createElement("option");o.value=o.textContent=m; sel.appendChild(o);}); });

  const zones = await apiGet({ get: "zones" });
  const zoneSel1 = document.getElementById("legacyZone");
  const zoneSel2 = document.getElementById("etatZone");
  [zoneSel1,zoneSel2].forEach(sel=>{ if(!sel) return; sel.innerHTML=""; (zones||[]).forEach(z=>{const o=document.createElement("option");o.value=o.textContent=z; sel.appendChild(o);}); });

  // Première ligne par défaut pour le tableau multi-matériels
  const tbody = document.getElementById('legacyItems');
  if (tbody && !tbody.children.length) addLegacyRow();
}

// Crée la zone d’aperçu si absente
function ensurePreviewBox(){
  if (document.getElementById("besoinApercu")) return;
  const card = document.querySelector('#tab-reappro .card:nth-of-type(2)'); // "Saisie Besoins J+1"
  if (!card) return;
  const box = document.createElement('div');
  box.id = "besoinApercu";
  box.style.marginTop = "10px";
  box.style.padding = "10px";
  box.style.border = "1px dashed #ddd";
  box.style.borderRadius = "8px";
  box.className = "muted";
  box.innerHTML = "Aperçu : choisissez une équipe, un matériel, une date et une cible.";
  card.appendChild(box);

  const hint = document.createElement('p');
  hint.className = "muted";
  hint.style.marginTop = "8px";
  hint.innerHTML = "Astuce : <b>Clôture J</b> doit être faite la veille pour que le <i>reste</i> reflète bien la réalité (sinon on utilise l’état instantané).";
  card.appendChild(hint);
}

async function getEquipeInfo(equipe){
  if (_cacheEquipeInfo.has(equipe)) return _cacheEquipeInfo.get(equipe);
  const info = await apiGet({ get: "infoEquipe", equipe });
  _cacheEquipeInfo.set(equipe, info||{});
  return info||{};
}

async function getReste(zone, materiel, dateStr){
  const r = await apiGet({ get: "reste", zone, materiel, date: dateStr||"" });
  if (r && typeof r === "object" && "quantite" in r) return r;
  return { quantite: 0, source: "Aucun" };
}

function debounce(fn, ms=250){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}

const updatePreview = debounce(async ()=>{
  ensurePreviewBox();
  const box = document.getElementById("besoinApercu");
  if (!box) return;

  const d = document.getElementById("besoinDate")?.value || "";
  const eq = document.getElementById("besoinEquipe")?.value || "";
  const mat = document.getElementById("besoinMateriel")?.value || "";
  const cible = parseInt(document.getElementById("besoinCible")?.value||"0",10) || 0;

  if (!eq || !mat || !d) {
    box.innerHTML = "Aperçu : choisissez une équipe, un matériel et une date.";
    return;
  }

  try{
    const info = await getEquipeInfo(eq);
    const zone = info?.zone || "";
    if (!zone) {
      box.innerHTML = `Équipe: <b>${eq}</b> • Zone inconnue (renseignez l'onglet <i>Équipes</i>).`;
      return;
    }
    const reste = await getReste(zone, mat, d);
    const besoin = Math.max(0, (cible||0) - (reste.quantite||0));
    box.innerHTML = `
      <div><b>Équipe:</b> ${eq} • <b>Zone:</b> ${zone}</div>
      <div><b>Matériel:</b> ${mat}</div>
      <div><b>Reste (veille):</b> ${reste.quantite} <span class="muted">(${reste.source})</span></div>
      <div><b>Cible (demain):</b> ${cible || 0}</div>
      <div><b>Besoin estimé:</b> ${besoin}</div>
    `;
  }catch(e){
    box.innerHTML = `<span class="error">Aperçu indisponible: ${e.message}</span>`;
  }
}, 200);

// ───────── Events
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  ensurePreviewBox();

  // Ping
  document.getElementById("btnPing")?.addEventListener("click", async () => {
    const s=document.getElementById("pingStatus"); if(s) s.textContent="Test en cours...";
    try{const r=await apiGet({test:"1"}); if(s){ s.textContent=(r&&r.status==="OK")?"Connecté ✔":"Réponse inattendue"; s.className=(r&&r.status==="OK")?"ok":"error"; } }
    catch(e){ if(s){ s.textContent="Erreur de connexion"; s.className="error"; } }
  });

  // Ajout besoin J+1
  document.getElementById("btnAddBesoin")?.addEventListener("click", async () => {
    const d=besoinDate.value, eq=besoinEquipe.value, m=besoinMateriel.value, c=besoinCible.value, com=besoinComment.value;
    const msg=besoinMsg; msg.textContent="Ajout en cours..."; msg.className="muted";
    if(!d||!eq||!m||!c){msg.textContent="Renseignez date, équipe, matériel et cible."; msg.className="error"; return;}
    try{
      const r=await apiGet({action:"addBesoins", date:d, equipe:eq, materiel:m, cible:c, commentaire:com});
      msg.textContent=(typeof r==="string"?r:"Ajout effectué"); msg.className="ok"; besoinCible.value=""; besoinComment.value="";
      updatePreview(); // refresh aperçu après ajout
    }catch(e){msg.textContent="Erreur: "+e.message; msg.className="error";}
  });

  // Snapshot Restes Zones
  document.getElementById("btnSnapshot")?.addEventListener("click", async () => {
    const d=snapshotDate.value, m=snapshotMsg; m.textContent="Snapshot en cours..."; m.className="muted";
    if(!d){m.textContent="Choisissez une date."; m.className="error"; return;}
    try{const r=await apiGet({action:"snapshotRestes", date:d}); m.textContent=(typeof r==="string"?r:"Snapshot effectué"); m.className="ok";}
    catch(e){m.textContent="Erreur: "+e.message; m.className="error";}
  });

  // Calcul du plan J+1
  document.getElementById("btnCalculerPlan")?.addEventListener("click", async () => {
    const d=planDate.value, a=aggContainer, t=detailContainer, b=btnGenererMouvements;
    if(!d){a.textContent="Veuillez sélectionner une date."; t.textContent=""; b.disabled=true; return;}
    a.textContent="Calcul en cours..."; t.textContent=""; b.disabled=true;
    try{
      const r=await apiGet({plan:"reappro", date:d});
      if(r&&r.agregat){ if(r.agregat.length){a.innerHTML=toTable(["Date","Matériel","Quantité À Prélever"], r.agregat); b.disabled=false;} else {a.textContent="Aucun besoin agrégé.";} } else {a.textContent="Aucune donnée.";}
      if(r&&r.details){t.innerHTML=toTable(["Date","Équipe","Zone","Matériel","Restes Veille","Cible Demain","Besoin Réappro"], r.details);} else {t.textContent="";}
    }catch(e){a.textContent="Erreur: "+e.message; t.textContent="";}
  });

  // Génération des mouvements VC → Bibliothèque
  document.getElementById("btnGenererMouvements")?.addEventListener("click", async () => {
    const d=planDate.value, a=aggContainer; if(!d)return;
    a.textContent="Génération des mouvements en cours...";
    try{const r=await apiGet({action:"genererReappro", date:d}); a.innerHTML=`<p class="ok">${typeof r==="string"?r:JSON.stringify(r)}</p>`;}
    catch(e){a.innerHTML=`<p class="error">Erreur: ${e.message}</p>`;}
  });

  // Legacy : enregistrement multi-matériels
  document.getElementById('btnLegacyAddLine')?.addEventListener('click', ()=> addLegacyRow());
  document.getElementById('btnLegacySave')?.addEventListener('click', async ()=>{
    const msg = document.getElementById('legacyMsg'); msg.textContent="Enregistrement..."; msg.className="muted";
    const d=legacyDate.value, type=legacyType.value, feuille=legacyFeuille.value, zone=legacyZone.value;
    const rows = Array.from(document.querySelectorAll('#legacyItems tr')).map(tr=>({
      materiel: tr.querySelector('select')?.value || '',
      quantite: parseInt(tr.querySelector('input')?.value||'0',10) || 0
    })).filter(r=>r.materiel && r.quantite>0);

    if(!d||!type||!feuille||rows.length===0){ msg.textContent="Renseignez date, type, feuille et au moins un matériel/quantité."; msg.className='error'; return; }

    try{
      const payload = encodeURIComponent(JSON.stringify(rows));
      const r = await apiGet({ action:'addLegacyBatch', date:d, type:type, feuilleCible:feuille, zone:zone, lignes: payload });
      msg.textContent = (typeof r==='string'? r : 'OK');
      msg.className='ok';
    }catch(e){ msg.textContent='Erreur: '+e.message; msg.className='error'; }
  });

  // État des stocks par zone (legacy)
  document.getElementById("btnChargerEtat")?.addEventListener("click", async ()=>{
    const z = document.getElementById("etatZone")?.value;
    const cont = document.getElementById("etatTable");
    if(!z){ cont.textContent = "Choisissez une zone."; return; }
    cont.textContent = "Chargement...";
    try{
      const r = await apiGet({ etat: "1", zone: z });
      if (Array.isArray(r)) {
        const headers = r[0] || ["Matériel","Quantité"];
        const rows = r.slice(1) || [];
        cont.innerHTML = rows.length ? toTable(headers, rows) : "Aucun article pour cette zone.";
      } else if (r && r.error) {
        cont.innerHTML = `<p class="error">${r.error}</p>`;
      } else {
        cont.textContent = "Réponse inattendue.";
      }
    }catch(e){ cont.textContent = "Erreur: " + e.message; }
  });

  // Liens d’aperçu
  ["besoinDate","besoinEquipe","besoinMateriel","besoinCible"].forEach(id=>{
    document.getElementById(id)?.addEventListener("change", updatePreview);
    document.getElementById(id)?.addEventListener("input", updatePreview);
  });

  // Init
  setToday("besoinDate"); setToday("snapshotDate"); setToday("planDate"); setToday("legacyDate");
  initLists().then(updatePreview);
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
});
