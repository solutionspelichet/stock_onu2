// ====== CONFIG ======
const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwO0P3Yo5kw9PPriJPXzUMipBrzlGTR_r-Ff6OyEUnsNu-I9q-rESbBq7l2m6KLA3RJ/exec";

// ====== API helper ======
async function apiGet(params) {
  const url = APP_SCRIPT_URL + "?" + new URLSearchParams(params).toString();
  const res = await fetch(url, { method: "GET" });
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

// ====== Date helpers ======
function setToday(id) {
  const el = document.getElementById(id);
  if (el) el.value = new Date().toISOString().slice(0, 10);
}
function setTomorrow(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const d = new Date();
  d.setDate(d.getDate() + 1);
  el.value = d.toISOString().slice(0, 10);
}

// ====== DOM helpers ======
function toTable(headers, rows) {
  const th = "<thead><tr>" + headers.map(x => `<th>${x}</th>`).join("") + "</tr></thead>";
  const tb = "<tbody>" + rows.map(r => "<tr>" + r.map(c => `<td>${c}</td>`).join("") + "</tr>").join("") + "</tbody>";
  return `<table>${th + tb}</table>`;
}
function initTabs() {
  const buttons = document.querySelectorAll('.tab-button');
  const panels = document.querySelectorAll('.tab-panel');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.remove('hidden');
    });
  });
}

// ====== Global state ======
let _matsList = [];
let _zonesList = [];
let _cacheEquipeInfo = new Map();
let LAST_PLAN = null;   // pour export Plan J+1
let LAST_USAGE = null;  // pour export Usage
let USAGE_SHOW_ALL = false; // false = équipes uniquement & jour J
window._equipesCached = [];

// ====== Select builders ======
function buildMatSelect(value = "") {
  const sel = document.createElement('select');
  _matsList.forEach(m => {
    const o = document.createElement('option');
    o.value = o.textContent = m;
    sel.appendChild(o);
  });
  if (value) sel.value = value;
  return sel;
}
function buildZoneSelect(value = "") {
  const sel = document.createElement('select');
  _zonesList.forEach(z => {
    const o = document.createElement('option');
    o.value = o.textContent = z;
    sel.appendChild(o);
  });
  if (value) sel.value = value;
  return sel;
}

// ====== Row builders ======
function addLegacyRow(value = "", qty = "") {
  const tbody = document.getElementById('legacyItems');
  const tr = document.createElement('tr');
  const tdMat = document.createElement('td'), tdQty = document.createElement('td'), tdRm = document.createElement('td');
  const sel = buildMatSelect(value);
  const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.step = '1'; input.value = qty;
  const btn = document.createElement('button'); btn.textContent = 'Supprimer'; btn.className = 'remove-btn'; btn.addEventListener('click', () => tr.remove());
  tdMat.appendChild(sel); tdQty.appendChild(input); tdRm.appendChild(btn);
  tr.appendChild(tdMat); tr.appendChild(tdQty); tr.appendChild(tdRm);
  tbody.appendChild(tr);
}
function addBesoinsRow(value = "", cible = "", comment = "") {
  const tbody = document.getElementById('besoinsRows');
  const tr = document.createElement('tr');
  const tdMat = document.createElement('td'), tdC = document.createElement('td'), tdCom = document.createElement('td'), tdRm = document.createElement('td');
  const sel = buildMatSelect(value);
  const inputC = document.createElement('input'); inputC.type = 'number'; inputC.min = '0'; inputC.step = '1'; inputC.value = cible;
  const inputCom = document.createElement('input'); inputCom.type = 'text'; inputCom.placeholder = 'Commentaire (optionnel)'; inputCom.value = comment;
  const btn = document.createElement('button'); btn.textContent = 'Supprimer'; btn.className = 'remove-btn'; btn.addEventListener('click', () => tr.remove());
  tdMat.appendChild(sel); tdC.appendChild(inputC); tdCom.appendChild(inputCom); tdRm.appendChild(btn);
  tr.appendChild(tdMat); tr.appendChild(tdC); tr.appendChild(tdCom); tr.appendChild(tdRm);
  tbody.appendChild(tr);
}
function addRestesRow(value = "", qty = "") {
  const tbody = document.getElementById('restesRows');
  const tr = document.createElement('tr');
  const tdMat = document.createElement('td'), tdQty = document.createElement('td'), tdRm = document.createElement('td');
  const sel = buildMatSelect(value);
  const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = '1'; input.value = qty;
  const btn = document.createElement('button'); btn.textContent = 'Supprimer'; btn.className = 'remove-btn'; btn.addEventListener('click', () => tr.remove());
  tdMat.appendChild(sel); tdQty.appendChild(input); tdRm.appendChild(btn);
  tr.appendChild(tdMat); tr.appendChild(tdQty); tr.appendChild(tdRm);
  tbody.appendChild(tr);
}

// ====== Preview Besoins J+1 ======
function ensurePreviewBox() {
  if (document.getElementById("besoinApercu")) return;
  const card = document.querySelector('#tab-reappro .card:nth-of-type(2)');
  if (!card) return;

  const addBtn = document.getElementById("btnAddBesoin");
  if (addBtn) addBtn.textContent = "Ajouter à la liste ci-dessous";

  const box = document.createElement('div');
  box.id = "besoinApercu";
  box.style.marginTop = "10px";
  box.style.padding = "10px";
  box.style.border = "1px dashed #ddd";
  box.style.borderRadius = "8px";
  box.className = "muted";
  box.innerHTML = "Aperçu : choisissez une équipe, une date, un matériel et une cible.";
  card.appendChild(box);

  const batch = document.createElement('div');
  batch.style.marginTop = "14px";
  batch.innerHTML = `
    <h3 style="margin:8px 0;">Besoins (multi-lignes) – pour l'équipe et la date ci-dessus</h3>
    <div class="table-wrap">
      <table>
        <thead><tr><th style="width:50%;">Matériel</th><th style="width:20%;">Cible</th><th style="width:25%;">Commentaire</th><th style="width:5%;">&nbsp;</th></tr></thead>
        <tbody id="besoinsRows"></tbody>
      </table>
    </div>
    <div class="toolbar" style="margin-top:8px;">
      <button id="btnBesoinsAddLine">+ Ajouter une ligne</button>
      <button id="btnBesoinsSave" class="secondary">Enregistrer ces besoins</button>
      <span id="besoinsMsg" class="muted"></span>
    </div>
    <p class="muted" style="margin-top:8px;">Astuce : utilisez la ligne du dessus pour ajouter rapidement un item, puis cliquez “Enregistrer ces besoins”.</p>
  `;
  card.appendChild(batch);
}

let _sheetjsPromise = null;
function ensureXLSXLoaded() {
  if (window.XLSX) return Promise.resolve();
  if (_sheetjsPromise) return _sheetjsPromise;
  _sheetjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Impossible de charger SheetJS."));
    document.head.appendChild(s);
  });
  return _sheetjsPromise;
}
function aoaToSheetWithWidths(headers, rows) {
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const colCount = headers.length;
  const widths = new Array(colCount).fill(8);
  data.forEach(r => {
    r.forEach((cell, idx) => {
      const len = (cell == null ? 0 : String(cell)).length;
      widths[idx] = Math.min(40, Math.max(widths[idx], len + 2));
    });
  });
  ws['!cols'] = widths.map(w => ({ wch: w }));
  return ws;
}

// ====== API helpers (cache) ======
async function getEquipeInfo(equipe) {
  if (_cacheEquipeInfo.has(equipe)) return _cacheEquipeInfo.get(equipe);
  const info = await apiGet({ get: "infoEquipe", equipe });
  _cacheEquipeInfo.set(equipe, info || {});
  return info || {};
}
async function getReste(zone, materiel, dateStr) {
  const r = await apiGet({ get: "reste", zone, materiel, date: dateStr || "" });
  if (r && typeof r === "object" && "quantite" in r) return r;
  return { quantite: 0, source: "Aucun" };
}
function debounce(fn, ms = 200) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

const updatePreview = debounce(async () => {
  const box = document.getElementById("besoinApercu"); if (!box) return;
  const d = document.getElementById("besoinDate")?.value || "";
  const eq = document.getElementById("besoinEquipe")?.value || "";
  const mat = document.getElementById("besoinMateriel")?.value || "";
  const cible = parseInt(document.getElementById("besoinCible")?.value || "0", 10) || 0;

  if (!eq || !mat || !d) { box.innerHTML = "Aperçu : choisissez une équipe, un matériel et une date."; return; }

  try {
    const info = await getEquipeInfo(eq);
    const zone = info?.zone || eq; // par défaut = nom d'équipe
    const reste = await getReste(zone, mat, d);
    const besoin = Math.max(0, (cible || 0) - (reste.quantite || 0));
    box.innerHTML = `
      <div><b>Équipe:</b> ${eq} • <b>Zone:</b> ${zone}</div>
      <div><b>Matériel:</b> ${mat}</div>
      <div><b>Reste (veille):</b> ${reste.quantite} <span class="muted">(${reste.source})</span></div>
      <div><b>Cible (demain):</b> ${cible || 0}</div>
      <div><b>Besoin estimé:</b> ${besoin}</div>
    `;
  } catch (e) { box.innerHTML = `<span class="error">Aperçu indisponible: ${e.message}</span>`; }
}, 200);

// ====== Restes UI (clôture J) ======
function ensureRestesUI() {
  if (document.getElementById("restesEquipe")) return;
  const card = document.querySelector('#tab-reappro .card:nth-of-type(3)');
  if (!card) return;

  const wrap = document.createElement('div');
  wrap.style.marginTop = "14px";
  wrap.innerHTML = `
    <h3 style="margin:8px 0;">Saisie détaillée des restes – par équipe (J)</h3>
    <div class="row-3">
      <div>
        <label>Équipe</label>
        <select id="restesEquipe"></select>
      </div>
      <div>
        <label>Zone (override si nécessaire)</label>
        <select id="restesZone"></select>
      </div>
      <div style="display:flex; align-items:end;">
        <button id="btnRestesCharger">Charger les restes actuels</button>
      </div>
    </div>

    <div class="table-wrap" style="margin-top:8px;">
      <table id="restesTable">
        <thead>
          <tr><th style="width:65%;">Matériel</th><th style="width:25%;">Quantité</th><th style="width:10%;">&nbsp;</th></tr>
        </thead>
        <tbody id="restesRows"></tbody>
      </table>
      <div class="toolbar" style="margin-top:8px;">
        <button id="btnRestesAddLine">+ Ajouter une ligne</button>
        <button id="btnRestesSave" class="secondary">Enregistrer les restes (équipe)</button>
        <span id="restesMsg" class="muted"></span>
      </div>
    </div>
    <p class="muted">Ces valeurs alimentent l’onglet <b>Restes Zones</b> à la date choisie (champ « Date à figer »). Si la zone n’est pas trouvée pour l’équipe, sélectionnez-la ici.</p>
  `;
  card.appendChild(wrap);
}

// ====== Listes (équipes / matériels / zones) ======
async function initLists() {
  // Équipes
  const eqSel = document.getElementById("besoinEquipe"); if (eqSel) { eqSel.innerHTML = ""; }
  const equipes = await apiGet({ get: "equipes" });
  (equipes || []).forEach(e => {
    const o1 = document.createElement("option"); o1.value = o1.textContent = e; eqSel && eqSel.appendChild(o1);
  });
  window._equipesCached = equipes || [];

  // Restes: équipes
  const eqRestes = document.getElementById("restesEquipe");
  if (eqRestes) {
    eqRestes.innerHTML = "";
    (equipes || []).forEach(e => { const o = document.createElement("option"); o.value = o.textContent = e; eqRestes.appendChild(o); });
  }

  // Matériels
  _matsList = await apiGet({ get: "materiels" }) || [];
  const matSel1 = document.getElementById("besoinMateriel");
  [matSel1].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = "";
    (_matsList || []).forEach(m => { const o = document.createElement("option"); o.value = o.textContent = m; sel.appendChild(o); });
  });

  // Zones
  _zonesList = await apiGet({ get: "zones" }) || [];
  const zoneSel1 = document.getElementById("legacyZone");
  const zoneSel2 = document.getElementById("etatZone");
  const zoneRestes = document.getElementById("restesZone");
  [zoneSel1, zoneSel2, zoneRestes].forEach(sel => {
    if (!sel) return; sel.innerHTML = "";
    (_zonesList || []).forEach(z => { const o = document.createElement("option"); o.value = o.textContent = z; sel.appendChild(o); });
  });

  // Par défaut : dans Clôture J, la zone prend le nom de l'équipe sélectionnée (au chargement)
  if (eqRestes && zoneRestes && eqRestes.value) {
    let opt = Array.from(zoneRestes.options).find(o => o.value === eqRestes.value);
    if (!opt) { opt = new Option(eqRestes.value, eqRestes.value); zoneRestes.add(opt, 0); }
    zoneRestes.value = eqRestes.value;
  }

  // Lignes vides par défaut
  if (document.getElementById('legacyItems')?.children.length === 0) addLegacyRow();
  if (document.getElementById('restesRows')?.children.length === 0) addRestesRow();
  if (document.getElementById('besoinsRows')?.children.length === 0) addBesoinsRow();
}

// ====== Export XLSX (Plan & Usage) ======
async function exportPlanXLSX(dateStr, plan) {
  await ensureXLSXLoaded();
  const wb = XLSX.utils.book_new();
  const hAgg = ["Date", "Matériel", "QuantitéÀPrélever"];
  const rowsAgg = (plan.agregat || []);
  const wsAgg = aoaToSheetWithWidths(hAgg, rowsAgg);
  XLSX.utils.book_append_sheet(wb, wsAgg, "Agrégat");

  const hDet = ["Date", "Équipe", "Zone", "Matériel", "RestesVeille", "CibleDemain", "BesoinRéappro"];
  const rowsDet = (plan.details || []);
  const wsDet = aoaToSheetWithWidths(hDet, rowsDet);
  XLSX.utils.book_append_sheet(wb, wsDet, "Détails");

  const fname = `plan_J+1_${dateStr || plan.date || "export"}.xlsx`;
  XLSX.writeFile(wb, fname);
}
async function exportUsageXLSX(rangeLabel, usageJson) {
  await ensureXLSXLoaded();
  const wb = XLSX.utils.book_new();
  const headers = usageJson.colonnes || ["Date", "Équipe", "Zone", "Matériel", "Restes(J-1)", "Entrées(J)", "Restes(J)", "Usage(J)"];
  const rows = usageJson.lignes || [];
  const ws = aoaToSheetWithWidths(headers, rows);
  XLSX.utils.book_append_sheet(wb, ws, "Usage");
  const fname = `usage_${rangeLabel}.xlsx`;
  XLSX.writeFile(wb, fname);
}

// ====== UI Usage journalier ======
function ensureUsageUI() {
  if (document.getElementById("usageCard")) return;
  const tab = document.querySelector('#tab-reappro');
  if (!tab) return;

  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'usageCard';
  card.innerHTML = `
    <h2>Usage journalier (consommation réelle)</h2>
    <div class="row-4">
      <div>
        <label>Du</label>
        <input type="date" id="usageFrom">
      </div>
      <div>
        <label>Au</label>
        <input type="date" id="usageTo">
      </div>
      <div>
        <label>Équipe (optionnel)</label>
        <select id="usageEquipe"><option value="">(toutes)</option></select>
      </div>
      <div>
        <label>Matériel (optionnel)</label>
        <select id="usageMateriel"><option value="">(tous)</option></select>
      </div>
    </div>
    <div class="toolbar" style="margin-top:8px;">
      <button id="btnCalculerUsage">Calculer l'usage</button>
      <button id="btnUsageToggle" class="secondary">Afficher tout</button>
      <button id="btnExportUsage" class="secondary" disabled>Exporter (XLSX)</button>
      <span id="usageMsg" class="muted"></span>
    </div>
    <div class="table-wrap" style="margin-top:8px;">
      <div id="usageTable" class="muted">Choisissez une période puis cliquez “Calculer l'usage”.</div>
    </div>
  `;
  tab.appendChild(card);
}

// ====== DOMContentLoaded ======
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  ensurePreviewBox();
  ensureRestesUI();
  ensureUsageUI();

  // Par défaut
  setTomorrow("besoinDate");
  setTomorrow("planDate");
  setToday("snapshotDate");
  setToday("legacyDate");

  // Usage : par défaut jour J uniquement
  const today = new Date();
  const tzToday = today.toISOString().slice(0, 10);
  const iFrom = document.getElementById("usageFrom"); if (iFrom) iFrom.value = tzToday;
  const iTo = document.getElementById("usageTo"); if (iTo) iTo.value = tzToday;

  // Quand on change d’équipe dans Clôture J, caler la zone sur le nom de l’équipe
  document.getElementById("restesEquipe")?.addEventListener("change", () => {
    const zSel = document.getElementById("restesZone");
    const eq = document.getElementById("restesEquipe").value;
    if (!zSel || !eq) return;
    let opt = Array.from(zSel.options).find(o => o.value === eq);
    if (!opt) { opt = new Option(eq, eq); zSel.add(opt, 0); }
    zSel.value = eq;
  });

  // Ping
  document.getElementById("btnPing")?.addEventListener("click", async () => {
    const s = document.getElementById("pingStatus"); if (s) s.textContent = "Test en cours...";
    try {
      const r = await apiGet({ test: "1" });
      if (s) { s.textContent = (r && r.status === "OK") ? "Connecté ✔" : "Réponse inattendue"; s.className = (r && r.status === "OK") ? "ok" : "error"; }
    } catch (e) { if (s) { s.textContent = "Erreur de connexion"; s.className = "error"; } }
  });

  // Besoins J+1 (unitaire) → ajoute à la liste
  document.getElementById("btnAddBesoin")?.addEventListener("click", () => {
    const mat = document.getElementById("besoinMateriel")?.value || "";
    const cible = (document.getElementById("besoinCible")?.value || "").trim();
    const com = document.getElementById("besoinComment")?.value || "";
    const msg = document.getElementById("besoinMsg");
    if (!mat || !cible) { msg.textContent = "Sélectionnez un matériel et saisissez une cible."; msg.className = "error"; return; }
    addBesoinsRow(mat, cible, com);
    document.getElementById("besoinCible").value = "";
    document.getElementById("besoinComment").value = "";
    msg.textContent = "Ligne ajoutée à la liste ci-dessous (non enregistrée)."; msg.className = "muted";
  });

  // Besoins J+1 (batch)
  document.getElementById("btnBesoinsAddLine")?.addEventListener("click", () => addBesoinsRow());
  document.getElementById("btnBesoinsSave")?.addEventListener("click", async () => {
    const d = document.getElementById('besoinDate')?.value;
    const eq = document.getElementById('besoinEquipe')?.value;
    const msg = document.getElementById('besoinsMsg');
    if (!d || !eq) { msg.textContent = "Choisissez d'abord la date et l'équipe."; msg.className = "error"; return; }

    const rows = Array.from(document.querySelectorAll('#besoinsRows tr')).map(tr => ({
      materiel: tr.querySelector('select')?.value || '',
      cible: parseInt(tr.querySelector('input[type=number]')?.value || '0', 10) || 0,
      commentaire: tr.querySelector('input[type=text]')?.value || ''
    })).filter(r => (r.materiel || "").trim() !== '' && r.cible > 0);
    if (rows.length === 0) { msg.textContent = "Ajoutez au moins une ligne (cible > 0)."; msg.className = "error"; return; }

    const seen = new Set(); const dups = [];
    rows.forEach(r => { if (seen.has(r.materiel)) dups.push(r.materiel); else seen.add(r.materiel); });
    if (dups.length) {
      msg.textContent = "Doublons dans la saisie : " + [...new Set(dups)].join(", ") + ". Supprimez-les avant d'enregistrer.";
      msg.className = "error"; return;
    }

    msg.textContent = "Vérifications..."; msg.className = "muted";
    try {
      const exist = await apiGet({ get: "besoinsEquipe", date: d, equipe: eq });
      const existSet = new Set((exist?.materiels || []).map(x => x.toString()));
      const inter = rows.map(r => r.materiel).filter(m => existSet.has(m));
      if (inter.length) {
        msg.textContent = "Déjà saisis pour cette date/équipe : " + inter.join(", ") + ". Retirez-les ou changez la date.";
        msg.className = "error"; return;
      }
    } catch (e) { /* ok */ }

    msg.textContent = "Enregistrement..."; msg.className = "muted";
    try {
      const payload = encodeURIComponent(JSON.stringify(rows));
      const r = await apiGet({ action: "addBesoinsBatch", date: d, equipe: eq, lignes: payload });
      msg.textContent = typeof r === "string" ? r : "Besoins enregistrés."; msg.className = "ok";
    } catch (e) { msg.textContent = "Erreur: " + e.message; msg.className = "error"; }
  });

  // Snapshot Restes Zones
  document.getElementById("btnSnapshot")?.addEventListener("click", async () => {
    const d = document.getElementById("snapshotDate")?.value, m = document.getElementById("snapshotMsg");
    m.textContent = "Snapshot en cours..."; m.className = "muted";
    if (!d) { m.textContent = "Choisissez une date."; m.className = "error"; return; }
    try { const r = await apiGet({ action: "snapshotRestes", date: d }); m.textContent = (typeof r === "string" ? r : "Snapshot effectué"); m.className = "ok"; }
    catch (e) { m.textContent = "Erreur: " + e.message; m.className = "error"; }
  });

  // Calcul du plan J+1
  document.getElementById("btnCalculerPlan")?.addEventListener("click", async () => {
    const d = document.getElementById("planDate")?.value;
    const a = document.getElementById("aggContainer");
    const t = document.getElementById("detailContainer");
    const b = document.getElementById("btnGenererMouvements");
    const exportBtn = document.getElementById("btnExportPlan");

    LAST_PLAN = null;
    exportBtn && (exportBtn.disabled = true);

    if (!d) { a.textContent = "Veuillez sélectionner une date."; t.textContent = ""; b.disabled = true; return; }
    a.textContent = "Calcul en cours..."; t.textContent = ""; b.disabled = true;

    let meta = document.getElementById('planMeta');
    if (!meta) { meta = document.createElement('p'); meta.id = 'planMeta'; meta.className = 'muted'; a.parentNode.insertBefore(meta, a); }

    try {
      const r = await apiGet({ plan: "reappro", date: d });
      if (r && r.error) { a.textContent = "Erreur: " + r.error; t.textContent = ""; meta.textContent = ""; return; }
      meta.textContent = r && (r.veille || r.dateVeille) ? `Restes utilisés : ${r.veille || r.dateVeille} (veille)` : "";

      if (r && r.agregat) {
        if (r.agregat.length) { a.innerHTML = toTable(["Date", "Matériel", "Quantité À Prélever"], r.agregat); b.disabled = false; }
        else { a.textContent = "Aucun besoin agrégé pour cette date."; }
      } else { a.textContent = "Aucune donnée."; }

      if (r && r.details) {
        if (r.details.length) { t.innerHTML = toTable(["Date", "Équipe", "Zone", "Matériel", "Restes Veille", "Cible Demain", "Besoin Réappro"], r.details); }
        else { t.textContent = "Aucune ligne de besoins pour cette date (vérifiez la saisie)."; }
      } else { t.textContent = ""; }

      LAST_PLAN = r || null;
      if (exportBtn) exportBtn.disabled = !(r && ((r.agregat && r.agregat.length) || (r.details && r.details.length)));
    } catch (e) {
      a.textContent = "Erreur: " + e.message; t.textContent = ""; meta.textContent = "";
    }
  });

  // Génération des mouvements VC → Bibliothèque
  document.getElementById("btnGenererMouvements")?.addEventListener("click", async () => {
    const d = document.getElementById("planDate")?.value, a = document.getElementById("aggContainer"); if (!d) return;
    a.textContent = "Génération des mouvements en cours...";
    try { const r = await apiGet({ action: "genererReappro", date: d }); a.innerHTML = `<p class="ok">${typeof r === "string" ? r : JSON.stringify(r)}</p>`; }
    catch (e) { a.innerHTML = `<p class="error">Erreur: ${e.message}</p>`; }
  });

  // Bouton Export Plan
  const genBtn = document.getElementById("btnGenererMouvements");
  if (genBtn && !document.getElementById("btnExportPlan")) {
    const exportBtn = document.createElement("button");
    exportBtn.id = "btnExportPlan";
    exportBtn.className = "secondary";
    exportBtn.textContent = "Exporter (XLSX)";
    exportBtn.disabled = true;
    genBtn.parentNode.insertBefore(exportBtn, genBtn);
    exportBtn.addEventListener("click", async () => {
      if (!LAST_PLAN) return;
      const d = document.getElementById("planDate")?.value || LAST_PLAN.date || "plan";
      try { await exportPlanXLSX(d, LAST_PLAN); }
      catch (e) { alert("Export XLSX impossible: " + e.message); }
    });
  }

  // Distribuer vers équipes (alimente Répartition Journalière)
  if (genBtn && !document.getElementById("btnDistribuerPlan")) {
    const distribBtn = document.createElement("button");
    distribBtn.id = "btnDistribuerPlan";
    distribBtn.textContent = "Distribuer vers équipes";
    distribBtn.className = "secondary";
    genBtn.parentNode.insertBefore(distribBtn, genBtn.nextSibling);

    distribBtn.addEventListener("click", async () => {
      const d = document.getElementById("planDate")?.value;
      const a = document.getElementById("aggContainer");
      if (!d) { alert("Choisis une date de plan d'abord."); return; }
      try {
        a.textContent = "Distribution en cours...";
        const r = await apiGet({ action: "distribuerPlan", date: d });
        a.innerHTML = `<p class="${String(r).startsWith('0 ligne') ? 'error' : 'ok'}">${typeof r === "string" ? r : JSON.stringify(r)}</p>`;
      } catch (e) {
        a.innerHTML = `<p class="error">Erreur distribution: ${e.message}</p>`;
      }
    });
  }

  // Verrou snapshot (switch)
  const snapshotBtn = document.getElementById("btnSnapshot");
  if (snapshotBtn && !document.getElementById("snapshotLock")) {
    const wrap = document.createElement("div");
    wrap.style.display = "flex"; wrap.style.alignItems = "center"; wrap.style.gap = "8px"; wrap.style.marginLeft = "8px";

    const chk = document.createElement("input");
    chk.type = "checkbox"; chk.id = "snapshotLock";
    const lbl = document.createElement("label"); lbl.htmlFor = "snapshotLock"; lbl.className = "muted"; lbl.textContent = "Verrou snapshot";

    snapshotBtn.parentNode.insertBefore(wrap, snapshotBtn.nextSibling);
    wrap.appendChild(chk); wrap.appendChild(lbl);

    apiGet({ get: "snapshotLock" }).then(r => { chk.checked = r && r.lock === "1"; });
    chk.addEventListener("change", async () => {
      try { await apiGet({ action: "setSnapshotLock", on: chk.checked ? "1" : "0" }); }
      catch (e) { chk.checked = !chk.checked; alert("Impossible de changer le verrou: " + e.message); }
    });
  }

  // Legacy multi-matériels
  document.getElementById('btnLegacyAddLine')?.addEventListener('click', () => addLegacyRow());
  document.getElementById('btnLegacySave')?.addEventListener('click', async () => {
    const msg = document.getElementById('legacyMsg'); msg.textContent = "Enregistrement..."; msg.className = "muted";
    const d = document.getElementById("legacyDate")?.value, type = document.getElementById("legacyType")?.value, feuille = document.getElementById("legacyFeuille")?.value, zone = document.getElementById("legacyZone")?.value;
    const rows = Array.from(document.querySelectorAll('#legacyItems tr')).map(tr => ({
      materiel: tr.querySelector('select')?.value || '',
      quantite: parseInt(tr.querySelector('input')?.value || '0', 10) || 0
    })).filter(r => r.materiel && r.quantite > 0);

    if (!d || !type || !feuille || rows.length === 0) { msg.textContent = "Renseignez date, type, feuille et au moins un matériel/quantité."; msg.className = 'error'; return; }

    try {
      const payload = encodeURIComponent(JSON.stringify(rows));
      const r = await apiGet({ action: 'addLegacyBatch', date: d, type: type, feuilleCible: feuille, zone: zone, lignes: payload });
      msg.textContent = (typeof r === 'string' ? r : 'OK'); msg.className = 'ok';
    } catch (e) { msg.textContent = 'Erreur: ' + e.message; msg.className = 'error'; }
  });

  // État des stocks par zone (onglet avancé)
  document.getElementById("btnChargerEtat")?.addEventListener("click", async () => {
    const z = document.getElementById("etatZone")?.value;
    const cont = document.getElementById("etatTable");
    if (!z) { cont.textContent = "Choisissez une zone."; return; }
    cont.textContent = "Chargement...";
    try {
      const r = await apiGet({ etat: "1", zone: z });
      if (Array.isArray(r)) {
        const headers = r[0] || ["Matériel", "Quantité"];
        const rows = r.slice(1) || [];
        cont.innerHTML = rows.length ? toTable(headers, rows) : "Aucun article pour cette zone.";
      } else if (r && r.error) {
        cont.innerHTML = `<p class="error">${r.error}</p>`;
      } else {
        cont.textContent = "Réponse inattendue.";
      }
    } catch (e) { cont.textContent = "Erreur: " + e.message; }
  });

  // Restes Équipe
  document.getElementById('btnRestesAddLine')?.addEventListener('click', () => addRestesRow());
  document.getElementById('btnRestesCharger')?.addEventListener('click', async () => {
    const d = document.getElementById('snapshotDate')?.value;
    const eq = document.getElementById('restesEquipe')?.value;
    const zSel = document.getElementById('restesZone');
    const msg = document.getElementById('restesMsg');
    const tbody = document.getElementById('restesRows');
    if (!d || !eq) { msg.textContent = "Choisissez d'abord la date et l'équipe."; msg.className = "error"; return; }
    msg.textContent = "Chargement..."; msg.className = "muted";
    try {
      const r = await apiGet({ get: "restesEquipe", date: d, equipe: eq, zone: zSel?.value || "" });
      tbody.innerHTML = "";
      const lignes = (r && Array.isArray(r.lignes)) ? r.lignes : [];
      if (r && r.zone && zSel) { zSel.value = r.zone; }
      if (lignes.length === 0) addRestesRow(); else lignes.forEach(([m, q]) => addRestesRow(m, q));
      msg.textContent = r?.zone ? `Zone: ${r.zone} • ${lignes.length} ligne(s)` : `${lignes.length} ligne(s) chargée(s)`; msg.className = "ok";
    } catch (e) { msg.textContent = "Erreur: " + e.message; msg.className = "error"; }
  });
  document.getElementById('btnRestesSave')?.addEventListener('click', async () => {
    const d = document.getElementById('snapshotDate')?.value;
    const eq = document.getElementById('restesEquipe')?.value;
    const zSel = document.getElementById('restesZone');
    const msg = document.getElementById('restesMsg');
    if (!d || !eq) { msg.textContent = "Choisissez d'abord la date et l'équipe."; msg.className = "error"; return; }
    const rows = Array.from(document.querySelectorAll('#restesRows tr')).map(tr => ({
      materiel: tr.querySelector('select')?.value || '',
      quantite: parseInt(tr.querySelector('input')?.value || '0', 10) || 0
    })).filter(r => (r.materiel || "").trim() !== '');
    if (rows.length === 0) { msg.textContent = "Ajoutez au moins une ligne."; msg.className = "error"; return; }
    msg.textContent = "Enregistrement..."; msg.className = "muted";
    try {
      const payload = encodeURIComponent(JSON.stringify(rows));
      const r = await apiGet({ action: "saveRestesEquipe", date: d, equipe: eq, zone: zSel?.value || "", lignes: payload });
      msg.textContent = typeof r === "string" ? r : "Restes enregistrés."; msg.className = "ok";
    } catch (e) { msg.textContent = "Erreur: " + e.message; msg.className = "error"; }
  });

  // Liens d’aperçu (mise à jour dynamique)
  ["besoinDate", "besoinEquipe", "besoinMateriel", "besoinCible"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", updatePreview);
    document.getElementById(id)?.addEventListener("input", updatePreview);
  });

  // ====== Usage: remplir listes après init ======
  initLists().then(() => {
    const eqSel = document.getElementById("usageEquipe");
    if (eqSel) {
      eqSel.innerHTML = '<option value="">(toutes)</option>';
      (window._equipesCached || []).forEach(e => { const o = document.createElement('option'); o.value = o.textContent = e; eqSel.appendChild(o); });
    }
    const matSel = document.getElementById("usageMateriel");
    if (matSel) {
      matSel.innerHTML = '<option value="">(tous)</option>';
      (_matsList || []).forEach(m => { const o = document.createElement('option'); o.value = o.textContent = m; matSel.appendChild(o); });
    }
    updatePreview();
  });

  // Usage: Calcul
  document.getElementById("btnCalculerUsage")?.addEventListener("click", async () => {
    const from = document.getElementById("usageFrom")?.value;
    const to = document.getElementById("usageTo")?.value || from;
    const eq = document.getElementById("usageEquipe")?.value || "";
    const mat = document.getElementById("usageMateriel")?.value || "";
    const msg = document.getElementById("usageMsg");
    const tbl = document.getElementById("usageTable");
    const exportBtn = document.getElementById("btnExportUsage");

    if (!from) { msg.textContent = "Sélectionnez au moins une date de début."; msg.className = "error"; return; }
    msg.textContent = "Calcul en cours..."; msg.className = "muted"; tbl.textContent = "";

    try {
      const r = await apiGet({ usage: "journalier", from, to, equipe: eq, materiel: mat });
      if (r && r.error) { msg.textContent = "Erreur: " + r.error; msg.className = "error"; tbl.textContent = ""; exportBtn.disabled = true; return; }

      // Filtrage UX : mode compact (équipes & jour J) si USAGE_SHOW_ALL = false
      let rows = r?.lignes || [];
      if (!USAGE_SHOW_ALL) {
        const dJ = document.getElementById("usageFrom")?.value;
        rows = rows.filter(x => (x[0] === dJ));                 // jour J uniquement
        const setEquipes = new Set(window._equipesCached || []);
        rows = rows.filter(x => setEquipes.has(x[1]));          // uniquement les équipes connues
      }

      const headers = r?.colonnes || ["Date","Équipe","Zone","Matériel","Restes(J-1)","Entrées(J)","Restes(J)","Usage(J)"];
      tbl.innerHTML = rows.length ? toTable(headers, rows) : "Aucune donnée pour la période/filtre sélectionné.";
      const modeLabel = USAGE_SHOW_ALL ? "toutes lignes" : "équipes • J";
      msg.textContent = rows.length ? `${rows.length} ligne(s) affichée(s) • ${modeLabel}` : `0 ligne • ${modeLabel}`;
      msg.className = rows.length ? "ok" : "muted";
      LAST_USAGE = { ...r, lignes: rows, colonnes: headers };
      exportBtn.disabled = rows.length === 0;
    } catch (e) {
      msg.textContent = "Erreur: " + e.message; msg.className = "error"; tbl.textContent = ""; LAST_USAGE = null; exportBtn.disabled = true;
    }
  });

  // Usage: Toggle "Afficher tout"
  document.getElementById("btnUsageToggle")?.addEventListener("click", () => {
    USAGE_SHOW_ALL = !USAGE_SHOW_ALL;
    const btn = document.getElementById("btnUsageToggle");
    btn.textContent = USAGE_SHOW_ALL ? "Afficher équipes • J" : "Afficher tout";
    document.getElementById("btnCalculerUsage")?.click();
  });

  // Usage: Export XLSX (reprend la vue affichée)
  document.getElementById("btnExportUsage")?.addEventListener("click", async () => {
    if (!LAST_USAGE) return;
    const from = document.getElementById("usageFrom")?.value || LAST_USAGE.from || "from";
    const to = document.getElementById("usageTo")?.value || LAST_USAGE.to || "to";
    const label = (from === to) ? from : `${from}_to_${to}`;
    try { await exportUsageXLSX(label, LAST_USAGE); }
    catch (e) { alert("Export XLSX impossible : " + e.message); }
  });

  // PWA
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js');
});
