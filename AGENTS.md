# AGENTS.md — Kate Onokalo website

Portfolio + online-shop website for Ukrainian artist **Kateryna Onokalo** (abstract painting, oil & acrylic).
Content is managed by the artist herself through a Supabase-backed admin panel — no code edits needed for content.

## Stack / architecture

- **Static site** built on a custom **"DC" framework**:
  - `support.js` — generated runtime (bundled from `dc-runtime`). **DO NOT EDIT.** It provides `DCLogic`, React, and template tags.
  - `index.html` — single page. Component is an inline `<script type="text/x-dc" data-dc-script>` with `class Component extends DCLogic` + `renderVals()` returning `{{ binding }}` values.
  - Templates: `<x-dc>`, `<helmet>` (hoisted into `<head>`: fonts, title, meta, favicon), `<sc-if value="{{ x }}">`, `<sc-for list="{{ arr }}" as="it">`, `style-hover` attribute.
- **Supabase** (Postgres + Storage + Auth), config in `supabase-config.js` (`window.SUPABASE_CONFIG = { url, anonKey }`). anonKey is **public by design** — never put secrets there.
- **Hosting:** GitHub Pages — repo `antony-the-dev/kate_onokalo`, branch `main`, custom domain **`kateonokalo.com`** (since 2026-10-04; `CNAME` file in the repo root; DNS at Cloudflare: `CNAME @`/`www` → `antony-the-dev.github.io`, **DNS only**, GitHub issues the certificate; the old `antony-the-dev.github.io/kate_onokalo/` URL redirects; HTTPS enforced, Let's Encrypt cert auto-renewed — on 2026-10-04 it was only issued after removing and re-adding the custom domain). Keep every path **relative** (no leading `/`) anyway — local previews and the old URL rely on it. Deploy = `git push`. (netlify.toml was removed.)

## Key files

| File | Purpose |
|---|---|
| `index.html` | Public site: hero, halls (overview cards ↔ single-hall view), postcards, boxes, completed projects, about, interior, order, collab, contact, cart, work modal, project lightbox. Reads Supabase via REST. |
| `admin.html` | Admin panel (standalone, plain JS): login, tabs (Картини / Листівки і закладинки / Брендована продукція (`boxes`) / Реалізовані проєкти / Майстер-класи / Зали / Сторінка / Налаштування), CRUD, section («Розділ») select to move items between categories, photo pipeline (see below), order/hide/delete, settings (projects & workshops intro, Etsy URL), one-off legacy photo re-compression. Photo-only tabs (`PHOTO_ONLY`: projects, workshops) add several photos at once (`addPhotos`). |
| `supabase-config.js` | Supabase url + anonKey. |
| `w/` | **Generated** work pages: `w/<id>.html` (a real, indexable page per visible painting) + 1200×630 `w/<id>.jpg` (link-preview image) + `previews.json` manifest (`{home, works: {id: {v: image hash, h: page hash, mod: lastmod}}}`). Never edit by hand. |
| `.github/workflows/work-previews.yml`, `.github/scripts/work-previews.mjs` | Every 30 min / on dispatch / on push of `index.html`: builds `w/` (sharp), rewrites the marked regions of `index.html` (`<!-- ko:snapshot -->`, `<!-- ko:catalog -->`) and `sitemap.xml`; commits to `main` as github-actions[bot] only when something changed. |
| `404.html` | GitHub Pages 404: `w/<id>(.html)` without a built page → `../#work-<id>`; else "not found" + home link (JS-computed base). |
| `support.js` | DC runtime (generated — don't edit). |
| `img/` | WebP assets, favicons, `og-1200.jpg` (link-preview image). |
| `fonts/` | Self-hosted Cormorant Garamond + Commissioner (variable woff2, Cyrillic/Latin/Latin-ext only) + `fonts.css` + OFL licences. No Google Fonts requests. `index.html` preloads the two Cyrillic files; `admin.html` links `fonts.css` too. |
| `vendor/` | Self-hosted JS: React 18.3.1 UMD (`react`, `react-dom` — byte-identical to support.js's SRI hashes; loaded in `<head>` before `support.js`, which then skips its unpkg download because `window.React`/`ReactDOM` exist) and `@supabase/supabase-js` UMD (`supabase.js`, `window.supabase`; realtime on the site, whole admin) + MIT licences. The site makes no requests to public CDNs (only Supabase itself). Regenerate/upgrade: `node .github/scripts/fetch-vendor.mjs [supabase-js version]` (checks the React hashes against support.js). |
| `sitemap.xml`, `robots.txt` | Sitemap — **generated** by the bot: the site + every work page with its image and lastmod (submit in Search Console). robots.txt only matters once there is a custom domain. |
| `ДОКУМЕНТАЦІЯ.md`, `ІНСТРУКЦІЯ-ДЛЯ-КАТЕРИНИ.md` | Handover docs (UA). |
| `ПЛАН.md` | Status as of 2026-10-04 + rules for the next agent + prioritised SEO plan + open questions for Kateryna (UA). Read it first when picking the project up. |

## Supabase data model

Table **`items`** (id uuid PK; app generates UUIDs via `crypto.randomUUID()`):
`cat` (paintings|postcards|boxes|projects|workshops — `boxes` is shown as «Брендована продукція»; any other value is treated as a painting by the site and the preview generator), `title`, `title_en`, `price` (int, UAH), `size`, `size_en`, `tech`, `tech_en`, `hall`, `hall_en`, `description`, `description_en`, `year`, `img` (storage publicUrl), `sort_order`, `hidden`, `created_at`.

Table **`halls`**: `num` (label like "I"), `name` (UA, grouping key — items reference it by this string; admin cascades renames into `items.hall`/`hall_en`), `name_en`, `note`, `note_en`, `sort_order`.

Table **`settings`** (`key` text PK, `value` text): `projects_intro`, `projects_intro_en`, `workshops_intro`, `workshops_intro_en`, `etsy_url`, `boxes_on` ('1' = show «Брендована продукція»), page photos `about_img1|2`, `interior_img1|2` (storage URLs under `page/`, fallback to `img/…`), and `texts` — JSON `{"<key>": {ua, en}}` edited in admin «Сторінка»; `applyLang()` applies it to every `[data-en]` element. Key = `textKey()` (same rule in index.html and admin.html): `data-key` if set, else `"menu:" + text` inside `.dc-nav`/`.dc-mmenu`, else the original UA `textContent` — so changing a text in `index.html` orphans its edit, and a menu item never shares a key with a section title. The about eyebrow has `data-key="about:Про мене"` because Kateryna once saved a whole paragraph under «Про мене» (it hit the menu too); the admin now groups texts by place with role labels, asks before saving a much longer text into a short label/menu item, and prunes edits of texts no longer on the page on every save. The admin reads the text list from the live `index.html`. Created by the SQL in `ДОКУМЕНТАЦІЯ.md` §8; the site works without it (defaults, Etsy hidden).

`projects` and `workshops` items are photo-only (title/price unused on the site).

Storage bucket **`items`** (public). Uploads are named `<itemId>/<base36 stamp>-<w>x<h>-full.<webp|jpg>` plus a sibling `-thumb` (800px). A new name per upload (no overwrite/caching issues), uploaded via signed upload URL with `Cache-Control: max-age=31536000`; the old files are removed afterwards. The site derives the thumb URL and the image dimensions (for `width`/`height`) from the name. Legacy `<itemId>/full.webp` PNGs were re-compressed on 2026-09-28; the Налаштування card only appears if a non-optimized image exists. Uploads are a raw PUT to the signed upload URL with `Cache-Control: max-age=31536000` (verified: GET returns `public, max-age=31536000`; note Supabase answers HEAD with `no-cache` regardless, so check caching with GET). Deleting files needs storage RLS select+delete policies for `authenticated` (SQL №3 in `ДОКУМЕНТАЦІЯ.md`) — without them `remove()` silently deletes nothing. `admin.html?tools` shows an orphan-file cleanup. Safari can't encode WebP in `canvas.toBlob` → admin falls back to JPEG.

**RLS:** read public (`using (true)`), write only `to authenticated`.

## Data flow in `index.html`

- `loadSupabase()` (called in `componentDidMount`): plain `fetch` to PostgREST (`items`, `halls`, `settings`, anon key in `apikey` header); `applyRows()` → `setState({ paints, postcards, boxes, projects })`. `state.dataMode`: `loading` → `live`, or `error` (honest message, no fake works), or `demo` when Supabase isn't configured (only then the hardcoded `works`/`goods` show). Halls/settings errors are non-fatal. Supabase JS SDK is loaded ~3 s later only for the realtime `postgres_changes` channel; also reloads on `visibilitychange`.
- `hallGroups()` groups visible paintings into halls: `halls.sort_order` first, then halls only referenced by items (legacy `HALLS` map for texts), then no-hall works as «Інші роботи». Empty halls are dropped. Each gets a transliterated slug `hall-…`.
- Hall labels: `hallGroups()` normalises `halls.num` for display — Kateryna types «|», «||», «|||», shown as Roman I, II, III; an empty label falls back to the hall's position (I, II, …); «Інші роботи» has none. Used by the hall cards, the open hall's eyebrow and the «Зали ▾» dropdown.
- Hall cards (overview) must read as a set of works, not a single painting (owner feedback: visitors clicked a "painting" and fell into a hall): caption row above the image «Зала I · 8 картин» (`.dc-hallcap`; counts use `L.paintings`), the next two works of the hall stacked behind the cover like a deck (`.dc-stack[data-n]` + `.dc-back[data-i]`: same axis as the cover, further ones up-right and dimmer; the deck spreads on hover), «Відкрити залу ⟶» below, `aria-label` «Зала I · Назва, 8 картин». The section intro says the paintings hang in themed halls.
- Section layouts (finalised 2026-09-30 after "a designer never touched this" feedback): «Реалізовані проєкти» header is `.dc-projhead` (title + «Сподобалась якась робота?» note + «Замовити повтор» on the left; on the right `projText()` lays out Kateryna's intro: a first paragraph that only repeats the section title is dropped, the first paragraph → serif `.dc-lead`, the rest → `.dc-cols` (CSS columns), a short last paragraph (≤160 chars, ≥3 paragraphs) → `.dc-coda` closing line). `#order`: text + steps 01–03 on the left, the form in `.dc-ordercard` on the right. `#collab`: title left / text right header, the three offers across the width (`.dc-offers`/`.dc-offer`, each marked with a palette `.dc-dab` in terracotta / gold / blue). Side texts next to section titles use `.dc-aside` (15px, weight 350, `--ink3`) — the old 14px/300/`--ink5` was hard to read on the textured navy.
- Hall navigation is hash-based: `#halls` = overview cards, `#hall-<slug>` = single hall (`state.hall`), handled in the root click handler + `popstate`. Header «Зали ▾» dropdown (CSS hover/focus-within) and mobile menu list the halls. The logo / «Вгору» (`#top`) = home: scroll to y=0 (the collab ribbon included — `-84` used to leave it half under the header), halls back to the overview, hash cleared.
- Image frames (`.dc-frame`): fixed 4:5 box, image `max-width/max-height: 100%`, bottom-aligned — never cropped or stretched (Kateryna's complaint about the old wall/catalog).
- `loc(it, lang)` — UA/EN with EN fallback to UA.
- Cart SKUs: `w<id>` painting, `p<id>` postcard, `b<id>` box; persisted in `localStorage.ko_cart`; hidden/deleted/price-0 items drop out of the cart. Price 0 → «Ціна за запитом» + «Запитати» (Telegram) instead of «В кошик». Checkout/ask/order → `t.me/@kate_art_tort?text=<encoded>` (never clipboard).
- Body scroll is locked in `componentDidUpdate` whenever the menu, cart, work modal or project lightbox is open.
- Touch gestures on overlays (`sheetRef`, native non-passive listeners; `data-sheet` = `work` | `proj` | `cart`): modal/lightbox — sideways flick = prev/next, pull down while scrolled to the top = iPhone-Photos-style drag (content follows the finger and shrinks, backdrop fades, blur off during the drag) → closes past ~20% of the height or on a flick, else springs back; cart drawer — the same pulled to the right. Two fingers / zoomed page = no gesture (pinch-zoom on a painting stays). Form fields are 16px (iOS zooms into smaller ones); small header/cart buttons get an invisible ~44px touch area (`.dc-hit::after`).
- Phones (≤640px): the work card's price + one button (`.dc-buy`: «В кошик», or «Запитати» for price 0; `.dc-sm`/`.dc-lg` short/long labels) is a bar pinned to the bottom of the card (sticky, `bottom` = minus the card's padding — sticky is inset by the scroller's padding); for buyable items «Запитати в Telegram» sits in the flow under it (`.dc-ask-m`). «Реалізовані проєкти»: the lead + «Читати далі» (`state.projMore`, `.x[data-open]`), the first 6 photos + «Показати всі фото · N» (`state.projAll`, `.dc-proj[data-all]`) — the section was ~3200px. Cart: «Немає Telegram? Надіслати замовлення поштою» (mailto with the order text).
- The work modal also opens postcards and branded goods (cards in `#paper`/`#boxes` carry `data-art="p:<id>"` / `"b:<id>"`; `kindOf()`, `find()`, `step()` understand the prefix): section name as the eyebrow, «В наявності» instead of «Єдиний екземпляр», prev/next within the section, cart SKU `p<id>`/`b<id>`, no «Поділитися» and no URL hash (there are no pages for goods).
- Overlays have one history step each (`ovState()` → `history.state` `{ko: work|lb|cart|menu}`, synced in `componentDidUpdate`): opening pushes, stepping between works or card → cart replaces, closing from the page (✕/backdrop/Esc/swipe) does `history.back()` (`_popSkip`), the system Back / iOS edge swipe closes it (`onPop`, page and scroll untouched), Forward reopens it. A painting's step carries `#work-<id>`. Links clicked while the phone menu is open replace its step (`navTo`). Deep links (`openWorkHash`): the entry becomes `#hall-<slug>` (scrolled to the halls), the card is pushed on top — Back closes it instead of leaving the site. Overlays are `role=dialog aria-modal`, take focus (their ✕), give it back on close, Tab is trapped (`trapTab`). «Поділитися» uses `navigator.share` or copies the link.
- Work links (`workLink(id)`) point to the work page `w/<id>.html`: a standalone, indexable product page in the site's style (photo, crumbs «Галерея · Зала», title + EN title, technique · size · year, description, price / «Ціна за запитом», «Замовити/Запитати в Telegram» with the page link, «Відкрити в галереї» → `../#work-<id>`, «Ще із зали…» up to 4 works, footer), `canonical` = itself, `max-image-preview:large`, JSON-LD `Product`+`VisualArtwork` with `Offer` (UAH, InStock; price 0 → `VisualArtwork` only, no offer) + `BreadcrumbList`, Open Graph with the cream-wall JPEG for link previews, local fonts, `ko_theme` dark mode. No redirect any more (it used to JS-redirect with noindex). Used by «Поділитися» and appended to «Запитати» Telegram messages for paintings; on localhost/file `workLink` falls back to `#work-<id>`. The generator reads the site URL from `index.html`'s `og:url` and the Telegram handle from its JSON-LD; paintings = `cat` not postcards/boxes/projects/workshops, not hidden, with `img`; hall grouping and slugs mirror the site's `hallGroups()`/`translit()` (breadcrumbs open the right hall); re-renders a JPEG only when `img` (or `RENDER_VERSION`) changes; removes pages of hidden/deleted works. Supabase Edge Functions can't serve HTML on the default domain (rewritten to text/plain) — that's why this is static.
- Catalogue in the HTML: the bot writes `<script type="application/json" id="ko-snapshot">` (visible items without `created_at`, halls, settings — sorted, no timestamp, so it only changes when data does) between `<!-- ko:snapshot -->` markers in `<head>`, and «Усі роботи» (`<details class="dc-catalog">`, every work linked to its page, grouped by hall) between `<!-- ko:catalog -->` markers inside the `#contact` template — plain HTML, so readable without JS. `loadSupabase()` applies the snapshot first (halls appear at once, deep links open, and it stays if Supabase is down), then the live fetch replaces it. Keep both marker pairs when editing `index.html`; the bot commits `index.html` — pull before editing. Local test in a copy of the repo (it rewrites `index.html`/`sitemap.xml`/`w/` in place): `PREVIEW_ITEMS=data.json node .github/scripts/work-previews.mjs` (`{items, halls, settings}` or an items array; needs `npm i --no-save sharp@0.33.5`).
- «Майстер-класи» (`#workshops`, after `#order`, navy like `#about`): always shown — intro (`workshops_intro[_en]` or default), «Замовити майстер-клас» → Telegram template (Де / Коли / Скільки учасників), and a swipeable photo strip (`.dc-strip`, photos at their own ratio, ⟵ ⟶ buttons on hover devices; no `.dc-reveal` inside — the strip is a scroll container). Photos open in the shared lightbox: `state.projIdx` + `state.lbKind` ('projects' | 'workshops'), `lbList()`.
- «Живі зали»: palettes are computed client-side (`extractPalette`: 40×40 samples of up to 6 thumbs → median cut → weight = area × chroma, colours near the cream wall/near-black down-weighted → ≤4 distinct colours). Cover-only palette first (idle, 1.2 s after load), full one when a hall is open; cached in `localStorage.ko_pal` (key = hash of thumb URLs, ≤60 entries). Images are loaded with `crossOrigin` and, if the cached copy taints the canvas, once more with `?pal`. Used for: `#halls` wall tint (`--hc1..3` inline → `#halls::before` radial gradients, registered with `@property` so they transition) and `.dc-dab` palette dabs (hall header + cards). The full-screen paint pour on entering a hall was removed on 2026-09-29 at the owner's request (too flashy); it is in git history (commit 36aeb9f, `pour()`).
- «Приміряти на стіні» (room view + `wall.js` canvas detection + admin hints) was removed on 2026-09-29 — small 15×15 works looked poor at true scale. The code is in git history (last present in 960f8c5) if it comes back, e.g. only for works ≥ 40 cm.
- Hero «жива вода» (`initLivePaint`, WebGL1): a GPU wave simulation — 256×N height field in two float render targets (half float first, then float; `OES_texture_*_linear` if present, else manual bilinear), ping-pong passes: drop (bump), wave-equation step (~120 steps/s whatever the frame rate; clamped edges reflect), show (painting refracted by the surface normal with a slight RGB split, shading + specular from a top-left "window" light, tiny noise drift). Drops: click big; on touch only a tap (<0.5 s, <3% movement) drops — a finger that starts a scroll on the painting doesn't splash; mouse/finger drag leaves a wake; idle auto drop every 3.5–6.5 s. While the page scrolls (scroll event <0.25 s ago, no recent touch) the sim pauses so the frame budget goes to the scroll. ~30 fps idle, full rate for 2 s after input; runs only while on screen and tab visible; canvas sized from layout (`offsetWidth`, not the receding transform). No effect for reduced motion / no WebGL / no float render target (the `<img>` stays); hidden on context loss. `st.raf` stays set while a frame runs so drops added inside a frame can't start a second loop.
- Modal/lightbox images sit in a fixed-ratio box (`.dc-fit`/`.dc-lbfit`, `--r` from the file-name dimensions) with the cached thumb underneath — no layout jump while the full image loads.
- Modal image sheen/tilt (`.dc-sheen`, mouse only) and scroll reveal (`.dc-reveal`, CSS `animation-timeline: view()` — progressive, no JS).
- Scroll effects are CSS scroll-driven animations (`@supports (animation-timeline: scroll())`, reduced-motion off): hero recedes over the first 1.25 viewports on desktop (`scroll(root)`, `animation-range: 0px 125vh`; sinks + shrinks to .8 + fades; phones: no hero effect — Kateryna/Anton found the painting vanished too fast on a quick scroll), other `[data-recede]` sections (desktop >900px) scale to .95 toward their bottom edge and fade to .7 over `view()` `exit 0%–85%`, `.dc-frame` depth in halls/paper/boxes (±10px × `--dk` by the card's nth-child, `view()` cover), window-light drift and the brush stroke (`scroll(root)`). Only transform/opacity (plus the tiny SVG dash) — the old per-frame border-radius was dropped because it repainted whole sections. Browsers without `animation-timeline` (Firefox) get `initScrollFx()`: one rAF handler that reads all positions first from layout offsets (`docTop()`), then writes. `scrollToId()` also uses `docTop()` (a scaled section's rect is shifted). Never put `position: fixed` elements inside a receding section (transform breaks fixed).
- Ambient layers (`initAmbient()`): paper grain (random 140px tile → `--grain`) and window light (2×2 skewed panes cut out of a faint shade on a canvas → `--light`, tint by the visitor's hour; hidden in dark theme). Both are `position: fixed; z-index: -1` inside `.dc-root` (which therefore has no background — `body` carries `--bg`), so they only show on the cream "wall": paintings, photos and coloured blocks keep their true colours.
- Section titles (`section h2`, class `dc-h` added by `observeHeads()`, also for titles mounted later) blur into focus tied to the scroll: `view()` `entry 0%–100%`, so a title is sharp once fully on screen — before the body text under it scrolls in. (It used to be a 0.9 s transition fired by IntersectionObserver; on a fast scroll the text was readable while the title was still blurred.) Without scroll timelines: IO with `rootMargin 15%` below the viewport + a .45 s transition (`on`, forced on `beforeprint`). Print CSS resets `.dc-h`/`.dc-reveal`.

## Contacts / config

- Telegram (orders): `@kate_art_tort`
- Instagram: `katetortart` (https://www.instagram.com/katetortart)
- Email: `katetortart@gmail.com`
- Admin login: `katetortart@gmail.com` + password set in Supabase (password stored only in Notion/handover, not in repo).
- Admin URL: `https://kateonokalo.com/admin.html`

## Design tokens

- Cream `#E9E4DC` (bg), deep navy **`#0A1C3B`** (dark sections/buttons — was `#111C2E`), terracotta `#B4501C`, gold `#C7A17A`, muted `#857F74`.
- Fonts: Cormorant Garamond (display) + Commissioner (body), self-hosted in `fonts/` (see Key files).

## Gotchas / conventions

- **Don't edit `support.js`.** All site logic lives in the inline `<script type="text/x-dc">` inside `index.html`.
- After editing `index.html`, validate the inline script: extract it and run `node --check` (see below).
- Keep HTML balanced for `sc-if`/`sc-for`/`style`/`helmet` (past edits have broken `</style>` accidentally).
- **No absolute paths** (GitHub Pages subpath). Always relative: `img/...`, `./support.js`. (Exception: `404.html`, served at any depth — its home link is computed in JS; `w/*.html` use `../`.)
- The Work previews bot pushes to `main` — `git pull` before pushing.
- The Work previews **schedule runs as the user who last changed the cron line**. A cron edit committed as "Claude <noreply@anthropic.com>" (a cloud session's git identity) silently stopped the schedule for hours — edit `work-previews.yml`'s cron only from the owner's account (GitHub web UI / API, or a local commit as antony-the-dev).
- python SSL cert fails on this Mac (`CERTIFICATE_VERIFY_FAILED`) — use **node fetch** or `curl` for API calls.
- `image-slot.js` was removed; no longer used. The horizontal «Стіна» (wall) carousel was removed too (replaced by halls).
- The root wrapper uses `.dc-root { overflow-x: clip }` — `overflow-x: hidden` there breaks the sticky header.
- **Dark theme is the default** (owner's request, 2026-09-30): `<html data-theme="dark">` + `theme-color #0A1C3B` are static in `index.html` (so it holds without JS), and the head script / `componentDidMount` switch to light only when `localStorage.ko_theme === 'light'` (the ☀/☾ toggle stores the choice). Work pages (`w/*.html`, via the generator) and `404.html` follow the same rule.
- Overlays (`.dc-modal`) re-declare the light-text palette for dark theme via CSS variables; don't reintroduce `#artModal` attribute selectors.
- SEO in the static `<head>`: `canonical`, hero-image preload (`fetchpriority="high"`), JSON-LD `WebSite` + `Person` (address Ніжин, sameAs Instagram/Telegram/Etsy — the Etsy URL is hardcoded there, keep it in sync with settings `etsy_url`). All of these, plus `sitemap.xml`/`robots.txt`, carry the absolute GitHub Pages URL — update them together with `og:url` on a domain change.
- Title/description/OG tags live in the static `<head>` (crawlers don't run JS, `<helmet>` is runtime-only); `og:url`/`og:image` are absolute GitHub Pages URLs — update them if a custom domain is added. `<head>` also preconnects to the Supabase host.
- Menu order is Kateryna's (2026-09-30): Про мене · Зали · На замовлення · Магазин · Майстер-класи · Реалізовані · Контакти — on desktop and in the phone menu; it intentionally differs from the order of the sections on the page.
- Nav switches to the burger at ≤1270px (7 items incl. «Магазин»: a ▾ dropdown = Листівки і закладинки + Брендована продукція only when both have items, else a plain link to the one section (`shopMulti`/`shopSingle`); 8 flat items didn't fit even at 1440). The phone menu stays a flat list; its postcards item has the same original text as the dropdown's («Листівки і закладинки») so Kateryna's «Сторінка» edit (now «Листівки та постери») applies to both.
- «Брендована продукція» is off unless `settings.boxes_on === '1'` (`boxesOn()`; `boxes()` returns [] otherwise → section, menu items and `b<id>` cart lines disappear, items stay in the DB). Kateryna hid it on 2026-10-04 (merch not ready); the admin's «Брендована продукція» tab has a «Показати на сайті» / «Приховати розділ» button.
- `.gitignore`: `.DS_Store`, `uploads/`, `.image-slots.state.json`, `node_modules/`. `uploads/` was untracked.
- Supabase anonKey is public — committing `supabase-config.js` is fine. Never commit admin password.

## Checks

```bash
# Extract + syntax-check the inline DC script:
python3 - <<'EOF'
import re
h = open('index.html').read()
m = re.search(r'<script type="text/x-dc"[^>]*>(.*?)</script>', h, re.S)
open('/tmp/dc.js','w').write(m.group(1))
EOF
node --check /tmp/dc.js

# Admin script:
python3 - <<'EOF'
import re
a = open('admin.html').read()
m = re.search(r'<script>(.*?)</script>', a, re.S)
open('/tmp/adm.js','w').write(m.group(1))
EOF
node --check /tmp/adm.js

# Local preview (.claude/launch.json uses port 8123):
python3 -m http.server 8123
```