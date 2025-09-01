/* =====================
 *  ONU — Suivi Stock (Front) — Trebuchet + Orange Pelichet
 *  ===================== */

/***********************
 *  Config API
 ***********************/
const API_BASE_URL = "https://script.google.com/macros/s/AKfycbwO0P3Yo5kw9PPriJPXzUMipBrzlGTR_r-Ff6OyEUnsNu-I9q-rESbBq7l2m6KLA3RJ/exec"; // ← remplace si besoin

/***********************
 *  Helpers
 ***********************/
function escapeHtml(x) {
  return String(x ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function toTable(headers, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "Aucune donnée.";
  const thead = `<thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}
async function apiGet(params) {
  const url = new URL(API_BASE_URL);
  Object.entries(params||{}).forEach(([k,v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString(), { method: "GET" });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0,200)}`);
  try { return JSON.parse(text); } catch { throw new Error(text); }
}
async function apiText(params) {
  const url = new URL(API_BASE_URL);
  Object.entries(params||{}).forEach(([k,v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString(), { method: "GET" });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0,200)}`);
  return text;
}
function setDateDefault(input, deltaDays=0) {
  const d = new Date(); d.setDate(d.getDate()+deltaDays);
  input.value = d.toISOString().slice(0,10);
}
const collFR = new Intl.Collator('fr', { sensitivity:'base', numeric:true });

/***********************
 *  Tabs
 ***********************/
function initTabs() {
  document.querySelectorAll(".tab-button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const tabId = btn.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach(p=>p.classList.add("hidden"));
      document.getElementById(tabId)?.classList.remove("hidden");
      document.querySelectorAll(".tab-button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

/* ===== Étapes visuelles Réappro ===== */
function injectStepStyles() {
  if (document.getElementById("step-styles")) return;
  const s = document.createElement("style");
  s.id = "step-styles";
  s.textContent = `
    .step-block { margin: 18px 0 10px; }
    .step-title { display:flex; align-items:center; gap:10px; font-weight:700; font-size:1.05rem; font-family: Trebuchet MS, Trebuchet, Arial, sans-serif; }
    .step-badge { display:inline-grid; place-items:center; width:26px; height:26px; border-radius:50%;
                  background:#f16e00; color:#fff; font-weight:800; font-size:0.95rem; flex:0 0 26px; }
    .step-sub { margin:6px 0 0 36px; font-size:0.9rem; opacity:0.85; font-family: Trebuchet MS, Trebuchet, Arial, sans-serif; }
  `;
  document.head.appendChild(s);
}
function insertStepHeader(anchorEl, num, title, sub) {
  if (!anchorEl) return;
  if (anchorEl.previousElementSibling && anchorEl.previousElementSibling.classList?.contains("step-block")) return;
  const wrap = document.createElement("div");
  wrap.className = "step-block";
  wrap.innerHTML = `
    <div class="step-title">
      <span class="step-badge">${num}</span>
      <span>${escapeHtml(title)}</span>
    </div>
    ${sub ? `<div class="step-sub">${escapeHtml(sub)}</div>` : ""}
  `;
  anchorEl.insertAdjacentElement("beforebegin", wrap);
}
function addStepHeaders() {
  injectStepStyles();
  const a1 = document.getElementById("b_j1");     // Besoins J+1
  const a2 = document.getElementById("c_date");   // Clôture J
  const a3 = document.getElementById("r_jour1");  // Plan J+1

  insertStepHeader(
    a1,
    1,
    "Besoins J+1 — Saisie",
    "Saisir les besoins par équipe et par matériel pour le jour J+1 (la date par défaut est demain)."
  );
  insertStepHeader(
    a2,
    2,
    "Clôture J — Restes d'équipe",
    "Enregistrer les restes de fin de journée (J). La zone reprend automatiquement la valeur de l’équipe."
  );
  insertStepHeader(
    a3,
    3,
    "Plan J+1 — Calcul / Mouvements",
    "Calculer le plan (besoin = cible − reste), puis générer les mouvements Voie Creuse → Bibliothèque et Bibliothèque → Équipes."
  );
}

/***********************
 *  Référentiels
 ***********************/
let REF_EQ = [];
let REF_MAT = [];
const QTY_SUGGESTIONS = [1,2,5,10,20,50,100];

function ensureDatalists() {
  // datalist pour quantités
  if (!document.getElementById("qty_options")) {
    const dl = document.createElement("datalist");
    dl.id = "qty_options";
    dl.innerHTML = QTY_SUGGESTIONS.map(n=>`<option value="${n}"></option>`).join("");
    document.body.appendChild(dl);
  }
  // datalist pour zones (recyclée pour #c_zone)
  if (!document.getElementById("zone_options")) {
    const dl = document.createElement("datalist");
    dl.id = "zone_options";
    document.body.appendChild(dl);
  }
  const zoneInput = document.getElementById("c_zone");
  if (zoneInput) zoneInput.setAttribute("list", "zone_options");
}

function setOptions(selectEl, options, keepValue=true) {
  if (!selectEl) return;
  const old = keepValue ? selectEl.value : "";
  selectEl.innerHTML = "";
  (options||[]).forEach(v=>{
    const opt = document.createElement("option");
    opt.value = v; opt.textContent = v;
    selectEl.appendChild(opt);
  });
  if (keepValue && old && options.includes(old)) selectEl.value = old;
}

/** Met à jour tous les selects de matériel dans Besoins et Clôture */
function rebuildMaterialSelectsInTable() {
  document.querySelectorAll("select.b_mat, select.c_mat").forEach(sel=>{
    const old = sel.value;
    sel.innerHTML = `<option value="">— choisir —</option>` +
      REF_MAT.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
    if (old && REF_MAT.includes(old)) sel.value = old;
  });
}

function refreshZoneDatalist() {
  const dl = document.getElementById("zone_options");
  if (!dl) return;
  dl.innerHTML = (REF_EQ||[]).map(z=>`<option value="${escapeHtml(z)}"></option>`).join("");
}

async function loadReferentials() {
  ensureDatalists();

  // Tentative principale : endpoints dédiés
  let eq = [], mat = [];
  try { eq = await apiGet({ get: "equipes" }) || []; } catch {}
  try { mat = await apiGet({ get: "materiels" }) || []; } catch {}

  // Fallback si vide : zones -> équipes
  if (!eq.length) {
    try {
      const zones = await apiGet({ get: "zones" }) || [];
      const ignore = new Set(["Voie Creuse","Bibliothèque","B26","Compactus","Reading Room 1","Reading Room 2","reading room 1","reading room 2","compactus","b26"]);
      eq = (zones||[]).filter(z=>!ignore.has(z));
    } catch {}
  }

  // Tri + dédoublonnage
  eq = Array.from(new Set(eq)).sort(collFR.compare);
  mat = Array.from(new Set(mat)).sort(collFR.compare);

  REF_EQ = eq;
  REF_MAT = mat;

  // Alimente les selects visibles
  setOptions(document.getElementById("b_equipe"), REF_EQ);
  setOptions(document.getElementById("c_equipe"), REF_EQ);
  rebuildMaterialSelectsInTable();
  refreshZoneDatalist();

  console.log("Référentiels chargés:", { equipes: REF_EQ.length, materiels: REF_MAT.length });
}

/***********************
 *  Besoins J+1 — multi-lignes
 ***********************/
function b_addRow(matDefault="", cibleDefault="") {
  const tbody = document.querySelector("#b_table tbody");
  const tr = document.createElement("tr");

  // Matériel (select)
  const tdMat = document.createElement("td");
  const sel = document.createElement("select");
  sel.className = "b_mat";
  sel.innerHTML = `<option value="">— choisir —</option>` + REF_MAT.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if (matDefault) sel.value = matDefault;
  tdMat.appendChild(sel);

  // Cible (input number + datalist)
  const tdCible = document.createElement("td");
  const inp = document.createElement("input");
  inp.type = "number"; inp.min = "0"; inp.step = "1"; inp.value = cibleDefault || "";
  inp.className = "b_cible";
  inp.setAttribute("list","qty_options");
  tdCible.appendChild(inp);

  // Commentaire
  const tdCom = document.createElement("td");
  const txt = document.createElement("input");
  txt.type = "text"; txt.placeholder = "commentaire (facultatif)";
  txt.className = "b_comment";
  tdCom.appendChild(txt);

  // Supprimer ligne
  const tdDel = document.createElement("td");
  const btn = document.createElement("button");
  btn.textContent = "✕"; btn.className = "secondary";
  btn.addEventListener("click", ()=> tr.remove());
  tdDel.appendChild(btn);

  tr.append(tdMat, tdCible, tdCom, tdDel);
  tbody.appendChild(tr);
}

async function b_save() {
  const dateJ1 = document.getElementById("b_j1").value;
  const equipe = document.getElementById("b_equipe").value;
  if (!dateJ1) return alert("Indique la date J+1.");
  if (!equipe) return alert("Choisis une équipe.");

  const rows = Array.from(document.querySelectorAll("#b_table tbody tr"));
  const lignes = [];
  const seenKey = new Set();
  for (const tr of rows) {
    const mat = tr.querySelector(".b_mat")?.value || "";
    const cible = parseInt(tr.querySelector(".b_cible")?.value || "0", 10) || 0;
    const commentaire = tr.querySelector(".b_comment")?.value || "";
    if (!mat || cible <= 0) continue;
    const key = `${equipe}||${dateJ1}||${mat}`.toLowerCase();
    if (seenKey.has(key)) { alert(`Doublon: ${mat} déjà saisi pour ${equipe}`); return; }
    seenKey.add(key);
    lignes.push({ materiel: mat, cible, commentaire });
  }
  if (!lignes.length) return alert("Ajoute au moins une ligne (matériel + quantité).");

  const msg = await apiText({ action: "addBesoinsBatch", date: dateJ1, equipe, lignes: JSON.stringify(lignes) });
  alert(msg);
  document.querySelector("#b_table tbody").innerHTML = "";
  await loadReferentials(); // maj listes après saisie
}

/***********************
 *  Plan J+1 — calcul & mouvements
 ***********************/
async function loadPlan(dateJ1) {
  const r = await apiGet({ plan: "reappro", date: dateJ1 });
  const det = (r.details||[]).map(x=>[x[1], x[2], x[3], x[4], x[5], x[6]]);
  document.getElementById("r_details").innerHTML =
    toTable(["Équipe","Zone","Matériel","Reste Veille","Cible","Besoin"], det);
  const agg = (r.agregat||[]).map(x=>[x[1], x[2]]);
  document.getElementById("r_agregat").innerHTML =
    toTable(["Matériel","Quantité"], agg);
}
async function actionGenererVCAversBiblio(dateJ1) {
  const t = await apiText({ action: "genererReappro", date: dateJ1 });
  alert(t);
  await loadReferentials();
}
async function actionDistribuerBiblioEquipes(dateJ1) {
  const t = await apiText({ action: "distribuerPlan", date: dateJ1 });
  alert(t);
  await loadReferentials();
}

/***********************
 *  Clôture J — Restes (éditeur multi-lignes)
 ***********************/
function setupClotureEditor() {
  const ta = document.getElementById("c_csv");
  if (!ta) return;

  // Cache l’ancien textarea
  ta.style.display = "none";

  // Conteneur éditeur
  const wrap = document.createElement("div");
  wrap.id = "c_editor";
  wrap.className = "table-wrap scroll-x";
  wrap.style.marginTop = "10px";

  // Toolbar au-dessus (bouton ajouter)
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const addBtn = document.createElement("button");
  addBtn.id = "c_add_row";
  addBtn.className = "secondary";
  addBtn.textContent = "+ Ajouter une ligne";
  toolbar.appendChild(addBtn);

  // Table
  const table = document.createElement("table");
  table.id = "c_table";
  table.innerHTML = `
    <thead>
      <tr>
        <th style="min-width:220px;">Matériel</th>
        <th style="min-width:120px;">Quantité</th>
        <th>—</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  // Insert DOM
  ta.insertAdjacentElement("afterend", wrap);
  wrap.insertAdjacentElement("beforebegin", toolbar);
  wrap.appendChild(table);

  // Action bouton
  addBtn.addEventListener("click", ()=> c_addRow());
}

function c_addRow(matDefault="", qtyDefault="") {
  const tbody = document.querySelector("#c_table tbody");
  const tr = document.createElement("tr");

  // Matériel (select)
  const tdMat = document.createElement("td");
  const sel = document.createElement("select");
  sel.className = "c_mat";
  sel.innerHTML = `<option value="">— choisir —</option>` +
    REF_MAT.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if (matDefault) sel.value = matDefault;
  tdMat.appendChild(sel);

  // Quantité (number + datalist)
  const tdQty = document.createElement("td");
  const qty = document.createElement("input");
  qty.type = "number"; qty.min = "0"; qty.step = "1"; qty.value = qtyDefault || "";
  qty.className = "c_qty";
  qty.setAttribute("list","qty_options");
  tdQty.appendChild(qty);

  // Supprimer ligne
  const tdDel = document.createElement("td");
  const btn = document.createElement("button");
  btn.textContent = "✕"; btn.className = "secondary";
  btn.addEventListener("click", ()=> tr.remove());
  tdDel.appendChild(btn);

  tr.append(tdMat, tdQty, tdDel);
  tbody.appendChild(tr);
}

function c_collectLines() {
  const rows = Array.from(document.querySelectorAll("#c_table tbody tr"));
  const lignes = [];
  for (const tr of rows) {
    const mat = tr.querySelector(".c_mat")?.value || "";
    const q   = parseInt(tr.querySelector(".c_qty")?.value || "0", 10) || 0;
    if (!mat || q < 0) continue;
    lignes.push({ materiel: mat, quantite: q });
  }
  return lignes;
}

function parseTextLinesToRows(txt) {
  // Fallback si jamais on veut encore coller "Matériel, Quantité"
  const out = [];
  (txt||"").split(/\r?\n/).forEach(line=>{
    const m = line.split(",");
    if (m.length >= 1) {
      const mat = (m[0]||"").trim();
      const q   = m.length >= 2 ? parseInt((m[1]||"").trim(),10)||0 : 0;
      if (mat) out.push({materiel: mat, quantite: q});
    }
  });
  return out;
}

async function saveRestes() {
  const d = document.getElementById("c_date").value;
  const equipe = document.getElementById("c_equipe").value;
  const zone = (document.getElementById("c_zone").value || equipe);

  // d’abord, on récupère les lignes de l’éditeur
  let lignes = c_collectLines();

  // fallback: si pas de ligne dans le tableau, on lit le textarea caché (compat)
  if (!lignes.length) {
    lignes = parseTextLinesToRows(document.getElementById("c_csv").value);
  }

  if (!d || !equipe || !lignes.length) return alert("Complète la date, l’équipe et au moins une ligne.");
  const t = await apiText({ action: "saveRestesEquipe", date: d, equipe, zone, lignes: JSON.stringify(lignes) });
  alert(t);
  // Reset de l’éditeur
  const tbody = document.querySelector("#c_table tbody");
  if (tbody) tbody.innerHTML = "";
  await loadReferentials();
}

/***********************
 *  Dashboard (+ KPIs)
 ***********************/
async function ensureXLSXLoaded() {
  if (window.XLSX) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js";
    s.onload = res; s.onerror = () => rej(new Error("CDN XLSX introuvable"));
    document.head.appendChild(s);
  });
}
function renderBlock(elId, block) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!block) { el.textContent = "Aucune donnée."; return; }
  const headers = block.headers || [];
  const rows = block.rows || [];
  el.innerHTML = rows.length ? toTable(headers, rows) : "Aucune donnée.";
}
function kpiTotalFromBlock(block){
  if (!block) return 0;
  if (typeof block.total === "number") return block.total;
  const rows = block.rows || [];
  return rows.reduce((s,r)=> s + (parseInt(r?.[1],10)||0), 0);
}
async function apiGetDashboard(J, J1, F, T) {
  try {
    return await apiGet({ dashboard: "1", date: J, jplus1: J1, from: F, to: T });
  } catch (e) {
    const msg = String(e && e.message || e);
    if (msg.includes("Paramètre")) {
      return await apiGet({ dashboard: "summary", j: J, j1: J1, from: F, to: T });
    }
    throw e;
  }
}
async function loadDashboard() {
  const J  = document.getElementById("dashJ").value;
  const J1 = document.getElementById("dashJ1").value;
  const F  = document.getElementById("dashFrom").value;
  const T  = document.getElementById("dashTo").value;
  const msg = document.getElementById("dashMsg");
  msg.textContent = "Chargement…"; msg.className = "muted";
  try {
    const r = await apiGetDashboard(J, J1, F, T);
    renderBlock("dashStockVC", r.stockVC);
    renderBlock("dashEntBibJ", r.entreesBiblioJour);
    renderBlock("dashEntBibJ1Plan", r.entreesBiblioJplus1_plan);
    renderBlock("dashEntBibJ1Real", r.entreesBiblioJplus1_reelles);
    renderBlock("dashRepartJ", r.repartJourEquipes);
    renderBlock("dashBesoinsEqJ1", r.besoinsJplus1Equipes);
    renderBlock("dashUsage", r.usagePivot);

    document.getElementById("kpi-vc").textContent   = kpiTotalFromBlock(r.stockVC);
    document.getElementById("kpi-bibj").textContent = kpiTotalFromBlock(r.entreesBiblioJour);
    document.getElementById("kpi-repj").textContent = kpiTotalFromBlock(r.repartJourEquipes);

    msg.textContent = `J=${r.dates?.J} • J+1=${r.dates?.J1} • Usage: ${r.dates?.from}→${r.dates?.to}`;
    msg.className = "ok";
    window.__DASH_LAST__ = r;
  } catch(e) {
    msg.textContent = "Erreur: " + e.message;
    msg.className = "error";
  }
}
async function exportDashboardXLSX() {
  const r = window.__DASH_LAST__;
  if (!r) { alert("Charge d’abord le Dashboard."); return; }
  await ensureXLSXLoaded();
  const wb = XLSX.utils.book_new();
  const add = (name, blk)=>{
    if (!blk) return;
    const data = [ (blk.headers||[]), ...(blk.rows||[]) ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0,31));
  };
  add("Stock_VC", r.stockVC);
  add("EntreesBib_J", r.entreesBiblioJour);
  add("EntreesBib_J+1_plan", r.entreesBiblioJplus1_plan);
  add("EntreesBib_J+1_reel", r.entreesBiblioJplus1_reelles);
  add("Repartition_J", r.repartJourEquipes);
  add("Besoins_J+1", r.besoinsJplus1Equipes);
  add("Usage", r.usagePivot);
  const J = document.getElementById("dashJ").value || "J";
  XLSX.writeFile(wb, `dashboard_${J}.xlsx`);
}

/***********************
 *  Avancé
 ***********************/
async function loadEtatParZone() {
  const z = document.getElementById("a_zone").value;
  if (!z) { alert("Indique une zone."); return; }
  const rows = await apiGet({ etat: "1", zone: z });
  if (Array.isArray(rows) && rows.length && Array.isArray(rows[0])) {
    const headers = rows[0];
    const data = rows.slice(1);
    document.getElementById("a_etat_table").innerHTML = toTable(headers, data);
  } else if (rows && rows.error) {
    document.getElementById("a_etat_table").textContent = "Erreur: " + rows.error;
  } else {
    document.getElementById("a_etat_table").textContent = "Aucune donnée.";
  }
}
async function ensureXLSXLoadedAvance(){ return ensureXLSXLoaded(); }
async function exportAvanceXLSX() {
  await ensureXLSXLoadedAvance();
  const wb = XLSX.utils.book_new();
  const host = document.getElementById("a_etat_table");
  if (host && host.querySelector("table")) {
    const headers = Array.from(host.querySelectorAll("thead th")).map(th=>th.textContent);
    const rows = Array.from(host.querySelectorAll("tbody tr")).map(tr =>
      Array.from(tr.querySelectorAll("td")).map(td=>td.textContent)
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Etat_par_zone");
  }
  XLSX.writeFile(wb, "avance_export.xlsx");
}
async function toggleSnapshotLock(ev) {
  const on = ev.target.checked ? "1" : "0";
  const t = await apiText({ action: "setSnapshotLock", on });
  alert(t);
}
async function doSnapshot() {
  const today = new Date().toISOString().slice(0,10);
  const t = await apiText({ action: "snapshotRestes", date: today });
  alert(t);
}

/***********************
 *  Boot
 ***********************/
document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  addStepHeaders();          // ← Étapes 1/2/3 visibles
  ensureDatalists();

  // Dates par défaut
  setDateDefault(document.getElementById("b_j1"), 1);
  setDateDefault(document.getElementById("r_jour"), 0);
  setDateDefault(document.getElementById("r_jour1"), 1);

  // Référentiels initiaux
  await loadReferentials();

  // Besoins J+1
  document.getElementById("b_add_row").addEventListener("click", ()=> b_addRow());
  document.getElementById("b_save").addEventListener("click", b_save);

  // Plan & mouvements
  document.getElementById("r_calc").addEventListener("click", ()=> loadPlan(document.getElementById("r_jour1").value));
  document.getElementById("r_gen_vc_bib").addEventListener("click", ()=> actionGenererVCAversBiblio(document.getElementById("r_jour1").value));
  document.getElementById("r_distribuer").addEventListener("click", ()=> actionDistribuerBiblioEquipes(document.getElementById("r_jour1").value));

  // Clôture — éditeur multi-lignes + zone auto = équipe
  setupClotureEditor();
  document.getElementById("c_equipe").addEventListener("change", ()=>{
    const v = document.getElementById("c_equipe").value;
    const z = document.getElementById("c_zone");
    if (!z.value) z.value = v;
  });
  setDateDefault(document.getElementById("c_date"), 0);
  document.getElementById("c_save").addEventListener("click", saveRestes);

  // Dashboard
  const today = new Date(), tomorrow = new Date(); tomorrow.setDate(today.getDate()+1);
  const fmt = d => d.toISOString().slice(0,10);
  document.getElementById("dashJ").value  = fmt(today);
  document.getElementById("dashJ1").value = fmt(tomorrow);
  const from = new Date(); from.setDate(today.getDate()-6);
  document.getElementById("dashFrom").value = fmt(from);
  document.getElementById("dashTo").value   = fmt(today);
  document.getElementById("btnDashRefresh").addEventListener("click", loadDashboard);
  document.getElementById("btnDashExport").addEventListener("click", exportDashboardXLSX);
  loadDashboard().catch(()=>{});

  // Avancé
  document.getElementById("a_etat").addEventListener("click", loadEtatParZone);
  document.getElementById("a_export_xlsx").addEventListener("click", exportAvanceXLSX);
  document.getElementById("a_snapshot").addEventListener("click", doSnapshot);
  document.getElementById("a_lock").addEventListener("change", toggleSnapshotLock);

  // “↻ Recharger” => ne recharge que les référentiels
  document.getElementById("btnReload").addEventListener("click", async ()=>{
    await loadReferentials();
    alert("Référentiels (équipes & matériels) rechargés.");
  });
});
