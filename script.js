/** =========================================
 *  Backend ONU Suivi Stock — Plan J+1 robuste
 *  - Dates robustes (objets Date ou texte)
 *  - Normalisation des clés (équipes/matériels)
 *  - Debug optionnel via plan=reappro&date=YYYY-MM-DD&debug=1
 * ========================================= */

function doGet(e) {
  try {
    const p = e && e.parameter || {};
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    /* --- Ping --- */
    if (p.test === "1" || p.ping === "1") {
      return createJsonResponse({
        status: "OK",
        timestamp: new Date().toISOString(),
        spreadsheetId: ss.getId(),
        spreadsheetName: ss.getName()
      });
    }

    /* --- Etat des stocks par zone (table 2D) --- */
    if (p.etat === "1" && p.zone) {
      const sheet = ss.getSheetByName("État des Stocks");
      if (!sheet) return createJsonResponse({ error: "Feuille 'État des Stocks' introuvable" });
      const data = safeGetValues(sheet);
      const out = [["Matériel","Quantité"]];
      const zone = String(p.zone).trim();
      for (let i=1;i<data.length;i++){
        if (String(data[i][0]||"").trim() === zone) out.push([data[i][1], data[i][2]]);
      }
      return createJsonResponse(out);
    }

    /* --- Référentiels --- */
    if (p.get === "equipes")   return createJsonResponse(listEquipes_(ss));
    if (p.get === "materiels") return createJsonResponse(listMateriels_(ss));
    if (p.get === "zones")     return createJsonResponse(listZonesBrutes_(ss)); // compat

    /* --- Saisie besoins J+1 (batch) --- */
    if (p.action === "addBesoinsBatch") {
      const date = p.date;
      const equipe = p.equipe;
      const lignes = JSON.parse(p.lignes || "[]");
      if (!date || !equipe || !lignes.length) return createTextResponse("Erreur: paramètres manquants");
      const sh = getOrCreateSheet_("Besoins J+1", ["Horodatage","Date","Équipe","Matériel","Cible","Commentaire"]);
      const now = new Date();
      let count=0;
      lignes.forEach(l=>{
        const mat = (l.materiel||"").toString().trim();
        const cible = parseInt(l.cible,10) || 0;
        if (!mat || cible<=0) return;
        sh.appendRow([now, date, equipe, mat, cible, l.commentaire || ""]);
        count++;
      });
      return createTextResponse(`${count} besoin(s) enregistré(s) pour ${equipe} (${date})`);
    }

    /* --- Saisie restes (clôture J) --- */
    if (p.action === "saveRestesEquipe") {
      const date = p.date;
      const equipe = p.equipe;
      const zone = p.zone || p.equipe;
      const lignes = JSON.parse(p.lignes || "[]");
      if (!date || !equipe || !lignes.length) return createTextResponse("Erreur: paramètres manquants");
      const sh = getOrCreateSheet_("Restes Zones", ["Horodatage","Date","Type","Zone","Matériel","Quantité","Équipe"]);
      const now = new Date();
      let count=0;
      lignes.forEach(l=>{
        const q = parseInt(l.quantite,10) || 0;
        const m = (l.materiel||"").toString().trim();
        if (!m) return;
        sh.appendRow([now, date, "Reste", zone, m, q, equipe]);
        count++;
      });
      return createTextResponse(`${count} ligne(s) de restes enregistrées pour ${equipe} (${date})`);
    }

    /* --- Calcul Plan J+1 (toujours recalculé) --- */
    if (p.plan === "reappro" && p.date) {
      const d1 = String(p.date).trim();
      const debug = p.debug === "1";
      const result = computePlanReapproFromSheets_(d1, debug);
      return createJsonResponse(result);
    }

    /* --- Générer VC -> Bibliothèque (à partir de l'agrégat) --- */
    if (p.action === "genererReappro" && p.date) {
      const d1 = String(p.date).trim();
      const plan = computePlanReapproFromSheets_(d1, false); // à jour
      const agg = plan.agregat || [];
      const sh = getOrCreateSheet_("Stock Bibliothèque", ["Horodatage","Date","Type","Zone","Matériel","Quantité"]);
      const now = new Date();
      let count=0;
      agg.forEach(a=>{
        const mat = a[1]; const q = parseInt(a[2],10)||0;
        if (mat && q>0) { sh.appendRow([now, d1, "Entrée", "Bibliothèque", mat, q]); count++; }
      });
      return createTextResponse(`${count} ligne(s) VC→Bibliothèque générées (plan J+1=${d1}).`);
    }

    /* --- Distribuer Bibliothèque -> Équipes (à partir du détail) --- */
    if (p.action === "distribuerPlan" && p.date) {
      const d1 = String(p.date).trim();
      const plan = computePlanReapproFromSheets_(d1, false);
      const det = plan.details || [];
      const sh = getOrCreateSheet_("Répartition Journalière", ["Horodatage","Date","Type","Zone","Matériel","Quantité"]);
      const now = new Date();
      let count=0;
      det.forEach(r=>{
        const equipe = r[1], zone = r[2], mat = r[3];
        const besoin = parseInt(r[6],10)||0;
        if (equipe && mat && besoin>0) {
          sh.appendRow([now, d1, "Entrée", zone || equipe, mat, besoin]);
          count++;
        }
      });
      return createTextResponse(`${count} ligne(s) Bibliothèque→Équipes générées (J+1=${d1}).`);
    }

    return createTextResponse("Paramètre de requête non reconnu");
  } catch (err) {
    return createJsonResponse({ error: "Erreur serveur: " + (err && err.message || err) });
  }
}

/* ===============================
 *  CALCUL DU PLAN J+1 (robuste)
 * =============================== */
function computePlanReapproFromSheets_(dateJ1, debug) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();
  const d1 = String(dateJ1).trim();
  const d0 = prevDateStr_(d1, tz); // J = J+1 - 1

  // Utilitaires de normalisation libellés
  const labelEqByKey = {};  // norm(eq) -> dernier libellé vu
  const labelMatByKey = {}; // norm(mat) -> dernier libellé vu
  const keyEM = (eq, mat) => norm_(eq) + "||" + norm_(mat);

  // 1) Lire Besoins J+1 -> cible par (équipe, matériel), garder dernière ligne (horodatage max)
  const shB = getOrCreateSheet_("Besoins J+1", ["Horodatage","Date","Équipe","Matériel","Cible","Commentaire"]);
  const db = safeGetValues(shB);
  const cibleMap = {};  // key(e,m) -> {cible, ts}
  for (let i=1;i<db.length;i++){
    const ts    = db[i][0] instanceof Date ? db[i][0].getTime() : 0;
    const dateS = fmtDateCell_(db[i][1], tz);               // <-- robust
    if (dateS !== d1) continue;
    const eq  = String(db[i][2]||"").trim();
    const mat = String(db[i][3]||"").trim();
    const cible = parseInt(db[i][4],10) || 0;
    if (!eq || !mat || cible<=0) continue;

    const k = keyEM(eq, mat);
    if (!cibleMap[k] || ts > cibleMap[k].ts) {
      cibleMap[k] = { cible, ts };
    }
    labelEqByKey[norm_(eq)] = eq;   // garde un libellé propre
    labelMatByKey[norm_(mat)] = mat;
  }

  // 2) Lire Restes Zones au jour J -> reste par (équipe, matériel)
  const shR = getOrCreateSheet_("Restes Zones", ["Horodatage","Date","Type","Zone","Matériel","Quantité","Équipe"]);
  const dr = safeGetValues(shR);
  const resteMap = {}; // key(e,m) -> somme reste
  for (let i=1;i<dr.length;i++){
    const dateS = fmtDateCell_(dr[i][1], tz);               // <-- robust
    if (dateS !== d0) continue;                             // uniquement J (veille)
    const type = String(dr[i][2]||"").toLowerCase();
    if (type !== "reste") continue;
    const mat = String(dr[i][4]||"").trim();
    const qty = parseInt(dr[i][5],10) || 0;
    const eq  = String(dr[i][6]||"").trim();                // colonne Équipe
    if (!eq || !mat) continue;

    const k = keyEM(eq, mat);
    resteMap[k] = (resteMap[k]||0) + qty;

    // mémo libellés
    if (!labelEqByKey[norm_(eq)])  labelEqByKey[norm_(eq)]  = eq;
    if (!labelMatByKey[norm_(mat)]) labelMatByKey[norm_(mat)] = mat;
  }

  // 3) Composer le détail du plan (seulement pour les couples présents dans Besoins J+1)
  const details = []; // [idx, equipe, zone, materiel, resteVeille, cible, besoin]
  const agreg = {};   // mat -> total besoin
  const keys = Object.keys(cibleMap).sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base',numeric:true}));
  let idx = 1;
  keys.forEach(k=>{
    const [keqNorm, kmatNorm] = k.split("||");
    const eqLabel  = labelEqByKey[keqNorm]  || k.split("||")[0];   // fallback norm
    const matLabel = labelMatByKey[kmatNorm] || k.split("||")[1];

    const reste = resteMap[k] || 0;
    const cible = cibleMap[k].cible;
    const besoin = Math.max(cible - reste, 0);

    details.push([idx++, eqLabel, eqLabel /* zone=équipe */, matLabel, reste, cible, besoin]);
    if (besoin>0) agreg[matLabel] = (agreg[matLabel]||0) + besoin;
  });

  const agregat = Object.keys(agreg).sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base',numeric:true}))
                    .map(m=>[0, m, agreg[m]]);

  // 4) Écrire/Remplacer les lignes du jour J+1 dans "Plan Réappro"
  replacePlanRowsForDate_(d1, details);

  const res = { details, agregat, dates: { J: d0, J1: d1 } };
  if (debug) {
    // renvoyer un peu d’info pour diagnostiquer
    res.debug = {
      besoins_count: Object.keys(cibleMap).length,
      restes_count: Object.keys(resteMap).length,
      sample_besoins_keys: Object.keys(cibleMap).slice(0,10),
      sample_restes_keys: Object.keys(resteMap).slice(0,10)
    };
  }
  return res;
}

function replacePlanRowsForDate_(d1, details) {
  const sh = getOrCreateSheet_("Plan Réappro", ["Date J+1","Équipe","Zone","Matériel","Reste veille","Cible","Besoin"]);
  const data = safeGetValues(sh);
  const out = [data[0] || ["Date J+1","Équipe","Zone","Matériel","Reste veille","Cible","Besoin"]];

  // conserver les autres dates
  for (let i=1;i<data.length;i++){
    const dateS = fmtDateCell_(data[i][0], Session.getScriptTimeZone());
    if (dateS && dateS !== d1) out.push([
      dateS, data[i][1], data[i][2], data[i][3], data[i][4], data[i][5], data[i][6]
    ]);
  }
  // ajouter les nouvelles lignes du d1
  details.forEach(r=>{
    out.push([d1, r[1], r[2], r[3], r[4], r[5], r[6]]);
  });

  // réécrire proprement
  sh.clearContents();
  sh.getRange(1,1,out.length,out[0].length).setValues(out);
}

/* ===============================
 *  Utils
 * =============================== */
function fmtDateCell_(cell, tz) {
  // Retourne "yyyy-MM-dd" quelle que soit la forme de la cellule
  if (cell instanceof Date) {
    return Utilities.formatDate(cell, tz || Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const s = String(cell || "").trim();
  if (!s) return "";
  // Si déjà "yyyy-mm-dd"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Sinon tentative de parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, tz || Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  // Dernier recours: on garde tel quel (mais ne "matchera" sans doute pas)
  return s;
}

function prevDateStr_(dateStr, tz){
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr; // fallback
  d.setDate(d.getDate()-1);
  return Utilities.formatDate(d, tz || Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function createTextResponse(text) {
  return ContentService.createTextOutput(String(text)).setMimeType(ContentService.MimeType.TEXT);
}
function safeGetValues(sheet){
  try { return sheet.getDataRange().getValues(); } catch(_){ return []; }
}
function getOrCreateSheet_(name, headers){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) sh.appendRow(headers);
  } else {
    if (sh.getLastRow() === 0 && headers && headers.length) sh.appendRow(headers);
  }
  return sh;
}
function localeSortFR_(a,b){ return String(a).localeCompare(String(b), 'fr', { sensitivity:'base', numeric:true }); }
function norm_(s){ return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim().toLowerCase(); }

/* --- Référentiels --- */
function listEquipes_(ss){
  const shRef = ss.getSheetByName("Référentiels");
  if (shRef) {
    const data = safeGetValues(shRef);
    const out = [], seen = new Set();
    for (let i=1;i<data.length;i++){
      const v = (data[i][0]||"").toString().trim();
      if (!v) continue;
      const k = norm_(v); if (seen.has(k)) continue;
      seen.add(k); out.push(v);
    }
    return out.sort(localeSortFR_);
  }
  const zones = listZonesBrutes_(ss);
  const ignore = new Set(["Voie Creuse","Bibliothèque","B26","Compactus","Reading Room 1","Reading Room 2","reading room 1","reading room 2","compactus","b26"]);
  return zones.filter(z=>!ignore.has(z)).sort(localeSortFR_);
}
function listMateriels_(ss){
  const mats = new Map();
  const shRef = ss.getSheetByName("Référentiels");
  if (shRef) {
    const data = safeGetValues(shRef);
    for (let i=1;i<data.length;i++){
      const m = (data[i][1]||"").toString().trim();
      if (!m) continue;
      const k = norm_(m);
      if (!mats.has(k)) mats.set(k, m);
    }
    return Array.from(mats.values()).sort(localeSortFR_);
  }
  const feuilles = ["Stock Voie Creuse","Stock Bibliothèque","Répartition Journalière","Restes Zones","Besoins J+1","Plan Réappro","État des Stocks"];
  feuilles.forEach(n=>{
    const sh = ss.getSheetByName(n);
    if (!sh) return;
    const data = safeGetValues(sh);
    for (let i=1;i<data.length;i++){
      let m = null;
      if (n === "Plan Réappro") m = data[i][3];
      else if (n === "Besoins J+1") m = data[i][3];
      else if (n === "État des Stocks") m = data[i][1];
      else m = data[i][4];
      const s = (m||"").toString().trim();
      if (!s) continue;
      const k = norm_(s);
      if (!mats.has(k)) mats.set(k, s);
    }
  });
  return Array.from(mats.values()).sort(localeSortFR_);
}
function listZonesBrutes_(ss){
  const zones = new Map();
  const feuilles = ["Stock Voie Creuse","Stock Bibliothèque","Répartition Journalière","Restes Zones","État des Stocks","Besoins J+1","Plan Réappro","Référentiels"];
  feuilles.forEach(n=>{
    const sh = ss.getSheetByName(n);
    if (!sh) return;
    const data = safeGetValues(sh);
    if (!data.length) return;
    if (n === "État des Stocks") {
      for (let i=1;i<data.length;i++){
        const s = (data[i][0]||"").toString().trim();
        if (!s) continue;
        const k = norm_(s); if (!zones.has(k)) zones.set(k, s);
      }
    } else if (n === "Référentiels") {
      for (let i=1;i<data.length;i++){
        const s = (data[i][0]||"").toString().trim();
        if (!s) continue;
        const k = norm_(s); if (!zones.has(k)) zones.set(k, s);
      }
    } else {
      for (let i=1;i<data.length;i++){
        const s = (data[i][3]||"").toString().trim();
        if (!s) continue;
        const k = norm_(s); if (!zones.has(k)) zones.set(k, s);
      }
    }
  });
  return Array.from(zones.values()).sort(localeSortFR_);
}
