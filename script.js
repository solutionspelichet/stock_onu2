/***********************
 *  Config API
 ***********************/
const API_BASE_URL = "https://script.google.com/macros/s/AKfycbwO0P3Yo5kw9PPriJPXzUMipBrzlGTR_r-Ff6OyEUnsNu-I9q-rESbBq7l2m6KLA3RJ/exec"; // <<< remplace ici

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

/***********************
 *  Tabs (réparation)
 ***********************/
function initTabs() {
  document.querySelectorAll(".tab-button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const tabId = btn.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach(p=>p.classList.add("hidden"));
      const panel = document.getElementById(tabId);
      if (panel) panel.classList.remove("hidden");
      document.querySelectorAll(".tab-button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
}

/***********************
 *  Données de référence
 ***********************/
let REF_EQ = [];
let REF_MAT = [];

async function loadReferentials() {
  try {
    REF_EQ = await apiGet({ get: "equipes" }) || [];
  } catch { REF_EQ = []; }

  try {
    REF_MAT = await apiGet({ get: "materiels" }) || [];
  } catch { REF_MAT = []; }

  // Remplir les selects d’équipes (Réappro & Clôture)
  const eqSelects = [document.getElementById("b_equipe"), document.getElementById("c_equipe")].filter(Boolean);
  for (const sel of eqSelects) {
    sel.innerHTML = "";
    REF_EQ.forEach(e=>{
      const opt = document.createElement("option");
      opt.value = e; opt.textContent = e;
      sel.appendChild(opt);
    });
  }
}

/***********************
 *  Besoins J+1 — Éditeur multi-lignes
 ***********************/
function b_addRow(matDefault="", cibleDefault="") {
  const tbody = document.querySelector("#b_table tbody");
  const tr = document.createElement("tr");

  // Matériel (select)
  const tdMat = document.createElement("td");
  const sel = document.createElement("select");
  sel.className = "b_mat";
  // options
  sel.innerHTML = `<option value="">— choisir —</option>` + REF_MAT.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if (matDefault) sel.value = matDefault;
  tdMat.appendChild(sel);

  // Cible
  const tdCible = document.createElement("td");
  const inp = document.createElement("input");
  inp.type = "number"; inp.min = "0"; inp.step = "1"; inp.value = cibleDefault || "";
  inp.className = "b_cible";
  tdCible.appendChild(inp);

  // Commentaire
  const tdCom = document.createElement("td");
  const txt = document.createElement("input");
  txt.type = "text"; txt.placeholder = "commentaire (facultatif)";
  txt.className = "b_comment";
  tdCom.appendChild(txt);

  // Supprimer
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
  for (const tr of rows) {
    const mat = tr.querySelector(".b_mat")?.value || "";
    const cible = parseInt(tr.querySelector(".b_cible")?.value || "0", 10) || 0;
    const commentaire = tr.querySelector(".b_comment")?.value || "";
    if (!mat || cible <= 0) continue;
    lignes.push({ materiel: mat, cible, commentaire });
  }
  if (!lignes.length) return alert("Ajoute au moins une ligne (matériel + quantité).");

  try {
    const msg = await apiText({
      action: "addBesoinsBatch",
      date: dateJ1,
      equipe,
      lignes: JSON.stringify(lignes)
    });
    alert(msg);
    // Option : vider le tableau
    document.querySelector("#b_table tbody").innerHTML = "";
  } catch(e) {
    alert("Erreur: " + e.message);
  }
}

/***********************
 *  Plan J+1 — calcul & mouvements
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

/***********************
 *  Clôture J — Restes
 ***********************/
function parseTextLinesToRows(txt) {
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
  const zone = document.getElementById("c_zone").value || equipe;
  const lignes = parseTextLinesToRows(document.getElementById("c_csv").value);
  const t = await apiText({
    action: "saveRestesEquipe",
    date: d, equipe, zone,
    lignes: JSON.stringify(lignes)
  });
  alert(t);
}

/***********************
 *  Dashboard (inchangé si déjà installé)
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
 *  Boot
 ***********************/
document.addEventListener("DOMContentLoaded", async () => {
  initTabs();

  // Dates par défaut
  setDateDefault(document.getElementById("b_j1"), 1);
  setDateDefault(document.getElementById("r_jour"), 0);
  setDateDefault(document.getElementById("r_jour1"), 1);

  // Référentiels (équipes + matériels)
  await loadReferentials();

  // Besoins J+1
  document.getElementById("b_add_row").addEventListener("click", ()=> b_addRow());
  document.getElementById("b_save").addEventListener("click", b_save);

  // Calcul plan & mouvements
  document.getElementById("r_calc").addEventListener("click", ()=> loadPlan(document.getElementById("r_jour1").value));
  document.getElementById("r_gen_vc_bib").addEventListener("click", ()=> actionGenererVCAversBiblio(document.getElementById("r_jour1").value));
  document.getElementById("r_distribuer").addEventListener("click", ()=> actionDistribuerBiblioEquipes(document.getElementById("r_jour1").value));

  // Clôture — défaut zone = équipe
  document.getElementById("c_equipe").addEventListener("change", ()=>{
    const v = document.getElementById("c_equipe").value;
    const z = document.getElementById("c_zone");
    if (!z.value) z.value = v;
  });
  setDateDefault(document.getElementById("c_date"), 0);
  document.getElementById("c_save").addEventListener("click", saveRestes);

  // Dashboard (si ton HTML inclut l’onglet)
  const hasDash = document.getElementById("dashJ");
  if (hasDash) {
    const today = new Date(), tomorrow = new Date(); tomorrow.setDate(today.getDate()+1);
    const fmt = d => d.toISOString().slice(0,10);
    document.getElementById("dashJ").value = fmt(today);
    document.getElementById("dashJ1").value = fmt(tomorrow);
    const from = new Date(); from.setDate(today.getDate()-6);
    document.getElementById("dashFrom").value = fmt(from);
    document.getElementById("dashTo").value   = fmt(today);

    document.getElementById("btnDashRefresh")?.addEventListener("click", loadDashboard);
    document.getElementById("btnDashExport")?.addEventListener("click", exportDashboardXLSX);
    // Chargement initial
    loadDashboard().catch(()=>{});
  }
});
