// Pages and data for search engines and link previews. Crawlers (Google, Telegram, Viber, Facebook…) get plain
// HTML — GitHub Pages serves only static files and the site itself is drawn by JS — so this script writes:
//  · w/<id>.html — a real page for every visible painting: photo, title, hall, technique · size · year,
//    description, price, «Замовити в Telegram», more works; canonical + JSON-LD (Product/VisualArtwork + Offer,
//    breadcrumbs) + Open Graph with a 1200×630 w/<id>.jpg of the painting on the cream wall (link previews).
//    Pages of hidden/deleted works are removed (404.html sends old links to the site).
//  · index.html, between <!-- ko:snapshot --> markers: a JSON snapshot of the catalogue — the site shows it at once
//    and then refreshes from Supabase; between <!-- ko:catalog --> markers: «Усі роботи», a plain list of every
//    work linking to its page (in the contact section) — readable without JS.
//  · en/w/<id>.html — the same page in English (title_en / tech_en / description_en, hall name_en), hreflang pairs.
//  · sitemap.xml — the site (UA + ?lang=en), info pages and every work page in both languages (with its image).
// Nothing is rewritten when nothing changed. Run by .github/workflows/work-previews.yml (needs `sharp`).
// Local test without Supabase (in a copy of the repo — it rewrites index.html and sitemap.xml in place):
//   PREVIEW_ITEMS=data.json node .github/scripts/work-previews.mjs
//   (data.json: {items, halls, settings} or just the items array; img may be a path relative to the repo root)
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'w');
const OUT_EN = path.join(ROOT, 'en', 'w'); // English twins of the work pages
const MANIFEST = path.join(OUT, 'previews.json');
const RENDER_VERSION = 1; // bump to re-render every image
const W = 1200, H = 630;
const WALL = { r: 233, g: 228, b: 220 };
const NOT_PAINTINGS = ['postcards', 'boxes', 'projects', 'workshops']; // same split as index.html → applyRows
const OTHER = 'Інші роботи';

const read = (f) => fs.readFile(path.join(ROOT, f), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const today = new Date().toISOString().slice(0, 10);

// Same rules as the site (index.html → fmtSize / money / translit / thumbOf / dims).
const fmtSize = (s) => {
  let t = String(s || '').trim();
  if (!t) return '';
  t = t.replace(/(\d)\s*[xXхХ×*]\s*(?=\d)/g, '$1 × ');
  t = t.replace(/(\d)\s*(см|cm)\.?/gi, '$1 см');
  if (/^\d+(?:[.,]\d+)?(?: × \d+(?:[.,]\d+)?)+$/.test(t)) t += ' см';
  return t;
};
const money = (n) => n.toLocaleString('uk-UA').replace(/,/g, ' ') + ' ₴';
const TR = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'io', ъ: '' };
const translit = (s) => String(s || '').toLowerCase().split('').map(c => (TR[c] !== undefined ? TR[c] : c)).join('')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
const thumbOf = (url) => String(url || '').replace(/-full\.(webp|jpe?g)(?=$|\?)/i, '-thumb.$1');
const dims = (url) => { const m = String(url || '').match(/-(\d{2,5})x(\d{2,5})-(?:full|thumb)\./); return m ? { w: +m[1], h: +m[2] } : null; };
const rel = (src) => (/^https?:\/\//.test(src) ? src : '../' + src); // local test images live next to the site

// The public address comes from index.html's og:url (a custom domain only needs changing there); Telegram from its JSON-LD.
const index = await read('index.html');
const site = ((index.match(/<meta property="og:url" content="([^"]+)"/) || [])[1] || '').replace(/\/?$/, '/');
if (!/^https?:\/\//.test(site)) throw new Error('og:url not found in index.html');
const tg = (index.match(/https:\/\/t\.me\/([A-Za-z0-9_]+)/) || [])[1] || 'kate_art_tort';

async function loadData() {
  if (process.env.PREVIEW_ITEMS) {
    const d = JSON.parse(await fs.readFile(process.env.PREVIEW_ITEMS, 'utf8'));
    return Array.isArray(d) ? { items: d, halls: [], settings: [] } : { items: d.items || [], halls: d.halls || [], settings: d.settings || [] };
  }
  const cfg = await read('supabase-config.js');
  const url = (cfg.match(/url:\s*["']([^"']+)/) || [])[1];
  const key = (cfg.match(/anonKey:\s*["']([^"']+)/) || [])[1];
  if (!url || !key) throw new Error('Supabase is not configured in supabase-config.js');
  const get = async (q, soft) => {
    const r = await fetch(url + '/rest/v1/' + q, { headers: { apikey: key } });
    if (!r.ok) { if (soft) return []; throw new Error('Supabase ' + q + ': HTTP ' + r.status); }
    return r.json();
  };
  const [items, halls, settings] = await Promise.all([
    get('items?select=*&order=sort_order.asc'), get('halls?select=*&order=sort_order.asc', true), get('settings?select=*', true)
  ]);
  return { items, halls, settings };
}

// Visible paintings in halls exactly like the site's hallGroups(): halls table order, then halls only referenced by
// works, then works without a hall («Інші роботи»); same slugs, so breadcrumbs open the right hall.
function hallGroups(works, halls) {
  const strip = (s) => String(s || '').replace(/^Зала\s+\S+\s*·\s*/, '').trim();
  const map = new Map();
  const add = (key, name) => { if (!map.has(key)) map.set(key, { key, name, title: strip(name) || name, works: [] }); return map.get(key); };
  halls.forEach((h) => add(h.name || '', h.name || ''));
  works.forEach((w) => { const k = w.hall || ''; (map.get(k) || add(k, k || OTHER)).works.push(w); });
  const list = [...map.values()].filter(g => g.works.length).sort((a, b) => (a.key ? 0 : 1) - (b.key ? 0 : 1));
  const used = new Set();
  list.forEach((g, i) => {
    let slug = 'hall-' + (translit(g.key ? g.title : OTHER) || String(i + 1));
    while (used.has(slug)) slug += '-' + (i + 1);
    used.add(slug);
    g.slug = slug;
  });
  return list;
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

const CSS = `:root{--bg:#E9E4DC;--ink:#1B1A16;--ink2:#3B3830;--muted:#857F74;--terra:#B4501C;--btn:#0A1C3B;--btn-ink:#E9E4DC;--line:rgba(27,26,22,.18)}
[data-theme="dark"]{--bg:#0A1C3B;--ink:#E9E4DC;--ink2:#E7E0D3;--muted:#A39C8D;--terra:#E07A4F;--btn:#E9E4DC;--btn-ink:#0A1C3B;--line:rgba(233,228,220,.3)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:300 16px/1.6 "Commissioner",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
a:hover{color:var(--terra)}
.top,.work,.more,footer{max-width:1280px;margin:0 auto;padding-left:clamp(18px,4vw,52px);padding-right:clamp(18px,4vw,52px)}
.top{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:16px;padding-bottom:16px;border-bottom:1px solid var(--line)}
.logo{display:flex;flex-direction:column;line-height:1.05}
.logo b{font:400 19px/1.05 "Cormorant Garamond",serif;letter-spacing:.18em;text-transform:uppercase}
.logo span{font-size:8.5px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);padding-left:2px}
.back{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink2);white-space:nowrap}
.tr{display:flex;align-items:center;gap:18px}
.lang{font-size:10.5px;letter-spacing:.18em;border:1px solid var(--line);border-radius:999px;padding:6px 12px}
.work{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:clamp(28px,5vw,72px);align-items:center;padding-top:clamp(28px,5vw,64px);padding-bottom:clamp(40px,6vw,80px)}
@media (max-width:820px){.work{grid-template-columns:1fr}}
.art{margin:0;display:flex;justify-content:center}
.art img{display:block;max-width:100%;width:auto;height:auto;max-height:78vh;box-shadow:0 50px 80px -40px rgba(20,19,15,.55),0 4px 12px rgba(20,19,15,.16)}
.crumbs{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--terra)}
h1{font:italic 300 clamp(34px,4.6vw,60px)/1.05 "Cormorant Garamond",serif;margin:14px 0 8px}
.en{margin:0 0 16px;color:var(--muted);font-size:14px}
.meta{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 22px;line-height:1.7}
.desc{font-size:16px;line-height:1.75;color:var(--ink2);margin:0 0 26px;max-width:46ch;white-space:pre-line}
.price{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:14px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin:0 0 24px}
.price b{font:400 clamp(28px,3vw,36px) "Cormorant Garamond",serif}
.price span{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.price b[data-st]::before{content:"";display:inline-block;width:.32em;height:.32em;border-radius:50%;margin-right:.4em;vertical-align:.12em}
.price b[data-st=sold]::before{background:#C4552A;box-shadow:0 0 0 .14em rgba(196,85,42,.18)}
.price b[data-st=reserved]::before{box-shadow:inset 0 0 0 1.5px #C7A17A}
.actions{display:flex;flex-wrap:wrap;gap:12px}
.btn{display:inline-flex;align-items:center;min-height:48px;padding:0 28px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;background:var(--btn);color:var(--btn-ink);transition:background-color .3s ease,color .3s ease,border-color .3s ease}
.btn:hover{background:var(--terra);color:#F3EFE8}
.btn.line{background:none;color:var(--ink);border:1px solid var(--line)}
.btn.line:hover{background:var(--btn);color:var(--btn-ink);border-color:var(--btn)}
.note{font-size:12.5px;color:var(--muted);margin:18px 0 0;line-height:1.6}
.more{padding-bottom:clamp(48px,6vw,80px)}
.more h2{font:300 clamp(24px,2.6vw,34px)/1.15 "Cormorant Garamond",serif;margin:0 0 24px;padding-top:32px;border-top:1px solid var(--line)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(44%,220px),1fr));gap:28px 18px}
.frame{aspect-ratio:4/5;display:flex;align-items:flex-end;justify-content:center}
.frame img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;box-shadow:0 22px 34px -22px rgba(20,19,15,.5)}
.more .t{display:block;font:italic 300 19px/1.2 "Cormorant Garamond",serif;margin-top:14px}
.more .p{display:block;font-size:13px;color:var(--muted);margin-top:4px}
footer{display:flex;flex-wrap:wrap;gap:10px 24px;justify-content:space-between;padding-top:22px;padding-bottom:34px;border-top:1px solid var(--line);font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
footer nav{display:flex;flex-wrap:wrap;gap:10px 22px}`;

const titleOf = (it) => String(it.title || '').trim() || 'Картина';
const detailsOf = (it) => [String(it.tech || '').trim(), fmtSize(it.size), String(it.year || '').trim()].filter(Boolean).join(' · ');

// «Продано» / «Резерв» set in the admin: settings.status = {"<item id>": "sold" | "reserved"} (filled after loadData()).
let STATUS = {};
const statusOf = (id) => (STATUS[String(id)] === 'sold' || STATUS[String(id)] === 'reserved' ? STATUS[String(id)] : '');

// Page texts per language. English pages (en/w/<id>.html) use the *_en columns, falling back to Ukrainian.
const T = {
  uk: {
    htmlLang: 'uk', locale: 'uk_UA', alt: 'en_US', site: 'Катерина Онокало', artist: 'Катерина Онокало', painting: 'картина',
    one: 'Єдиний екземпляр', sold: 'Продано', reserved: 'Резерв', soldNote: 'Вже у новому домі', reservedNote: 'Можна стати в чергу',
    onRequest: 'Ціна за запитом', onRequestLc: 'ціна за запитом', price: 'Ціна', original: 'Авторська робота Катерини Онокало',
    oneLc: 'єдиний екземпляр', gallery: 'Галерея', toHall: 'До зали', toGallery: 'До галереї', other: OTHER,
    btnSold: 'Хочу схожу — у Telegram', btnOrder: 'Замовити в Telegram', btnAsk: 'Запитати в Telegram', open: 'Відкрити в галереї',
    note: 'Оплата й доставка — у Telegram: відповідаю сама. Доставка Україною і за кордон.', commission: 'Картина на замовлення',
    nav: 'Навігація', switchLabel: 'EN', switchTitle: 'English',
    msgSold: (t, l) => `Вітаю! Мені дуже сподобалась ваша робота «${t}» — бачу, що вона вже продана. Чи можете написати схожу?\n${l}`,
    msgOrder: (t, s, p, l) => `Вітаю! Хочу замовити «${t}»${s ? ', ' + s : ''}, ${p}.\n${l}`,
    msgAsk: (t, l) => `Вітаю! Розкажіть детальніше про «${t}»\n${l}`,
    q: (t) => `«${t}»`, artform: 'Живопис'
  },
  en: {
    htmlLang: 'en', locale: 'en_US', alt: 'uk_UA', site: 'Kateryna Onokalo', artist: 'Kateryna Onokalo', painting: 'painting',
    one: 'One of a kind', sold: 'Sold', reserved: 'Reserved', soldNote: 'Already in its new home', reservedNote: 'Join the waiting list',
    onRequest: 'Price on request', onRequestLc: 'price on request', price: 'Price', original: 'An original work by Kateryna Onokalo',
    oneLc: 'one of a kind', gallery: 'Gallery', toHall: 'Back to the hall', toGallery: 'Back to the gallery', other: 'Other works',
    btnSold: 'I want a similar one — Telegram', btnOrder: 'Order via Telegram', btnAsk: 'Ask via Telegram', open: 'Open in the gallery',
    note: 'Payment and delivery are arranged in Telegram — I reply myself. Shipping within Ukraine and worldwide.', commission: 'Commission a painting',
    nav: 'Breadcrumbs', switchLabel: 'UA', switchTitle: 'Українською',
    msgSold: (t, l) => `Hello! I love your painting “${t}” — I see it has been sold. Could you paint a similar one?\n${l}`,
    msgOrder: (t, s, p, l) => `Hello! I would like to order “${t}”${s ? ', ' + s : ''}, ${p}.\n${l}`,
    msgAsk: (t, l) => `Hello! Could you tell me more about “${t}”?\n${l}`,
    q: (t) => `“${t}”`, artform: 'Painting'
  }
};
const pageUrl = (id, lang) => `${site}${lang === 'en' ? 'en/' : ''}w/${id}.html`;
const loc = (it, f, lang) => String((lang === 'en' && it[f + '_en']) || it[f] || '').trim();
const sizeOf = (it, lang) => { const s = fmtSize(it.size); return lang === 'en' ? s.replace(/ см/g, ' cm') : s; };
const hallTitle = (g, lang) => (g.key ? (lang === 'en' && g.nameEn) || g.name : T[lang].other);

function page(it, v, group, more, moreTitle, lang = 'uk') {
  const L = T[lang];
  const up = lang === 'en' ? '../../' : '../';          // en/w/<id>.html sits one level deeper than w/<id>.html
  const home = lang === 'en' ? up + '?lang=en' : up;    // the gallery in the same language
  const relL = (src) => (/^https?:\/\//.test(src) ? src : up + src);
  const id = String(it.id);
  const title = loc(it, 'title', lang) || titleOf(it);
  const titleUa = titleOf(it);
  const size = sizeOf(it, lang);
  const tech = loc(it, 'tech', lang);
  const details = [tech, size, String(it.year || '').trim()].filter(Boolean).join(' · ');
  const text = loc(it, 'description', lang);
  const st = statusOf(it.id);
  const priced = it.price > 0;
  const price = st ? L[st] : priced ? money(it.price) : L.onRequest;
  const note = st === 'sold' ? L.soldNote : st === 'reserved' ? L.reservedNote : L.one;
  const self = pageUrl(id, lang);
  const d = dims(it.img);
  const kind = [tech ? tech.charAt(0).toLowerCase() + tech.slice(1) : L.painting, size].filter(Boolean).join(', ');
  const pageTitle = `${L.q(title)} — ${kind} | ${L.site}`;
  const summary = (details ? details + '. ' : '') + L.original + ', ' + L.oneLc + '.';
  const metaDesc = `${L.q(title)} — ${details ? details + '. ' : ''}${text ? text.replace(/\s+/g, ' ').slice(0, 110) + (text.length > 110 ? '…' : '') + ' ' : ''}${st ? price + '.' : priced ? L.price + ' ' + price + '.' : L.onRequest + '.'} ${L.original}.`;
  const msg = st === 'sold' ? L.msgSold(title, self) : priced && !st ? L.msgOrder(title, size, price, self) : L.msgAsk(title, self);
  const order = `https://t.me/${tg}?text=${encodeURIComponent(msg)}`;
  const hallName = hallTitle(group, lang);
  const artwork = {
    '@type': priced ? ['Product', 'VisualArtwork'] : 'VisualArtwork',
    '@id': self + '#artwork', name: title, url: self, image: [it.img, `${site}w/${id}.jpg`], inLanguage: L.htmlLang,
    description: text || summary, creator: { '@id': site + '#artist' }, artform: L.artform
  };
  if (tech) artwork.artMedium = tech;
  if (it.year) artwork.dateCreated = String(it.year);
  if (priced) {
    artwork.brand = { '@type': 'Brand', name: L.artist };
    artwork.offers = { '@type': 'Offer', price: String(it.price), priceCurrency: 'UAH', availability: 'https://schema.org/' + (st === 'sold' ? 'SoldOut' : st === 'reserved' ? 'Reserved' : 'InStock'), itemCondition: 'https://schema.org/NewCondition', url: self, seller: { '@id': site + '#artist' } };
  }
  const homeUrl = lang === 'en' ? site + '?lang=en' : site;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [artwork, { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: L.artist, item: homeUrl },
      { '@type': 'ListItem', position: 2, name: hallName, item: homeUrl + '#' + group.slug },
      { '@type': 'ListItem', position: 3, name: title, item: self }
    ] }]
  };
  const card = (w) => {
    const t = dims(w.img), wt = loc(w, 'title', lang) || titleOf(w), ws = statusOf(w.id);
    return `<a href="${esc(String(w.id))}.html"><span class="frame"><img src="${esc(relL(thumbOf(w.img)))}" alt="${esc(wt)}"${t ? ` width="${t.w}" height="${t.h}"` : ''} loading="lazy" decoding="async"></span><span class="t">${esc(wt)}</span><span class="p">${esc(ws ? L[ws] : w.price > 0 ? money(w.price) : L.onRequest)}</span></a>`;
  };
  const other = lang === 'en' ? `../../w/${esc(id)}.html` : `../en/w/${esc(id)}.html`;
  return `<!DOCTYPE html>
<html lang="${L.htmlLang}" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(metaDesc)}">
<meta name="robots" content="max-image-preview:large">
<meta name="theme-color" content="#0A1C3B">
<link rel="canonical" href="${esc(self)}">
<link rel="alternate" hreflang="uk" href="${esc(pageUrl(id, 'uk'))}">
<link rel="alternate" hreflang="en" href="${esc(pageUrl(id, 'en'))}">
<link rel="alternate" hreflang="x-default" href="${esc(pageUrl(id, 'uk'))}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${L.locale}">
<meta property="og:locale:alternate" content="${L.alt}">
<meta property="og:site_name" content="${esc(L.site)}">
<meta property="og:title" content="${esc(`${L.q(title)} — ${st ? price : priced ? price : L.onRequestLc}`)}">
<meta property="og:description" content="${esc(summary)}">
<meta property="og:url" content="${esc(self)}">
<meta property="og:image" content="${esc(`${site}w/${id}.jpg?v=${v}`)}">
<meta property="og:image:width" content="${W}">
<meta property="og:image:height" content="${H}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="${up}img/favicon.svg">
<link rel="apple-touch-icon" href="${up}img/favicon-180.png">
<link rel="preload" href="${esc(relL(it.img))}" as="image" fetchpriority="high">
<link rel="stylesheet" href="${up}fonts/fonts.css">
<script>try{if(localStorage.getItem('ko_theme')==='light')document.documentElement.setAttribute('data-theme','light')}catch(e){}</script>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>${CSS}</style>
</head>
<body>
<header class="top">
<a class="logo" href="${home}"><b>${lang === 'en' ? 'Onokalo' : 'Онокало'}</b><span>Kateryna · Fine Art</span></a>
<span class="tr"><a class="back" href="${home}#${esc(group.slug)}">⟵ ${esc(group.key ? L.toHall : L.toGallery)}</a><a class="lang" href="${other}" hreflang="${lang === 'en' ? 'uk' : 'en'}" lang="${lang === 'en' ? 'uk' : 'en'}" title="${L.switchTitle}">${L.switchLabel}</a></span>
</header>
<main class="work">
<figure class="art"><img src="${esc(relL(it.img))}" alt="${esc(`${title} — ${kind}, ${L.artist}`)}"${d ? ` width="${d.w}" height="${d.h}"` : ''} fetchpriority="high" decoding="async"></figure>
<div>
<nav class="crumbs" aria-label="${L.nav}"><a href="${home}">${L.gallery}</a> · <a href="${home}#${esc(group.slug)}">${esc(hallName)}</a></nav>
<h1>${esc(title)}</h1>
${lang === 'uk' && title !== loc(it, 'title', 'en') && loc(it, 'title', 'en') ? `<p class="en" lang="en">${esc(loc(it, 'title', 'en'))}</p>\n` : lang === 'en' && titleUa !== title ? `<p class="en" lang="uk">${esc(titleUa)}</p>\n` : ''}${details ? `<p class="meta">${esc(details)}</p>\n` : ''}${text ? `<p class="desc">${esc(text)}</p>\n` : ''}<div class="price"><b${st ? ` data-st="${st}"` : ''}>${esc(price)}</b><span>${esc(note)}</span></div>
<div class="actions"><a class="btn" href="${esc(order)}" target="_blank" rel="noopener">${st === 'sold' ? L.btnSold : priced && !st ? L.btnOrder : L.btnAsk}</a><a class="btn line" href="${home}#work-${esc(id)}">${L.open}</a></div>
<p class="note">${L.note}</p>
</div>
</main>
${more.length ? `<section class="more"><h2>${esc(moreTitle)}</h2><div class="grid">${more.map(card).join('')}</div></section>\n` : ''}<footer><span>© ${new Date().getFullYear()} Kateryna Onokalo</span><nav><a href="${home}">${L.gallery}</a><a href="https://t.me/${esc(tg)}" target="_blank" rel="noopener">Telegram</a><a href="${home}#order">${L.commission}</a></nav></footer>
</body>
</html>
`;
}

// Inside the page template (x-dc): no {{ }} in generated text.
const tpl = (s) => esc(String(s).replace(/[{}]/g, ''));
function catalog(groups) {
  const n = groups.reduce((s, g) => s + g.works.length, 0);
  return `<details class="dc-catalog"><summary><span data-en="All works">Усі роботи</span><span>${n}</span></summary>` +
    groups.map(g => `<p><b>${tpl(g.key ? g.name : OTHER)}</b> ` + g.works.map(w => `<a href="w/${tpl(String(w.id))}.html">${tpl(titleOf(w))}</a>`).join(', ') + '</p>').join('') +
    '</details>';
}

const inject = (html, name, content) => {
  const re = new RegExp('(<!-- ko:' + name + ' -->)[\\s\\S]*?(<!-- /ko:' + name + ' -->)');
  if (!re.test(html)) throw new Error('marker <!-- ko:' + name + ' --> not found in index.html');
  return html.replace(re, (m, a, b) => a + content + b);
};

// ---- run ----
const data = await loadData();
try { const s = data.settings.find((x) => x.key === 'status'); const m = JSON.parse((s && s.value) || '{}'); STATUS = m && typeof m === 'object' ? m : {}; } catch (e) { STATUS = {}; }
const byOrder = (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.id || a.name || '').localeCompare(String(b.id || b.name || ''));
const rows = data.items.filter(it => it && it.id && !it.hidden).sort(byOrder);
const halls = data.halls.slice().sort(byOrder);
const works = rows.filter(it => it.img && !NOT_PAINTINGS.includes(it.cat) && /^[A-Za-z0-9-]+$/.test(String(it.id)));
const groups = hallGroups(works, halls);
groups.forEach((g) => { const hr = halls.find((x) => (x.name || '') === g.key); g.nameEn = String((hr && hr.name_en) || '').trim(); });
const groupOf = new Map();
groups.forEach(g => g.works.forEach(w => groupOf.set(String(w.id), g)));

await fs.mkdir(OUT, { recursive: true });
await fs.mkdir(OUT_EN, { recursive: true });
let manifest = {};
try { manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8')); } catch (e) {}
const old = manifest.works || Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, typeof v === 'string' ? { v } : v]));
const next = {};
let rendered = 0, pages = 0, failed = 0;
for (const it of works) {
  const id = String(it.id);
  const v = hash(RENDER_VERSION + '|' + it.img);
  const jpg = path.join(OUT, id + '.jpg');
  const prev = old[id] || {};
  let have = prev.v === v;
  if (have) { try { await fs.access(jpg); } catch (e) { have = false; } }
  if (!have) {
    try { await render(it.img, jpg); rendered++; } catch (e) { console.warn('skip', id, e.message); failed++; if (old[id]) next[id] = Object.assign({ mod: today }, old[id]); continue; }
  }
  const g = groupOf.get(id);
  const same = g.works.filter(w => w !== it);
  const more = (same.length >= 2 ? same : same.concat(works.filter(w => w !== it && !same.includes(w)))).slice(0, 4);
  const moreTitle = same.length >= 2 ? `Ще із зали «${g.title}»` : 'Ще роботи';
  const moreTitleEn = same.length >= 2 ? `More from the hall “${(g.nameEn || g.title).replace(/^Зала\s+\S+\s*·\s*/, '')}”` : 'More works';
  const html = page(it, v, g, more, moreTitle, 'uk');
  const htmlEn = page(it, v, g, more, moreTitleEn, 'en');
  const h = hash(html), he = hash(htmlEn);
  next[id] = { v, h, mod: prev.h === h && prev.mod ? prev.mod : today, he, modEn: prev.he === he && prev.modEn ? prev.modEn : today };
  for (const [file, body] of [[path.join(OUT, id + '.html'), html], [path.join(OUT_EN, id + '.html'), htmlEn]]) {
    let cur = '';
    try { cur = await fs.readFile(file, 'utf8'); } catch (e) {}
    if (cur !== body) { await fs.writeFile(file, body); pages++; }
  }
}
// works that were hidden or deleted lose their pages
let removed = 0;
for (const f of await fs.readdir(OUT)) {
  const m = f.match(/^(.+)\.(html|jpg)$/);
  if (m && !next[m[1]]) { await fs.rm(path.join(OUT, f)); removed++; }
}
for (const f of await fs.readdir(OUT_EN)) {
  const m = f.match(/^(.+)\.html$/);
  if (m && !next[m[1]]) { await fs.rm(path.join(OUT_EN, f)); removed++; }
}

// index.html: snapshot (what the site's loadSupabase() would fetch) + the plain catalogue
const clean = (r) => { const o = Object.assign({}, r); delete o.created_at; delete o.updated_at; return o; };
const snapshot = {
  items: rows.map(clean),
  halls: halls.map(clean),
  settings: data.settings.map(s => ({ key: s.key, value: s.value || '' })).sort((a, b) => String(a.key).localeCompare(String(b.key)))
};
let html = inject(index, 'snapshot', `<script type="application/json" id="ko-snapshot">${JSON.stringify(snapshot).replace(/</g, '\\u003c')}</script>`);
html = inject(html, 'catalog', catalog(groups));
const homeChanged = html !== index;
if (homeChanged) await fs.writeFile(path.join(ROOT, 'index.html'), html);
const home = homeChanged || !manifest.home ? today : manifest.home;

// Static info pages next to index.html (no lastmod: a checkout's file times would change it on every run).
const STATIC_PAGES = ['delivery.html', 'privacy.html', 'en/delivery.html', 'en/privacy.html'];
const staticPages = [];
for (const f of STATIC_PAGES) { try { await fs.access(path.join(ROOT, f)); staticPages.push(f); } catch (e) {} }

const alt = (uk, en) => `<xhtml:link rel="alternate" hreflang="uk" href="${esc(uk)}"/><xhtml:link rel="alternate" hreflang="en" href="${esc(en)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${esc(uk)}"/>`;
const img = (it) => (/^https?:\/\//.test(it.img) ? `<image:image><image:loc>${esc(it.img)}</image:loc></image:image>` : '');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Written by .github/scripts/work-previews.mjs: the site (UA + ?lang=en), its info pages and every work page in both languages. Submit in Google Search Console. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url><loc>${esc(site)}</loc><lastmod>${home}</lastmod>${alt(site, site + '?lang=en')}</url>
  <url><loc>${esc(site + '?lang=en')}</loc><lastmod>${home}</lastmod>${alt(site, site + '?lang=en')}</url>
${staticPages.map(f => `  <url><loc>${esc(site + f)}</loc></url>\n`).join('')}${works.filter(it => next[String(it.id)]).map(it => {
  const id = String(it.id), n = next[id], a = alt(pageUrl(id, 'uk'), pageUrl(id, 'en'));
  return `  <url><loc>${esc(pageUrl(id, 'uk'))}</loc><lastmod>${n.mod}</lastmod>${a}${img(it)}</url>\n  <url><loc>${esc(pageUrl(id, 'en'))}</loc><lastmod>${n.modEn || n.mod}</lastmod>${a}${img(it)}</url>`;
}).join('\n')}
</urlset>
`;
let curMap = '';
try { curMap = await fs.readFile(path.join(ROOT, 'sitemap.xml'), 'utf8'); } catch (e) {}
if (curMap !== sitemap) await fs.writeFile(path.join(ROOT, 'sitemap.xml'), sitemap);

await fs.writeFile(MANIFEST, JSON.stringify({ home, works: next }, null, 1) + '\n');
console.log(`works: ${works.length}, images rendered: ${rendered}, pages written: ${pages}, files removed: ${removed}, failed: ${failed}, index.html ${homeChanged ? 'updated' : 'unchanged'}, sitemap ${curMap !== sitemap ? 'updated' : 'unchanged'}`);
if (failed && failed === works.length) process.exit(1);
