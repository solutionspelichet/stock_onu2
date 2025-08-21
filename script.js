// Frontend logic + Tabs + Multi-matériels (legacy) + Aperçu Réappro + Saisie Restes Équipe
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

// ── Aperçu dynamique (Réappro J+1)
function ensurePreviewBox(){
  if (document.getElementById("besoinApercu")) return;
  const card = document.querySelector('#tab-reappro .card:nth-of-type(2)'); // "Saisie Besoins J+1"
  if (!card) return;
  const box = document.createElement('div');
  box.id = "besoinApercu";
  box.style.marginTop = "
