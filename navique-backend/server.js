// ORriqo — tiny backend (no framework). Serves the site + saves contact-form messages.
const http = require('http'), fs = require('fs'), path = require('path');

// ---- load .env (simple parser, no dependency) ----
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (e) {}

const PORT = +process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const ORIGIN = process.env.ALLOWED_ORIGIN || '';
const DATA = path.join(__dirname, 'data'), FILE = path.join(DATA, 'contacts.jsonl');
const PUB = path.join(__dirname, 'public');
fs.mkdirSync(DATA, { recursive: true });

let nodemailer = null; try { nodemailer = require('nodemailer'); } catch (e) {}
const mailOn = () => nodemailer && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.NOTIFY_EMAIL;

// ---- helpers ----
const SERVICES = ['Website Development', 'AI Agents', 'AI Automation', 'Other'];
const hits = new Map(); // ip -> [timestamps]  (5 messages / 10 min)
function limited(ip) {
  const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 600000);
  if (a.length >= 5) { hits.set(ip, a); return true; }
  a.push(now); hits.set(ip, a); return false;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function send(res, code, body, type = 'application/json') {
  const h = { 'Content-Type': type + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
  const allowOrigin = ORIGIN || '*';
  h['Access-Control-Allow-Origin'] = allowOrigin;
  h['Access-Control-Allow-Headers'] = 'Content-Type, Accept';
  h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  res.writeHead(code, h); res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((ok, no) => {
    let d = ''; req.on('data', c => { d += c; if (d.length > 20000) { no(new Error('big')); req.destroy(); } });
    req.on('end', () => ok(d)); req.on('error', no);
  });
}
function validate(b) {
  const v = k => (typeof b[k] === 'string' ? b[k].trim() : '');
  const x = { name: v('name'), email: v('email'), service: v('service'), details: v('details') };
  if (!x.name || x.name.length > 100) return { err: 'Enter your name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x.email) || x.email.length > 200) return { err: 'Enter a valid email.' };
  if (!SERVICES.includes(x.service)) return { err: 'Choose a service.' };
  if (x.details.length < 10 || x.details.length > 5000) return { err: 'Add a few details (10+ characters).' };
  return { ok: x };
}
async function notify(m) {
  if (!mailOn()) return;
  try {
    const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: +process.env.SMTP_PORT || 465, secure: (+process.env.SMTP_PORT || 465) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    await t.sendMail({ from: process.env.SMTP_USER, to: process.env.NOTIFY_EMAIL, replyTo: m.email, subject: `New ORriqo enquiry: ${m.service} — ${m.name}`, text: `Name: ${m.name}\nEmail: ${m.email}\nService: ${m.service}\nTime: ${m.time}\n\n${m.details}` });
  } catch (e) { console.error('Email failed (message is still saved):', e.message); }
}

// ---- server ----
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res, 200, { ok: true, status: 'online', time: new Date().toISOString() });
    }

    if (req.method === 'POST' && url.pathname === '/api/contact') {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (limited(ip)) return send(res, 429, { ok: false, error: 'Too many messages. Please try later.' });
      let b; try { b = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { ok: false, error: 'Invalid request.' }); }
      if (b.website) return send(res, 200, { ok: true }); // honeypot: pretend success to bots
      const r = validate(b || {}); if (r.err) return send(res, 400, { ok: false, error: r.err });
      const m = { id: Date.now().toString(36), time: new Date().toISOString(), ...r.ok };
      fs.appendFileSync(FILE, JSON.stringify(m) + '\n');
      notify(m); // don't wait for email
      return send(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/admin') {
      if (!ADMIN_KEY || url.searchParams.get('key') !== ADMIN_KEY) return send(res, 401, 'Unauthorized', 'text/plain');
      const rows = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).reverse() : [];
      if (url.searchParams.get('format') === 'json') return send(res, 200, rows);
      const body = rows.map(m => `<tr><td>${esc(new Date(m.time).toLocaleString())}</td><td>${esc(m.name)}</td><td><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></td><td>${esc(m.service)}</td><td style="white-space:pre-wrap">${esc(m.details)}</td></tr>`).join('');
      return send(res, 200, `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>ORriqo messages</title><style>body{font:15px system-ui;background:#0b0b0b;color:#eee;padding:24px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #333;padding:10px;text-align:left;vertical-align:top}th{color:#FF7138}a{color:#FF7138}</style><h2>Messages (${rows.length})</h2><table><tr><th>Time</th><th>Name</th><th>Email</th><th>Service</th><th>Details</th></tr>${body}</table>`, 'text/html');
    }

    if (req.method === 'GET') { // static site
      let p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const f = path.normalize(path.join(PUB, p));
      if (!f.startsWith(PUB + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(res);
    }
    send(res, 404, { ok: false });
  } catch (e) { console.error(e); send(res, 500, { ok: false, error: 'Server error.' }); }
}).listen(PORT, () => console.log(`ORriqo running on http://localhost:${PORT}  (email alerts: ${mailOn() ? 'on' : 'off'}; admin: ${ADMIN_KEY ? '/admin?key=…' : 'DISABLED — set ADMIN_KEY'})`));
