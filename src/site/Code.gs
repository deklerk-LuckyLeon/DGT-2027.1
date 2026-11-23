/**
 * DGT 2027 planner backend.
 * Paste into the group sheet: Extensions > Apps Script. Set three Script properties
 * (Project settings > Script properties): PASSCODE, ADMIN_CODE, ANTHROPIC_API_KEY.
 * Deploy > New deployment > Web app: Execute as "Me", Who has access "Anyone".
 *
 * Storage: a hidden tab "_data" holds every shared record (collection, id, JSON, updated).
 * Each person's shared gear list is also written as readable rows to their own tab.
 */
var COLLECTIONS = ['datepoll', 'gclaims', 'gitems', 'gneed', 'people', 'foods'];
var DATA_TAB = '_data';
var REVIEW_MODEL = 'claude-sonnet-5-5';
var REVIEWS_PER_DAY = 20;

function doGet() {
  return out_({ ok: true, service: 'DGT 2027 planner backend' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();
    if (!req.k || req.k !== props.getProperty('PASSCODE')) return out_({ ok: false, code: 'auth', error: 'Wrong passcode' });
    var who = clean_(req.who, 40);
    var admin = !!req.admin && req.admin === props.getProperty('ADMIN_CODE');
    switch (req.a) {
      case 'auth':
        return out_({ ok: true, admin: admin });
      case 'all':
        return out_({ ok: true, data: readAll_(), trip: readDoc_('trip', 'main'), admin: admin });
      case 'set':
        if (COLLECTIONS.indexOf(req.c) < 0) return bad_('Unknown list');
        lock.waitLock(10000);
        writeDoc_(req.c, clean_(req.id, 120), req.d);
        return out_({ ok: true });
      case 'del':
        if (COLLECTIONS.indexOf(req.c) < 0) return bad_('Unknown list');
        lock.waitLock(10000);
        deleteDoc_(req.c, clean_(req.id, 120));
        return out_({ ok: true });
      case 'trip':
        if (!admin) return out_({ ok: false, code: 'not_writer', error: 'Organiser code needed' });
        lock.waitLock(10000);
        writeDoc_('trip', 'main', req.d);
        return out_({ ok: true });
      case 'getgear':
        if (!who) return bad_('No name');
        return out_({ ok: true, gear: readDoc_('users', slug_(who)) });
      case 'gear':
        if (!who) return bad_('No name');
        lock.waitLock(10000);
        if (req.d) writeDoc_('users', slug_(who), req.d); else deleteDoc_('users', slug_(who));
        writeGearTab_(who, req.rows || []);
        return out_({ ok: true });
      case 'review':
        return review_(String(req.prompt || ''), props);
      default:
        return bad_('Unknown action');
    }
  } catch (err) {
    return out_({ ok: false, code: 'error', error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/* ---------- storage ---------- */
function sheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(DATA_TAB);
  if (!sh) {
    sh = ss.insertSheet(DATA_TAB);
    sh.getRange(1, 1, 1, 4).setValues([['collection', 'id', 'json', 'updated']]);
    sh.hideSheet();
  }
  return sh;
}
function rows_() {
  var sh = sheet_(), n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, 4).getValues();
}
function readAll_() {
  var data = {};
  COLLECTIONS.forEach(function (c) { data[c] = {}; });
  rows_().forEach(function (r) {
    if (data[r[0]] && r[2]) { try { data[r[0]][r[1]] = JSON.parse(r[2]); } catch (e) {} }
  });
  return data;
}
function readDoc_(c, id) {
  var rs = rows_();
  for (var i = 0; i < rs.length; i++) if (rs[i][0] === c && String(rs[i][1]) === id) { try { return JSON.parse(rs[i][2]); } catch (e) { return null; } }
  return null;
}
function writeDoc_(c, id, d) {
  if (!id) throw new Error('No id');
  var json = JSON.stringify(d == null ? null : d);
  if (json.length > 45000) throw new Error('Too large');
  var sh = sheet_(), rs = rows_(), now = new Date();
  for (var i = 0; i < rs.length; i++) if (rs[i][0] === c && String(rs[i][1]) === id) { sh.getRange(i + 2, 3, 1, 2).setValues([[json, now]]); return; }
  sh.appendRow([c, id, json, now]);
}
function deleteDoc_(c, id) {
  var sh = sheet_(), rs = rows_();
  for (var i = rs.length - 1; i >= 0; i--) if (rs[i][0] === c && String(rs[i][1]) === id) sh.deleteRow(i + 2);
}

/* ---------- readable gear tab per person ---------- */
function writeGearTab_(who, rows) {
  var ss = SpreadsheetApp.getActive();
  var name = who.replace(/[\[\]\*\?\/\\:]/g, '').slice(0, 30) || 'Unnamed';
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1).setValue(name + "'s gear list").setFontWeight('bold').setFontSize(14);
    sh.getRange(4, 11, 1, 4).setValues([['Setup', 'Own gear (kg)', 'Worn (kg)', 'Own consumables (kg)']]).setFontWeight('bold');
    sh.getRange(5, 11).setFormula('=IFERROR(UNIQUE(FILTER($A$5:$A,$A$5:$A<>"",$A$5:$A<>"Food",$A$5:$A<>"Totals")),"")');
    [5, 6].forEach(function (r) {
      ['Carried gear', 'Worn', 'Consumable'].forEach(function (kind, j) {
        sh.getRange(r, 12 + j).setFormula('=IF($K' + r + '="","",SUMIFS($I$5:$I,$A$5:$A,$K' + r + ',$C$5:$C,"' + kind + '",$B$5:$B,"<>Group:*")/1000)');
      });
    });
  }
  sh.getRange(2, 1).setValue(rows.length ? 'Saved from the planner on ' + Utilities.formatDate(new Date(), 'Europe/Berlin', 'd MMM yyyy, HH:mm') + '. Edit gear in the planner; changes here are overwritten.' : 'Not shared from the planner.');
  var last = Math.max(sh.getLastRow(), 4);
  if (last >= 4) sh.getRange(4, 1, last - 3, 9).clearContent();
  if (rows.length) {
    var clean = rows.slice(0, 400).map(function (r) { var o = []; for (var i = 0; i < 9; i++) o.push(r[i] == null ? '' : (typeof r[i] === 'number' ? r[i] : String(r[i]).slice(0, 120).replace(/^[=+\-@]/, "'$&"))); return o; });
    sh.getRange(4, 1, clean.length, 9).setValues(clean);
    sh.getRange(4, 1, 1, 9).setFontWeight('bold');
  }
}

/* ---------- Claude review ---------- */
function review_(prompt, props) {
  var key = props.getProperty('ANTHROPIC_API_KEY');
  if (!key) return out_({ ok: false, code: 'not_granted', error: 'No API key set' });
  if (!prompt || prompt.length > 12000) return bad_('Prompt missing or too long');
  var day = Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd');
  var used = Number(props.getProperty('REVIEWS_' + day) || 0);
  if (used >= REVIEWS_PER_DAY) return out_({ ok: false, code: 'limit', error: 'Daily review limit reached' });
  props.setProperty('REVIEWS_' + day, String(used + 1));
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: REVIEW_MODEL, max_tokens: 900, messages: [{ role: 'user', content: prompt }] })
  });
  var code = res.getResponseCode(), body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) {}
  if (code !== 200) return out_({ ok: false, code: code === 429 ? 'limit' : 'error', error: (body.error && body.error.message) || ('Claude API error ' + code) });
  var text = (body.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n');
  return out_({ ok: true, text: text });
}

/* ---------- helpers ---------- */
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function bad_(m) { return out_({ ok: false, code: 'invalid_argument', error: m }); }
function clean_(s, n) { return String(s == null ? '' : s).trim().slice(0, n); }
function slug_(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
