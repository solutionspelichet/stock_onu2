/* =====================
 *  ONU — Suivi Stock (Front) — Trebuchet + Orange Pelichet
 * ===================== */

/***********************
 *  Config API
 ***********************/
const API_BASE_URL = "https://script.google.com/macros/s/AKfycbwO0P3Yo5kw9PPriJPXzUMipBrzlGTR_r-Ff6OyEUnsNu-I9q-rESbBq7l2m6KLA3RJ/exec";

/***********************
 *  Dashboard sizing (uniformiser les tailles)
 ***********************/
const DASH_SIZES = {
  PIE_W: 520,  // largeur camemberts (px)
  PIE_H: 320,  // hauteur camemberts (px)
  LINE_H: 320  // hauteur des graphiques d’historique (px)
};

/***********************
 *  Helpers génériques
 ***********************/
function escapeHtml(x) {
  return String(x ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function slugify(s){
  return String(s||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/gi,"-").replace(/^-+|-+$/g,"")
    .toLowerCase();
}
(function injectChartFrameCSS(){
  if (document.getElementById("chart-frame-css")) return;
  const s = document.createElement("style");
  s.id = "chart-frame-css";
  s.textContent = `
    .card canvas { display:block !important; }
    .card { overflow: visible; }
  `;
  document.head.appendChild(s);
})();
function loadScript(src, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Échec chargement: ${src}`));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error(`Timeout chargement: ${src}`)), timeoutMs);
  });
}
(function injectChartCSS(){
  if (document.getElementById('chart-css')) return;
  const s = document.createElement('style');
  s.id = 'chart-css';
  s.textContent = `
    .chart-wrap{ position:relative; width:100%; }
    .chart-wrap > canvas{ width:100% !important; height:100% !important; display:block; }
    .card{ overflow: visible; }
  `;
  document.head.appendChild(s);
})();

/* ====== Conteneurs Dashboard ====== */
function getDashParent() {
  return document.getElementById("dashboard")
      || document.getElementById("tab-dashboard")
      || document.getElementById("panel-dashboard")
      || document.querySelector("#dashRoot, .dashboard, #app, main, body");
}
function ensureDiv(id, parent) {
  let el = document.getElementById(id);
  if (!el) {
    const p = parent || getDashParent() || document.body;
    el = document.createElement("div");
    el.id = id;
    p.appendChild(el);
  }
  return el;
}
function wipe(el){ if(el) el.innerHTML=""; }

function downloadBlob(data, filename, mime='text/csv;charset=utf-8') {
  const blob = new Blob([data], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 200);
}

function aoaToCSV(aoa) {
  return (aoa || []).map(row =>
    row.map(v => {
      const s = (v==null ? '' : String(v)).replace(/"/g,'""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    }).join(',')
  ).join('\n');
}


/***********************
 *  Chart.js helpers
 ***********************/
const __charts = {};
function destroyChart(id){ if(__charts[id]){ __charts[id].destroy(); delete __charts[id]; } }
function makeColors(n){
  const arr=[]; for(let i=0;i<n;i++) arr.push(`hsl(${Math.round((360*i)/Math.max(1,n))} 70% 55%)`);
  return arr;
}
async function ensureChartJSLoaded(){
  if (window.Chart) return;
  await new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload=res; s.onerror=()=>rej(new Error('CDN Chart.js introuvable'));
    document.head.appendChild(s);
  });
}

function renderPieChart(canvasId, labels, values, title){
  destroyChart(canvasId);
  const el=document.getElementById(canvasId);
  if(!el) return;

  const colors=makeColors(values.length);
  __charts[canvasId]=new Chart(el.getContext('2d'),{
    type:'pie',
    data:{ labels, datasets:[{ data: values, backgroundColor: colors }] },
    options:{
      responsive:true,
      maintainAspectRatio:false, // le canvas remplit la .chart-wrap
      plugins:{
        title:{ display:!!title, text:title, font:{ size:12 } },
        legend:{ position:'bottom', labels:{ boxWidth:10, font:{ size:10 } } }
      }
    }
  });
}

function renderLinesByMaterial(canvasId, dates, seriesByMat, title){
  destroyChart(canvasId);
  const el=document.getElementById(canvasId);
  if(!el) return;

  const mats=Object.keys(seriesByMat);
  const colors=makeColors(mats.length);
  const datasets=mats.map((m,i)=>({
    label:m, data:seriesByMat[m], fill:false, tension:0.2,
    borderColor:colors[i], pointRadius:2
  }));

  __charts[canvasId]=new Chart(el.getContext('2d'),{
    type:'line',
    data:{ labels: dates, datasets },
    options:{
      responsive:true,
      maintainAspectRatio:false, // remplit la .chart-wrap (hauteur fixe)
      plugins:{
        title:{ display:!!title, text:title, font:{ size:12 } },
        legend:{ position:'bottom', labels:{ font:{ size:10 } } }
      },
      interaction:{ mode:'index', intersect:false },
      scales:{
        x:{ ticks:{ autoSkip:true, maxTicksLimit:12, font:{ size:10 } } },
        y:{ ticks:{ font:{ size:10 } } }
      }
    }
  });
}



/***********************
 *  Rendu tables & XLSX
 ***********************/
function toTable(headers, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "Aucune donnée.";
  const thead = `<thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}
async function ensureXLSXLoaded() {
  if (window.XLSX) return;

  // construit une URL locale absolue et bypass cache
  const localUrl = new URL('./xlsx.full.min.js', location.href).href + `?v=${Date.now()}`;

  const CANDIDATES = [
    'https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.19.3/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.19.3/xlsx.full.min.js',
    localUrl
  ];

  let lastErr;
  for (const url of CANDIDATES) {
    try {
      await loadScript(url, 15000);
      if (window.XLSX) return; // OK
    } catch (e) {
      console.warn('[XLSX] échec sur', url, e);
      lastErr = e;
    }
  }
  throw new Error('Impossible de charger XLSX depuis les CDNs ni en local. Place xlsx.full.min.js à la racine ou autorise un CDN.');
}

// Préchargement pour éviter la perte du “gesture” utilisateur (iOS/Safari)
async function preloadXLSX() {
  try { await ensureXLSXLoaded(); } catch(_) {}
}
async function downloadXlsxFile(wb, filename){
  // 1) Essai standard
  try {
    XLSX.writeFile(wb, filename);
    return;
  } catch (e) {
    console.warn("XLSX.writeFile a échoué, on tente le plan B:", e);
  }

  // 2) Plan B : buffer -> Blob -> lien
  try {
    const buf = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 200);
    return;
  } catch (e) {
    console.error("Export XLSX (plan B) a échoué:", e);
  }

  // 3) Plan C : data URL (dernier recours)
  try {
    const bstr = XLSX.write(wb, { bookType:'xlsx', type:'base64' });
    window.open("data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64," + bstr, "_blank");
  } catch (e) {
    alert("Impossible de générer le fichier XLSX : " + e.message);
  }
}


/***********************
 *  API helpers
 ***********************/
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

/***********************
 *  Étapes visuelles Réappro
 ***********************/
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
    a1, 1, "Besoins J+1 — Saisie",
    "Saisir les besoins par équipe et par matériel pour le jour J+1 (la date par défaut est demain)."
  );
  insertStepHeader(
    a2, 2, "Clôture J — Restes d'équipe",
    "Enregistrer les restes de fin de journée (J). La zone reprend automatiquement la valeur de l’équipe."
  );
  insertStepHeader(
    a3, 3, "Plan J+1 — Calcul / Mouvements",
    "Calculer le plan (besoin = cible − reste), puis générer les mouvements Voie Creuse → Bibliothèque et Bibliothèque → Équipes."
  );
}

/***********************
 *  Réordonner : Plan après Clôture
 ***********************/
function smallestCommonAncestor_(ids) {
  const els = ids.map(id => document.getElementById(id)).filter(Boolean);
  if (!els.length) return null;
  let node = els[0];
  outer: while (node) {
    for (const e of els) { if (!node.contains(e)) { node = node.parentElement; continue outer; } }
    return node;
  }
  return null;
}
function reorderReapproSections() {
  const planRoot   = smallestCommonAncestor_(['r_jour1','r_calc','r_details','r_agregat']);
  const clotRoot   = smallestCommonAncestor_(['c_date','c_equipe','c_save']);
  if (!clotRoot || !planRoot || clotRoot === planRoot) return;

  const planAnchor = document.getElementById('r_jour1');
  const planHeader = (planAnchor && planAnchor.previousElementSibling && planAnchor.previousElementSibling.classList?.contains('step-block'))
    ? planAnchor.previousElementSibling : null;

  if (planHeader) {
    clotRoot.insertAdjacentElement('afterend', planHeader);
    planHeader.insertAdjacentElement('afterend', planRoot);
  } else {
    clotRoot.insertAdjacentElement('afterend', planRoot);
  }
}

/***********************
 *  Référentiels
 ***********************/
let REF_EQ = [];
let REF_MAT = [];
const QTY_SUGGESTIONS = [1,2,5,10,20,50,100];

function ensureDatalists() {
  if (!document.getElementById("qty_options")) {
    const dl = document.createElement("datalist");
    dl.id = "qty_options";
    dl.innerHTML = QTY_SUGGESTIONS.map(n=>`<option value="${n}"></option>`).join("");
    document.body.appendChild(dl);
  }
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
function rebuildMaterialSelectsInTable() {
  document.querySelectorAll("select.b_mat, select.c_mat, select.vcinit_mat").forEach(sel=>{
    const old = sel.value;
    sel.innerHTML = `<option value="">— choisir —</option>` +
      (REF_MAT||[]).map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
    if (old && REF_MAT.includes(old)) sel.value = old;
  });
}
function rebuildVCInitSelects() {
  document.querySelectorAll("select.vcinit_mat").forEach(sel=>{
    const old = sel.value;
    sel.innerHTML = `<option value="">— choisir —</option>` +
      (REF_MAT||[]).map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
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
  let eq = [], mat = [];
  try { eq = await apiGet({ get: "equipes" }) || []; } catch {}
  try { mat = await apiGet({ get: "materiels" }) || []; } catch {}
  if (!eq.length) {
    try {
      const zones = await apiGet({ get: "zones" }) || [];
      const ignore = new Set(["Voie Creuse","Bibliothèque","B26","Compactus","Reading Room 1","Reading Room 2","reading room 1","reading room 2","compactus","b26"]);
      eq = (zones||[]).filter(z=>!ignore.has(z));
    } catch {}
  }
  eq = Array.from(new Set(eq)).sort(collFR.compare);
  mat = Array.from(new Set(mat)).sort(collFR.compare);

  REF_EQ = eq;
  REF_MAT = mat;

  setOptions(document.getElementById("b_equipe"), REF_EQ);
  setOptions(document.getElementById("c_equipe"), REF_EQ);
  rebuildMaterialSelectsInTable();
  rebuildVCInitSelects();
  refreshZoneDatalist();

  console.log("Référentiels chargés:", { equipes: REF_EQ.length, materiels: REF_MAT.length });
}

/***********************
 *  Besoins J+1 — multi-lignes
 ***********************/
function b_addRow(matDefault="", cibleDefault="") {
  const tbody = document.querySelector("#b_table tbody");
  const tr = document.createElement("tr");

  const tdMat = document.createElement("td");
  const sel = document.createElement("select");
  sel.className = "b_mat";
  sel.innerHTML = `<option value="">— choisir —</option>` + REF_MAT.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if (matDefault) sel.value = matDefault;
  tdMat.appendChild(sel);

  const tdCible = document.createElement("td");
  const inp = document.createElement("input");
  inp.type = "number"; inp.min = "0"; inp.step = "1"; inp.value = cibleDefault || "";
  inp.className = "b_cible";
  inp.setAttribute("list","qty_options");
  tdCible.appendChild(inp);

  const tdCom = document.createElement("td");
  const txt = document.createElement("input");
  txt.type = "text"; txt.placeholder = "commentaire (facultatif)";
  txt.className = "b_comment";
  tdCom.appendChild(txt);

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
  await loadReferentials();
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

  ta.style.display = "none";

  const wrap = document.createElement("div");
  wrap.id = "c_editor";
  wrap.className = "table-wrap scroll-x";
  wrap.style.marginTop = "10px";

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const addBtn = document.createElement("button");
  addBtn.id = "c_add_row";
  addBtn.className = "secondary";
  addBtn.textContent = "+ Ajouter une ligne";
  toolbar.appendChild(addBtn);

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

  ta.insertAdjacentElement("afterend", wrap);
  wrap.insertAdjacentElement("beforebegin", toolbar);
  wrap.appendChild(table);

  addBtn.addEventListener("click", ()=> c_addRow());
}
function c_addRow(matDefault="", qtyDefault="") {
  const tbody = document.querySelector("#c_table tbody");
  const tr = document.createElement("tr");

  const tdMat = document.createElement("td");
  const sel = document.createElement("select");
  sel.className = "c_mat";
  sel.innerHTML = `<option value="">— choisir —</option>` +
    REF_MAT.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if (matDefault) sel.value = matDefault;
  tdMat.appendChild(sel);

  const tdQty = document.createElement("td");
  const qty = document.createElement("input");
  qty.type = "number"; qty.min = "0"; qty.step = "1"; qty.value = qtyDefault || "";
  qty.className = "c_qty";
  qty.setAttribute("list","qty_options");
  tdQty.appendChild(qty);

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

  let lignes = c_collectLines();
  if (!lignes.length) {
    lignes = parseTextLinesToRows(document.getElementById("c_csv").value);
  }

  if (!d || !equipe || !lignes.length) return alert("Complète la date, l’équipe et au moins une ligne.");
  const t = await apiText({ action: "saveRestesEquipe", date: d, equipe, zone, lignes: JSON.stringify(lignes) });
  alert(t);
  const tbody = document.querySelector("#c_table tbody");
  if (tbody) tbody.innerHTML = "";
  await loadReferentials();
}

/***********************
 *  Dashboard (camemberts + historiques)
 ***********************/
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
    await ensureChartJSLoaded();

    /* ========== 1) STOCK VC (live) — camembert ========== */
    const vc = await apiGet({ stock: "vc" });
    renderBlock("dashStockVC", { headers: vc.headers || ["Matériel","Quantité"], rows: vc.rows || [] });

    const wrapVC = ensureDiv("chartVCPieWrap");
    wipe(wrapVC);
    wrapVC.innerHTML = `
  <div class="card" style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;">
    <div>
      <h3 style="margin:4px 0;">Stock Voie Creuse — répartition</h3>
      <div class="muted">Total: <b>${vc.total||0}</b></div>
    </div>
    <div class="chart-wrap" style="width:${DASH_SIZES.PIE_W}px;height:${DASH_SIZES.PIE_H}px;">
      <canvas id="chartVCPie"></canvas>
    </div>
  </div>`;

    const labelsVC = (vc.rows||[]).map(r=>r[0]);
    const valuesVC = (vc.rows||[]).map(r=>+r[1]);
    renderPieChart("chartVCPie", labelsVC, valuesVC, "");

    /* ========== 2) BESOINS J+1 — un camembert/équipe ========== */
    const bes = await apiGet({ besoins: "parEquipe", date: J1 }); // {rowsEquipe, matrix, ...}
    renderBlock("dashBesoinsEqJ1", bes.matrix); // matrice en tableau (optionnel)

    const wrapBes = ensureDiv("chartBesoinsPerTeamWrap");
    wipe(wrapBes);
    wrapBes.innerHTML = `<h3 style="margin:6px 0 8px;">Besoins J+1 — répartition par équipe</h3>
                         <div id="besTeamGrid" style="display:grid;gap:12px;"></div>`;
    const grid = document.getElementById("besTeamGrid");
    grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${DASH_SIZES.PIE_W + 60}px, 1fr))`;

    // Regrouper par équipe → { équipe -> Map(mat -> somme) }
    const group = new Map();
    (bes.rowsEquipe||[]).forEach(([eq, mat, q])=>{
      if(!group.has(eq)) group.set(eq, new Map());
      const cur = group.get(eq).get(mat)||0;
      group.get(eq).set(mat, cur + (+q||0));
    });

    Array.from(group.keys()).sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base',numeric:true})).forEach(eq=>{
      const card = document.createElement("div");
      card.className = "card";
      card.style.padding = "10px";
      const canvasId = `chartBesTeam_${slugify(eq)}`;
      card.innerHTML = `
  <div style="display:flex;align-items:center;gap:10px;">
    <div style="flex:1;min-width:120px;">
      <h4 style="margin:4px 0;">${escapeHtml(eq)}</h4>
    </div>
    <div class="chart-wrap" style="width:${DASH_SIZES.PIE_W}px;height:${DASH_SIZES.PIE_H}px;">
      <canvas id="${canvasId}"></canvas>
    </div>
  </div>`;

      grid.appendChild(card);

      const mats = Array.from(group.get(eq).keys());
      const vals = mats.map(m=>group.get(eq).get(m));
      renderPieChart(canvasId, mats, vals, "");
    });

    /* ========== 3) HISTORIQUE — 1 graphe par équipe, 1 courbe par matériel ========== */
    const usage = await apiGet({ usage: "series", from: F, to: T }); // { dates, teams, matrix, raw }
    const wrapUsage = ensureDiv("chartUsagePerTeamWrap");
    wipe(wrapUsage);
    wrapUsage.innerHTML = `<h3 style="margin:6px 0 8px;">Usage quotidien — par équipe</h3>`;

    const dates = usage.dates || [];
    const raw   = usage.raw   || []; // [date, eq, mat, qty]
    const byTeam = new Map();        // eq -> Map(mat -> series[dates])

    raw.forEach(([d, eq, mat, q])=>{
      if (!byTeam.has(eq)) byTeam.set(eq, new Map());
      const m = byTeam.get(eq);
      if (!m.has(mat)) m.set(mat, Array(dates.length).fill(0));
      const di = dates.indexOf(d);
      if (di>=0) m.get(mat)[di] += (+q||0);
    });

    const gridU = document.createElement("div");
    gridU.style.display = "grid";
    gridU.style.gridTemplateColumns = `repeat(auto-fill, minmax(${Math.max(360, DASH_SIZES.PIE_W)}px, 1fr))`;
    gridU.style.gap = "12px";
    wrapUsage.appendChild(gridU);

    Array.from(byTeam.keys()).sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base',numeric:true})).forEach(eq=>{
      const card = document.createElement("div");
      card.className = "card";
      card.style.padding = "10px";
      const canvasId = `chartUsage_${slugify(eq)}`;
      card.innerHTML = `
  <h4 style="margin:4px 0 8px;">${escapeHtml(eq)}</h4>
  <div class="chart-wrap" style="height:${DASH_SIZES.LINE_H}px;">
    <canvas id="${canvasId}"></canvas>
  </div>`;

      gridU.appendChild(card);

      const seriesByMat = {};
      byTeam.get(eq).forEach((arr, mat)=>{ seriesByMat[mat]=arr; });
      renderLinesByMaterial(canvasId, dates, seriesByMat, "");
    });

    msg.textContent = `J=${J} • J+1=${J1} • Usage: ${F}→${T}`;
    msg.className = "ok";
  } catch(e) {
    console.error(e);
    msg.textContent = "Erreur: " + e.message;
    msg.className = "error";
  }
}
async function exportAvanceXLSX() {
  await ensureXLSXLoaded();

  const wb = XLSX.utils.book_new();
  const host = document.getElementById("a_etat_table");

  if (host && host.querySelector("table")) {
    const headers = Array.from(host.querySelectorAll("thead th")).map(th=>th.textContent);
    const rows = Array.from(host.querySelectorAll("tbody tr")).map(tr =>
      Array.from(tr.querySelectorAll("td")).map(td=>td.textContent)
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Etat_par_zone");
  } else {
    // Si pas de tableau affiché, on tente de charger une zone par défaut si dispo
    const z = document.getElementById("a_zone")?.value;
    if (z) {
      const res = await apiGet({ etat: "1", zone: z });
      if (Array.isArray(res) && res.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(res), "Etat_par_zone");
      }
    }
  }

  await downloadXlsxFile(wb, "avance_export.xlsx");
}

async function exportDashboardXLSX() {
  const J  = document.getElementById("dashJ").value;
  const J1 = document.getElementById("dashJ1").value;
  const F  = document.getElementById("dashFrom").value;
  const T  = document.getElementById("dashTo").value;

  const r = await apiGetDashboard(J, J1, F, T);

  try {
    await ensureXLSXLoaded(); // essaie XLSX
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
    const fname = `dashboard_${J||"J"}.xlsx`;
    XLSX.writeFile(wb, fname);
  } catch (e) {
    console.warn('XLSX indisponible, fallback CSV:', e.message);
    // Fallback : on assemble un CSV multi-sections
    const blocks = [
      ['Stock_VC', r.stockVC],
      ['EntreesBib_J', r.entreesBiblioJour],
      ['EntreesBib_J+1_plan', r.entreesBiblioJplus1_plan],
      ['EntreesBib_J+1_reel', r.entreesBiblioJplus1_reelles],
      ['Repartition_J', r.repartJourEquipes],
      ['Besoins_J+1', r.besoinsJplus1Equipes],
      ['Usage', r.usagePivot]
    ];
    let csv = '';
    blocks.forEach(([name, blk]) => {
      if (!blk) return;
      const aoa = [ (blk.headers||[]), ...(blk.rows||[]) ];
      csv += `### ${name}\n` + aoaToCSV(aoa) + '\n\n';
    });
    downloadBlob(csv, `dashboard_${J||'J'}.csv`);
    alert("Librairie XLSX non chargée : export CSV réalisé à la place.");
  }
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
  try {
    await ensureXLSXLoaded();
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
  } catch (e) {
    console.warn('XLSX indisponible, fallback CSV:', e.message);
    const host = document.getElementById("a_etat_table");
    if (host && host.querySelector("table")) {
      const headers = Array.from(host.querySelectorAll("thead th")).map(th=>th.textContent);
      const rows = Array.from(host.querySelectorAll("tbody tr")).map(tr =>
        Array.from(tr.querySelectorAll("td")).map(td=>td.textContent)
      );
      const csv = aoaToCSV([headers, ...rows]);
      downloadBlob(csv, 'avance_export.csv');
      alert("Librairie XLSX non chargée : export CSV réalisé à la place.");
    } else {
      alert("Aucune donnée à exporter.");
    }
  }
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

/* ===== Stock VC (live) — UI + export ===== */
async function loadVCLive(filterMat) {
  const params = { stock: "vc" };
  if (filterMat && filterMat.trim()) params.mat = filterMat.trim();
  const r = await apiGet(params);

  const host = document.getElementById("a_vc_table");
  if (!host) return;
  const tableHtml = r && r.rows && r.rows.length ? toTable(r.headers || ["Matériel","Quantité"], r.rows)
                                                 : "Aucune donnée.";
  host.innerHTML = tableHtml + `<div class="muted" style="margin-top:6px;">Total: <b>${(r && r.total) || 0}</b></div>`;
}
async function exportVCLiveXLSX() {
  const host = document.getElementById("a_vc_table");
  let headers = ["Matériel","Quantité"], rows = [];
  if (host && host.querySelector("table")) {
    headers = Array.from(host.querySelectorAll("thead th")).map(th=>th.textContent);
    rows = Array.from(host.querySelectorAll("tbody tr")).map(tr =>
      Array.from(tr.querySelectorAll("td")).map(td=>td.textContent)
    );
  } else {
    const r = await apiGet({ stock: "vc" });
    headers = r.headers || headers;
    rows = r.rows || rows;
  }

  try {
    await ensureXLSXLoaded();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Stock_VC_live");
    const today = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `stock_vc_live_${today}.xlsx`);
  } catch (e) {
    console.warn('XLSX indisponible, fallback CSV:', e.message);
    const csv = aoaToCSV([headers, ...rows]);
    const today = new Date().toISOString().slice(0,10);
    downloadBlob(csv, `stock_vc_live_${today}.csv`);
    alert("Librairie XLSX non chargée : export CSV réalisé à la place.");
  }
}


function injectVCLivePanel() {
  if (document.getElementById("a_vc_panel")) return;
  const anchor = document.getElementById("a_etat_table") || document.getElementById("advanced");
  if (!anchor) return;

  const panel = document.createElement("div");
  panel.id = "a_vc_panel";
  panel.style.marginTop = "16px";
  panel.innerHTML = `
    <div class="step-block">
      <div class="step-title">
        <span class="step-badge">VC</span>
        <span>Stock Voie Creuse — Temps réel</span>
      </div>
      <div class="step-sub">Lecture directe de la feuille <i>Stock Voie Creuse</i> (Entrées − Sorties par matériel).</div>
    </div>
    <div class="toolbar" style="display:flex; gap:8px; flex-wrap:wrap;">
      <input id="a_vc_mat" type="text" placeholder="Filtrer par matériel (optionnel)" style="min-width:240px;">
      <button id="a_vc_load">Stock VC (live)</button>
      <button id="a_vc_export" class="secondary">Export XLSX</button>
    </div>
    <div id="a_vc_table" class="table-wrap scroll-x" style="margin-top:8px;"></div>
  `;
  anchor.insertAdjacentElement("afterend", panel);

  document.getElementById("a_vc_load").addEventListener("click", ()=>{
    const m = document.getElementById("a_vc_mat").value;
    loadVCLive(m).catch(e=>alert("Erreur: "+e.message));
  });
  document.getElementById("a_vc_export").addEventListener("click", ()=>{
    exportVCLiveXLSX().catch(e=>alert("Erreur: "+e.message));
  });
}

/* ===== Voie Creuse — Stock initial (one-shot) ===== */
function injectVCInitialPanel() {
  if (document.getElementById("vcinit_panel")) return;

  const anchor = document.getElementById("a_vc_panel")
             ||  document.getElementById("a_etat_table")
             ||  document.getElementById("advanced");
  if (!anchor) return;

  const panel = document.createElement("div");
  panel.id = "vcinit_panel";
  panel.style.marginTop = "18px";
  panel.innerHTML = `
    <div class="step-block">
      <div class="step-title">
        <span class="step-badge">VC</span>
        <span>Voie Creuse — Stock initial (one-shot)</span>
      </div>
      <div class="step-sub">
        Enregistre ou corrige le <b>stock de départ</b> de Voie Creuse (Type = <i>Initial</i>, compté comme Entrée).
        Utile pour éviter des soldes négatifs si tu as des Sorties sans ouverture.
      </div>
    </div>

    <div class="toolbar" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
      <label>Date&nbsp;: <input id="vcinit_date" type="date" style="min-width:160px;"></label>
      <button id="vcinit_add" class="secondary">+ Ajouter une ligne</button>
      <button id="vcinit_save">Enregistrer comme “Initial”</button>
    </div>

    <div class="table-wrap scroll-x" style="margin-top:8px;">
      <table id="vcinit_table">
        <thead>
          <tr>
            <th style="min-width:240px;">Matériel</th>
            <th style="min-width:120px;">Quantité</th>
            <th>—</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>

    <div class="muted" style="margin-top:6px;">
      Conseil&nbsp;: une seule ligne par matériel (les doublons seront <i>additionnés</i> à l’envoi).
    </div>
  `;
  anchor.insertAdjacentElement("afterend", panel);

  document.getElementById("vcinit_add").addEventListener("click", ()=> vcInit_addRow());
  document.getElementById("vcinit_save").addEventListener("click", saveVCInitial);

  const d = document.getElementById("vcinit_date");
  if (d) setDateDefault(d, 0);

  rebuildVCInitSelects();
}
function vcInit_addRow(matDefault="", qtyDefault="") {
  const tbody = document.querySelector("#vcinit_table tbody");
  const tr = document.createElement("tr");

  const tdMat = document.createElement("td");
  const sel = document.createElement("select");
  sel.className = "vcinit_mat";
  sel.innerHTML = `<option value="">— choisir —</option>` +
    (REF_MAT||[]).map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if (matDefault) sel.value = matDefault;
  tdMat.appendChild(sel);

  const tdQty = document.createElement("td");
  const qty = document.createElement("input");
  qty.type = "number"; qty.min = "0"; qty.step = "1"; qty.value = qtyDefault || "";
  qty.className = "vcinit_qty";
  qty.setAttribute("list","qty_options");
  tdQty.appendChild(qty);

  const tdDel = document.createElement("td");
  const btn = document.createElement("button");
  btn.textContent = "✕"; btn.className = "secondary";
  btn.addEventListener("click", ()=> tr.remove());
  tdDel.appendChild(btn);

  tr.append(tdMat, tdQty, tdDel);
  tbody.appendChild(tr);
}
function vcInit_collectLinesAggregated() {
  const rows = Array.from(document.querySelectorAll("#vcinit_table tbody tr"));
  const map = new Map();
  for (const tr of rows) {
    const mat = tr.querySelector(".vcinit_mat")?.value || "";
    const q   = parseInt(tr.querySelector(".vcinit_qty")?.value || "0", 10) || 0;
    if (!mat || q <= 0) continue;
    map.set(mat, (map.get(mat) || 0) + q);
  }
  return Array.from(map.entries()).map(([materiel, quantite]) => ({ materiel, quantite }));
}
async function saveVCInitial() {
  const date = document.getElementById("vcinit_date")?.value;
  if (!date) return alert("Indique la date du stock initial.");
  const lignes = vcInit_collectLinesAggregated();
  if (!lignes.length) return alert("Ajoute au moins une ligne (matériel + quantité > 0).");

  try {
    const msg = await apiText({
      action: "vcSetInitial",
      date,
      lignes: JSON.stringify(lignes)
    });
    alert(msg);

    const tbody = document.querySelector("#vcinit_table tbody");
    if (tbody) tbody.innerHTML = "";
    if (typeof loadVCLive === "function") {
      await loadVCLive();
    }
  } catch(e) {
    alert("Erreur: " + e.message);
  }
}

/***********************
 *  Boot
 ***********************/
document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  addStepHeaders();
  ensureDatalists();
  injectVCLivePanel?.();
  injectVCInitialPanel();
  preloadXLSX();  // lance le chargement de XLSX en avance


  // Dates par défaut (Réappro)
  setDateDefault(document.getElementById("b_j1"), 1);
  setDateDefault(document.getElementById("r_jour"), 0);
  setDateDefault(document.getElementById("r_jour1"), 1);

  // Référentiels initiaux
  await loadReferentials();

  // Besoins J+1
  document.getElementById("b_add_row").addEventListener("click", ()=> b_addRow());
  document.getElementById("b_save").addEventListener("click", b_save);

  // Clôture — éditeur multi-lignes + zone auto = équipe
  setupClotureEditor();
  document.getElementById("c_equipe").addEventListener("change", ()=>{
    const v = document.getElementById("c_equipe").value;
    const z = document.getElementById("c_zone");
    if (!z.value) z.value = v;
  });
  setDateDefault(document.getElementById("c_date"), 0);
  document.getElementById("c_save").addEventListener("click", saveRestes);

  // Réordonner : Plan après Clôture
  reorderReapproSections();

  // Plan & mouvements
  document.getElementById("r_calc").addEventListener("click", ()=> loadPlan(document.getElementById("r_jour1").value));
  document.getElementById("r_gen_vc_bib").addEventListener("click", ()=> actionGenererVCAversBiblio(document.getElementById("r_jour1").value));
  document.getElementById("r_distribuer").addEventListener("click", ()=> actionDistribuerBiblioEquipes(document.getElementById("r_jour1").value));

  // Dashboard — dates par défaut
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

  // “↻ Recharger” référentiels
  document.getElementById("btnReload").addEventListener("click", async ()=>{
    await loadReferentials();
    alert("Référentiels (équipes & matériels) rechargés.");
  });
});
