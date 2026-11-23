// Runs backend/Code.gs under Node with small fakes of the Apps Script services, and serves the site plus the API.
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const SITE = path.join(__dirname, '..', '..');
function Sheet(name) { this.name = name; this.cells = {}; this.hidden = false; }
Sheet.prototype.getLastRow = function () { let m = 0; for (const k in this.cells) { const r = +k.split(',')[0]; if (this.cells[k] !== '' && r > m) m = r; } return m; };
Sheet.prototype.getRange = function (r, c, nr, nc) { const sh = this; nr = nr || 1; nc = nc || 1; return {
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { sh.cells[(r + i) + ',' + (c + j)] = x; })); return this; },
  getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(sh.cells[(r + i) + ',' + (c + j)] ?? ''); o.push(row); } return o; },
  setValue(x) { sh.cells[r + ',' + c] = x; return this; }, setFormula(f) { sh.cells[r + ',' + c] = f; return this; },
  clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) delete sh.cells[(r + i) + ',' + (c + j)]; return this; },
  setFontWeight() { return this; }, setFontSize() { return this; } }; };
Sheet.prototype.appendRow = function (row) { const r = this.getLastRow() + 1; row.forEach((x, j) => { this.cells[r + ',' + (j + 1)] = x; }); };
Sheet.prototype.deleteRow = function (r) { const n = {}; for (const k in this.cells) { const [rr, cc] = k.split(',').map(Number); if (rr < r) n[k] = this.cells[k]; else if (rr > r) n[(rr - 1) + ',' + cc] = this.cells[k]; } this.cells = n; };
Sheet.prototype.hideSheet = function () { this.hidden = true; };
const sheets = {};
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)) };
const props = { PASSCODE: 'berg2027', ADMIN_CODE: 'leon-org', ANTHROPIC_API_KEY: 'test-key' };
const ctx = {
  SpreadsheetApp: { getActive: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  Utilities: { formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? d.toISOString().slice(0, 10) : d.toISOString() },
  UrlFetchApp: { fetch: (url, o) => { const p = JSON.parse(o.payload); ctx.lastClaude = { url, headers: o.headers, model: p.model };
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ content: [{ type: 'text', text: 'Mock review for: ' + p.messages[0].content.slice(0, 40) }] }) }; } },
  console
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(SITE, 'backend', 'Code.gs'), 'utf8'), ctx);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/exec')) {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'POST') return res.end(ctx.doGet().s);
      res.end(ctx.doPost({ postData: { contents: b } }).s);
    }); return;
  }
  if (req.url === '/_debug') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ sheets: Object.fromEntries(Object.entries(sheets).map(([k, v]) => [k, v.cells])), props, lastClaude: ctx.lastClaude })); }
  let f = req.url.split('?')[0]; if (f === '/') f = '/index.html';
  const p = path.join(SITE, f);
  if (f === '/config.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end("window.DGT_CONFIG={apiUrl:'http://localhost:8765/exec',names:['Leon','Duncan','Christian','Stefan'],ai:false};"); }
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('nf'); }
  res.setHeader('Content-Type', types[path.extname(p)] || 'application/octet-stream'); res.end(fs.readFileSync(p));
});
server.listen(8765, () => console.log('mock on 8765'));
