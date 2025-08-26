// ====== CONFIG ======
const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwO0P3Yo5kw9PPriJPXzUMipBrzlGTR_r-Ff6OyEUnsNu-I9q-rESbBq7l2m6KLA3RJ/exec";
/***********************
 *  Config API
 ***********************/
const API_BASE_URL = "https://script.google.com/macros/s/AKfycbwO0P3Yo5kw9PPriJPXzUMipBrzlGTR_r-Ff6OyEUnsNu-I9q-rESbBq7l2m6KLA3RJ/exec"; // <<< remplace ici

/***********************
 *  Helpers généraux
 ***********************/
function toTable(headers, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "Aucune donnée.";
  const thead = `<thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}
function escapeHtml(x) {
  return String(x ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
async function apiGet(params) {
  const url = new URL(API_BASE_URL);
  Object.entries(params||{}).forEach(([k,v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString(), { method: "GET" });

  const text = await resp.text(); // on lit le texte brut d'abord
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${text.slice(0,200)}`);
  }
  try {
    return JSON.parse(text);      // on tente de parser en JSON
  } catch {
    // Backend a renvoyé du texte ("Paramètre inconnu", etc.)
    throw new Error(text);
  }
}

async function apiText(params) {
  const url = new URL(API_BASE_URL);
  Object.entries(params||{}).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { method: "GET" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}
function setDateDefault(input, deltaDays=0) {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  input.value = d.toISOString().slice(0,10);
}
function parseTextLinesToRows(txt) {
  const out = [];
  (txt||"").split(/\r?\n/).forEach(line=>{
    const m = line.split(","); // "Matériel, Quantité"
    if (m.length >= 1) {
      const mat = (m[0]||"").trim();
      const q   = m.length >= 2 ? (m[1]||"").trim() : "";
      if (mat) out.push({materiel: mat, quantite: q});
    }
  });
  return out;
}
function sumSecondColumnAoA(rows){
  // rows: [[label, qte], ...]
  return (rows||[]).reduce((s,r)=> s + (parseInt(r?.[1],10)||0), 0);
}

/***********************
 *  Tabs
 ***********************/
function initTabs() {
  document.querySelectorAll(".tab-button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const tabId = btn.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach(p=>p.classList.add("hidden"));
      document.getElementById(tabId).classList.remove("hidden");
      document.querySelectorAll(".tab-button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

/***********************
 *  Réappro
 ***********************/
async function loadPlan(dateJ1) {
  const r = await apiGet({ plan: "reappro", date: dateJ1 });
  // Détails (équipe, zone, matériel, reste veille, cible, besoin)
  const det = (r.details||[]).map(x=>[x[1], x[2], x[3], x[4], x[5], x[6]]);
  document.getElementById("r_details").innerHTML =
    toTable(["Équipe","Zone","Matériel","Reste Veille","Cible","Besoin"], det);
  // Agrégat (mat, qte)
  const agg = (r.agregat||[]).map(x=>[x[1], x[2]]);
  document.getElementById("r_agregat").innerHTML =
    toTable(["Matériel","Quantité"], agg);
}
async function actionGenererVCAversBiblio(dateJ1) {
  const t = await apiText({ action: "genererReappro", date: dateJ1 });
  alert(t);
}
async function actionDistribuerBiblioEquipes(dateJ1) {
  const t = await apiText({ action: "distribuerPlan", date: dateJ1 });
  alert(t);
}
async function saveRestes() {
  const d = document.getElementById("c_date").value;
  const equipe = document.getElementById("c_equipe").value;
  const zone = document.getElementById("c_zone").value || equipe;
  const lignes = parseTextLinesToRows(document.getElementById("c_csv").value)
    .map(o => ({ materiel: o.materiel, quantite: Number(o.quantite||0) }));
  const t = await apiText({
    action: "saveRestesEquipe",
    date: d, equipe, zone,
    lignes: JSON.stringify(lignes)
  });
  alert(t);
}

/***********************
 *  Dashboard + KPIs
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
function setDashboardDefaults() {
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const fmt = d => d.toISOString().slice(0,10);
  document.getElementById("dashJ").value  = fmt(today);
  document.getElementById("dashJ1").value = fmt(tomorrow);
  const from = new Date(); from.setDate(from.getDate()-6);
  document.getElementById("dashFrom").value = fmt(from);
  document.getElementById("dashTo").value   = fmt(today);
}
function renderBlock(elId, block) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!block) { el.textContent = "Aucune donnée."; return; }
  const headers = block.headers || [];
  const rows = block.rows || [];
  el.innerHTML = rows.length ? toTable(headers, rows) : "Aucune donnée.";
}
function setKPI(id, value){
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function kpiTotalFromBlock(block, fallbackSum=false){
  if (!block) return 0;
  if (!fallbackSum && typeof block.total === "number") return block.total;
  return sumSecondColumnAoA(block.rows);
}
async function loadDashboard() {
  const J  = document.getElementById("dashJ").value;
  const J1 = document.getElementById("dashJ1").value;
  const F  = document.getElementById("dashFrom").value;
  const T  = document.getElementById("dashTo").value;
  const msg = document.getElementById("dashMsg");
  msg.textContent = "Chargement…"; msg.className = "muted";

  try {
    const r = await apiGet({ dashboard: "1", date: J, jplus1: J1, from: F, to: T });

    // Rendus tableaux
    renderBlock("dashStockVC", r.stockVC);
    renderBlock("dashEntBibJ", r.entreesBiblioJour);
    renderBlock("dashEntBibJ1Plan", r.entreesBiblioJplus1_plan);
    renderBlock("dashEntBibJ1Real", r.entreesBiblioJplus1_reelles);
    renderBlock("dashRepartJ", r.repartJourEquipes);
    renderBlock("dashBesoinsEqJ1", r.besoinsJplus1Equipes);
    renderBlock("dashUsage", r.usagePivot);

    // KPIs — on lit .total si présent sinon on somme
    const kpiVC   = kpiTotalFromBlock(r.stockVC, true);                 // total articles en VC
    const kpiBibJ = kpiTotalFromBlock(r.entreesBiblioJour, true);       // total entrées J à Biblio
    const kpiRepJ = kpiTotalFromBlock(r.repartJourEquipes, true);       // total entrées J vers équipes

    setKPI("kpi-vc",   kpiVC);
    setKPI("kpi-bibj", kpiBibJ);
    setKPI("kpi-repj", kpiRepJ);

    msg.textContent = `J=${r.dates?.J} • J+1=${r.dates?.J1} • Usage: ${r.dates?.from}→${r.dates?.to}`;
    msg.className = "ok";
    window.__DASH_LAST__ = r;
  } catch (e) {
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
  // rows = [["Matériel","Quantité"], ["X","10"], ...]
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
  // petit export d’exemple : état zone si présent à l’écran
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

  // Réappro — dates et actions
  const rj = document.getElementById("r_jour");
  const rj1 = document.getElementById("r_jour1");
  setDateDefault(rj, 0); setDateDefault(rj1, 1);
  document.getElementById("r_calc").addEventListener("click", ()=> loadPlan(rj1.value));
  document.getElementById("r_gen_vc_bib").addEventListener("click", ()=> actionGenererVCAversBiblio(rj1.value));
  document.getElementById("r_distribuer").addEventListener("click", ()=> actionDistribuerBiblioEquipes(rj1.value));

  // Clôture — équipes + défaut zone
  try {
    const eqs = await apiGet({ get: "equipes" });
    const sel = document.getElementById("c_equipe");
    (eqs||[]).forEach(e=>{
      const opt = document.createElement("option");
      opt.value = e; opt.textContent = e;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", ()=>{
      const v = sel.value; const z = document.getElementById("c_zone");
      if (!z.value) z.value = v;
    });
  } catch (_) {}
  setDateDefault(document.getElementById("c_date"), 0);
  document.getElementById("c_save").addEventListener("click", saveRestes);

  // Dashboard
  setDashboardDefaults();
  document.getElementById("btnDashRefresh").addEventListener("click", loadDashboard);
  document.getElementById("btnDashExport").addEventListener("click", exportDashboardXLSX);

  // Avancé
  document.getElementById("a_etat").addEventListener("click", loadEtatParZone);
  document.getElementById("a_export_xlsx").addEventListener("click", exportAvanceXLSX);
  document.getElementById("a_snapshot").addEventListener("click", doSnapshot);
  document.getElementById("a_lock").addEventListener("change", toggleSnapshotLock);

  // bouton global reload
  document.getElementById("btnReload").addEventListener("click", ()=> location.reload());

  // chargement initial plan + dashboard
  await loadPlan(rj1.value);
  await loadDashboard();
});
