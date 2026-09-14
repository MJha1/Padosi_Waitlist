// Padosi waitlist — static server + lightweight lead capture.
// Serves the static site AND captures signups (name + WhatsApp number) to a
// persistent JSONL file, so leads are never lost. View them at /api/leads?key=...
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// Persist to the Railway volume at /data when present; otherwise a local .data
// folder (dot-folder is NOT served by express.static, so leads stay private).
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '.data'));
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
const LEADS_FILE = path.join(DATA_DIR, 'leads.jsonl');
const LEADS_KEY = process.env.LEADS_KEY || '';

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

// --- capture a lead ---
app.post('/api/join', (req, res) => {
  const b = req.body || {};
  const rec = { ts: new Date().toISOString() };
  for (const k of Object.keys(b).slice(0, 20)) {
    rec[String(k).slice(0, 40)] = String(b[k] == null ? '' : b[k]).slice(0, 300);
  }
  try { fs.appendFileSync(LEADS_FILE, JSON.stringify(rec) + '\n'); }
  catch (e) { return res.status(500).json({ ok: false }); }
  res.json({ ok: true });
});

// --- view leads (key-protected): /api/leads?key=YOUR_KEY  (&format=json for raw) ---
app.get('/api/leads', (req, res) => {
  if (!LEADS_KEY || req.query.key !== LEADS_KEY) {
    return res.status(401).type('text').send('Unauthorized. Append ?key=YOUR_KEY');
  }
  let rows = [];
  try {
    rows = fs.readFileSync(LEADS_FILE, 'utf8').trim().split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (e) {}
  if (req.query.format === 'json') return res.json(rows);
  const cols = [];
  rows.forEach(r => Object.keys(r).forEach(k => { if (!cols.includes(k)) cols.push(k); }));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Padosi leads (${rows.length})</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:20px;background:#f7f3ec;color:#241f1a}
h2{font-family:Georgia,serif}table{border-collapse:collapse;width:100%;background:#fff;font-size:13px}
th,td{border:1px solid #e2dccf;padding:6px 9px;text-align:left;vertical-align:top}
th{background:#efe4d3;position:sticky;top:0}tr:nth-child(even){background:#faf7f1}</style>
<h2>Padosi waitlist — ${rows.length} lead${rows.length === 1 ? '' : 's'}</h2>
<div style="overflow:auto"><table><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>
${rows.slice().reverse().map(r => `<tr>${cols.map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</table></div>`;
  res.type('html').send(html);
});

// --- static site ---
app.use(express.static(__dirname, { extensions: ['html'] }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log('Padosi waitlist listening on ' + PORT + ' (data: ' + DATA_DIR + ')'));
