// Link previews for paintings. Crawlers (Telegram, Viber, Facebook, iMessage…) don't run JS and GitHub Pages
// serves only static files, so every visible painting gets a static page w/<id>.html with its own Open Graph
// tags (title, price, size, technique) and a 1200×630 JPEG of the painting on the cream wall. A visitor who
// opens the page is sent on to index.html#work-<id>. Pages of hidden/deleted works are removed.
//
// Run by .github/workflows/work-previews.yml (needs `sharp`). Local test without Supabase:
//   PREVIEW_ITEMS=items.json PREVIEW_OUT=/tmp/w node .github/scripts/work-previews.mjs
// (img may then be a path relative to the repo root).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const OUT = process.env.PREVIEW_OUT || path.join(ROOT, 'w');
const MANIFEST = path.join(OUT, 'previews.json');
const RENDER_VERSION = 1; // bump to re-render every image
const W = 1200, H = 630;
const WALL = { r: 233, g: 228, b: 220 };

const read = (f) => fs.readFile(path.join(ROOT, f), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

// Same rules as the site (index.html → fmtSize/money).
const fmtSize = (s) => {
  let t = String(s || '').trim();
  if (!t) return '';
  t = t.replace(/(\d)\s*[xXхХ×*]\s*(?=\d)/g, '$1 × ');
  t = t.replace(/(\d)\s*(см|cm)\.?/gi, '$1 см');
  if (/^\d+(?:[.,]\d+)?(?: × \d+(?:[.,]\d+)?)+$/.test(t)) t += ' см';
  return t;
};
const money = (n) => n.toLocaleString('uk-UA').replace(/,/g, ' ') + ' ₴';

// The public site address comes from index.html's og:url, so a custom domain only needs changing there.
const index = await read('index.html');
const site = ((index.match(/<meta property="og:url" content="([^"]+)"/) || [])[1] || '').replace(/\/?$/, '/');
if (!/^https?:\/\//.test(site)) throw new Error('og:url not found in index.html');

async function loadItems() {
  if (process.env.PREVIEW_ITEMS) return JSON.parse(await fs.readFile(process.env.PREVIEW_ITEMS, 'utf8'));
  const cfg = await read('supabase-config.js');
  const url = (cfg.match(/url:\s*["']([^"']+)/) || [])[1];
  const key = (cfg.match(/anonKey:\s*["']([^"']+)/) || [])[1];
  if (!url || !key) throw new Error('Supabase is not configured in supabase-config.js');
  const r = await fetch(url + '/rest/v1/items?select=id,cat,title,price,size,tech,year,img,hidden&order=sort_order.asc', { headers: { apikey: key } });
  if (!r.ok) throw new Error('Supabase items: HTTP ' + r.status);
  return r.json();
}

async function imageBytes(src) {
  if (!/^https?:\/\//.test(src)) return fs.readFile(path.join(ROOT, src));
  const r = await fetch(src);
  if (!r.ok) throw new Error(src + ': HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

let sharp;
async function render(src, file) {
  if (!sharp) sharp = (await import('sharp')).default;
  const input = await imageBytes(src);
  const meta = await sharp(input).metadata();
  const s = Math.min(1080 / meta.width, (H - 84) / meta.height);
  const w = Math.round(meta.width * s), h = Math.round(meta.height * s);
  const left = Math.round((W - w) / 2), top = Math.round((H - h) / 2) - 4;
  const art = await sharp(input).resize(w, h).removeAlpha().toBuffer();
  // soft gallery shadow under the canvas, a little lower than the painting (light from above)
  const shadow = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter></defs>` +
    `<rect x="${left + 10}" y="${top + 26}" width="${w - 20}" height="${h - 12}" fill="rgb(20,19,15)" fill-opacity=".34" filter="url(#b)"/>` +
    `<rect x="${left}" y="${top + 2}" width="${w}" height="${h}" fill="rgb(20,19,15)" fill-opacity=".12"/></svg>`
  );
  await sharp({ create: { width: W, height: H, channels: 3, background: WALL } })
    .composite([{ input: shadow }, { input: art, left, top }])
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(file);
}

function page(it, v) {
  const title = String(it.title || '').trim() || 'Картина';
  const price = it.price > 0 ? money(it.price) : 'ціна за запитом';
  const details = [String(it.tech || '').trim(), fmtSize(it.size), String(it.year || '').trim()].filter(Boolean).join(' · ');
  const ogTitle = `«${title}» — ${price}`;
  const desc = (details ? details + '. ' : '') + 'Авторська робота Катерини Онокало, єдиний екземпляр.';
  const self = `${site}w/${it.id}.html`;
  const target = `../#work-${it.id}`;
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Катерина Онокало</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex, follow">
<meta name="theme-color" content="#E9E4DC">
<meta property="og:type" content="website">
<meta property="og:locale" content="uk_UA">
<meta property="og:site_name" content="Катерина Онокало">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(self)}">
<meta property="og:image" content="${esc(`${site}w/${it.id}.jpg?v=${v}`)}">
<meta property="og:image:width" content="${W}">
<meta property="og:image:height" content="${H}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="../img/favicon.svg">
<script>location.replace(${JSON.stringify(target)});</script>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#E9E4DC;color:#1B1A16;font:300 17px/1.6 Georgia,serif;text-align:center}a{color:#B4501C}</style>
</head>
<body>
<p><a href="${esc(target)}">«${esc(title)}»</a><br>Катерина Онокало</p>
</body>
</html>
`;
}

const items = await loadItems();
// same split as index.html → applyRows: every other category is a painting
const works = items.filter(it => it && it.id && it.img && !it.hidden && !['postcards', 'boxes', 'projects', 'workshops'].includes(it.cat)
  && /^[A-Za-z0-9-]+$/.test(String(it.id)));
await fs.mkdir(OUT, { recursive: true });
let manifest = {};
try { manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8')); } catch (e) {}
const next = {};
let rendered = 0, pages = 0, failed = 0;
for (const it of works) {
  const id = String(it.id);
  const v = hash(RENDER_VERSION + '|' + it.img);
  const jpg = path.join(OUT, id + '.jpg');
  let have = manifest[id] === v;
  if (have) { try { await fs.access(jpg); } catch (e) { have = false; } }
  if (!have) {
    try { await render(it.img, jpg); rendered++; } catch (e) { console.warn('skip', id, e.message); failed++; if (manifest[id]) next[id] = manifest[id]; continue; }
  }
  next[id] = v;
  const html = page(it, v), file = path.join(OUT, id + '.html');
  let old = '';
  try { old = await fs.readFile(file, 'utf8'); } catch (e) {}
  if (old !== html) { await fs.writeFile(file, html); pages++; }
}
// works that were hidden or deleted lose their pages
let removed = 0;
for (const f of await fs.readdir(OUT)) {
  const m = f.match(/^(.+)\.(html|jpg)$/);
  if (m && !next[m[1]]) { await fs.rm(path.join(OUT, f)); removed++; }
}
await fs.writeFile(MANIFEST, JSON.stringify(next, null, 1) + '\n');
console.log(`works: ${works.length}, images rendered: ${rendered}, pages written: ${pages}, files removed: ${removed}, failed: ${failed}`);
if (failed && failed === works.length) process.exit(1);
