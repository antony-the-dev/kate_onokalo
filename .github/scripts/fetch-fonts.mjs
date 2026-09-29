// Re-downloads the self-hosted fonts into fonts/ from Google Fonts: Cormorant Garamond (normal + italic) and
// Commissioner, variable woff2, only the Cyrillic / Latin / Latin Extended subsets (₴ is in Latin Extended).
// Run from the repo root:  node .github/scripts/fetch-fonts.mjs
import fs from 'node:fs/promises';

const CSS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Commissioner:wght@200;300;400;500&display=swap';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'; // woff2 + unicode-range
const SUBSETS = new Set(['cyrillic', 'latin', 'latin-ext']);

const css = await (await fetch(CSS, { headers: { 'User-Agent': UA } })).text();
const faces = {};
for (const m of css.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face \{([^}]*)\}/g)) {
  if (!SUBSETS.has(m[1])) continue;
  const b = m[2];
  const fam = b.match(/font-family: '([^']+)'/)[1], style = b.match(/font-style: (\w+)/)[1];
  const slug = (fam === 'Commissioner' ? 'commissioner' : 'cormorant') + (style === 'italic' ? '-italic' : '') + '-' + m[1];
  faces[slug] = {
    fam, style,
    url: b.match(/url\(([^)]+)\)/)[1],
    range: b.match(/unicode-range: ([^;]+);/)[1],
    weight: fam === 'Commissioner' ? '200 500' : style === 'italic' ? '300 400' : '300 500'
  };
}
await fs.mkdir('fonts', { recursive: true });
let out = '/* Self-hosted Google Fonts (SIL Open Font License 1.1 — see OFL-*.txt). Variable fonts: one file per script covers all weights.\n   Only Cyrillic, Latin and Latin Extended (₴ lives there) — the site needs nothing else. Regenerate: node .github/scripts/fetch-fonts.mjs */\n';
for (const [slug, f] of Object.entries(faces)) {
  const r = await fetch(f.url);
  if (!r.ok) throw new Error(f.url + ': HTTP ' + r.status);
  await fs.writeFile(`fonts/${slug}.woff2`, Buffer.from(await r.arrayBuffer()));
  out += `@font-face { font-family: '${f.fam}'; font-style: ${f.style}; font-weight: ${f.weight}; font-display: swap; src: url(${slug}.woff2) format('woff2'); unicode-range: ${f.range}; }\n`;
}
await fs.writeFile('fonts/fonts.css', out);
console.log(Object.keys(faces).length + ' font files written to fonts/');
