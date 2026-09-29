# AGENTS.md — Kate Onokalo website

Portfolio + online-shop website for Ukrainian artist **Kateryna Onokalo** (abstract painting, oil & acrylic).
Content is managed by the artist herself through a Supabase-backed admin panel — no code edits needed for content.

## Stack / architecture

- **Static site** built on a custom **"DC" framework**:
  - `support.js` — generated runtime (bundled from `dc-runtime`). **DO NOT EDIT.** It provides `DCLogic`, React, and template tags.
  - `index.html` — single page. Component is an inline `<script type="text/x-dc" data-dc-script>` with `class Component extends DCLogic` + `renderVals()` returning `{{ binding }}` values.
  - Templates: `<x-dc>`, `<helmet>` (hoisted into `<head>`: fonts, title, meta, favicon), `<sc-if value="{{ x }}">`, `<sc-for list="{{ arr }}" as="it">`, `style-hover` attribute.
- **Supabase** (Postgres + Storage + Auth), config in `supabase-config.js` (`window.SUPABASE_CONFIG = { url, anonKey }`). anonKey is **public by design** — never put secrets there.
- **Hosting:** GitHub Pages — repo `antony-the-dev/kate_onokalo`, branch `main`, site at `/kate_onokalo/` **subpath** → keep every path **relative** (no leading `/`). Deploy = `git push`. (netlify.toml was removed.)

## Key files

| File | Purpose |
|---|---|
| `index.html` | Public site: hero, halls (overview cards ↔ single-hall view), postcards, boxes, completed projects, about, interior, order, collab, contact, cart, work modal, project lightbox. Reads Supabase via REST. |
| `admin.html` | Admin panel (standalone, plain JS): login, tabs (Картини / Листівки і закладинки / Брендована продукція (`boxes`) / Реалізовані проєкти / Майстер-класи / Зали / Сторінка / Налаштування), CRUD, section («Розділ») select to move items between categories, photo pipeline (see below), order/hide/delete, settings (projects & workshops intro, Etsy URL), one-off legacy photo re-compression. Photo-only tabs (`PHOTO_ONLY`: projects, workshops) add several photos at once (`addPhotos`). |
| `supabase-config.js` | Supabase url + anonKey. |
| `w/` | **Generated** link-preview pages (`w/<id>.html` + 1200×630 `w/<id>.jpg` + `previews.json` manifest). Never edit by hand. |
| `.github/workflows/work-previews.yml`, `.github/scripts/work-previews.mjs` | Builds `w/` (sharp) every 30 min / on dispatch / on push of `index.html`, commits to `main` as github-actions[bot] only when something changed. |
| `404.html` | GitHub Pages 404: `w/<id>(.html)` without a built page → `../#work-<id>`; else "not found" + home link (JS-computed base). |
| `support.js` | DC runtime (generated — don't edit). |
| `img/` | WebP assets, favicons, `og-1200.jpg` (link-preview image). |
| `ДОКУМЕНТАЦІЯ.md`, `ІНСТРУКЦІЯ-ДЛЯ-КАТЕРИНИ.md` | Handover docs (UA). |

## Supabase data model

Table **`items`** (id uuid PK; app generates UUIDs via `crypto.randomUUID()`):
`cat` (paintings|postcards|boxes|projects|workshops — `boxes` is shown as «Брендована продукція»; any other value is treated as a painting by the site and the preview generator), `title`, `title_en`, `price` (int, UAH), `size`, `size_en`, `tech`, `tech_en`, `hall`, `hall_en`, `description`, `description_en`, `year`, `img` (storage publicUrl), `sort_order`, `hidden`, `created_at`.

Table **`halls`**: `num` (label like "I"), `name` (UA, grouping key — items reference it by this string; admin cascades renames into `items.hall`/`hall_en`), `name_en`, `note`, `note_en`, `sort_order`.

Table **`settings`** (`key` text PK, `value` text): `projects_intro`, `projects_intro_en`, `workshops_intro`, `workshops_intro_en`, `etsy_url`, page photos `about_img1|2`, `interior_img1|2` (storage URLs under `page/`, fallback to `img/…`), and `texts` — JSON `{"<key>": {ua, en}}` edited in admin «Сторінка»; `applyLang()` applies it to every `[data-en]` element. Key = `textKey()` (same rule in index.html and admin.html): `data-key` if set, else `"menu:" + text` inside `.dc-nav`/`.dc-mmenu`, else the original UA `textContent` — so changing a text in `index.html` orphans its edit, and a menu item never shares a key with a section title. The about eyebrow has `data-key="about:Про мене"` because Kateryna once saved a whole paragraph under «Про мене» (it hit the menu too); the admin now groups texts by place with role labels, asks before saving a much longer text into a short label/menu item, and prunes edits of texts no longer on the page on every save. The admin reads the text list from the live `index.html`. Created by the SQL in `ДОКУМЕНТАЦІЯ.md` §8; the site works without it (defaults, Etsy hidden).

`projects` and `workshops` items are photo-only (title/price unused on the site).

Storage bucket **`items`** (public). Uploads are named `<itemId>/<base36 stamp>-<w>x<h>-full.<webp|jpg>` plus a sibling `-thumb` (800px). A new name per upload (no overwrite/caching issues), uploaded via signed upload URL with `Cache-Control: max-age=31536000`; the old files are removed afterwards. The site derives the thumb URL and the image dimensions (for `width`/`height`) from the name. Legacy `<itemId>/full.webp` PNGs were re-compressed on 2026-09-28; the Налаштування card only appears if a non-optimized image exists. Uploads are a raw PUT to the signed upload URL with `Cache-Control: max-age=31536000` (verified: GET returns `public, max-age=31536000`; note Supabase answers HEAD with `no-cache` regardless, so check caching with GET). Deleting files needs storage RLS select+delete policies for `authenticated` (SQL №3 in `ДОКУМЕНТАЦІЯ.md`) — without them `remove()` silently deletes nothing. `admin.html?tools` shows an orphan-file cleanup. Safari can't encode WebP in `canvas.toBlob` → admin falls back to JPEG.

**RLS:** read public (`using (true)`), write only `to authenticated`.

## Data flow in `index.html`

- `loadSupabase()` (called in `componentDidMount`): plain `fetch` to PostgREST (`items`, `halls`, `settings`, anon key in `apikey` header); `applyRows()` → `setState({ paints, postcards, boxes, projects })`. `state.dataMode`: `loading` → `live`, or `error` (honest message, no fake works), or `demo` when Supabase isn't configured (only then the hardcoded `works`/`goods` show). Halls/settings errors are non-fatal. Supabase JS SDK is loaded ~3 s later only for the realtime `postgres_changes` channel; also reloads on `visibilitychange`.
- `hallGroups()` groups visible paintings into halls: `halls.sort_order` first, then halls only referenced by items (legacy `HALLS` map for texts), then no-hall works as «Інші роботи». Empty halls are dropped. Each gets a transliterated slug `hall-…`.
- Hall navigation is hash-based: `#halls` = overview cards, `#hall-<slug>` = single hall (`state.hall`), handled in the root click handler + `popstate`. Header «Зали ▾» dropdown (CSS hover/focus-within) and mobile menu list the halls.
- Image frames (`.dc-frame`): fixed 4:5 box, image `max-width/max-height: 100%`, bottom-aligned — never cropped or stretched (Kateryna's complaint about the old wall/catalog).
- `loc(it, lang)` — UA/EN with EN fallback to UA.
- Cart SKUs: `w<id>` painting, `p<id>` postcard, `b<id>` box; persisted in `localStorage.ko_cart`; hidden/deleted/price-0 items drop out of the cart. Price 0 → «Ціна за запитом» + «Запитати» (Telegram) instead of «В кошик». Checkout/ask/order → `t.me/@kate_art_tort?text=<encoded>` (never clipboard).
- Body scroll is locked in `componentDidUpdate` whenever the menu, cart, work modal or project lightbox is open.
- Open work is mirrored in the URL as `#work-<id>` via `replaceState` (no history spam); deep links open the modal inside its hall. «Поділитися» uses `navigator.share` or copies the link.
- Work links (`workLink(id)`) point to the preview page `w/<id>.html` (own OG title «Назва» — ціна, description tech · size · year, image = painting on the cream wall), which JS-redirects to `../#work-<id>` (no meta refresh — some crawlers follow it). Used by «Поділитися» and appended to «Запитати» Telegram messages for paintings. On localhost/file: falls back to `#work-<id>`. The generator reads the site URL from `index.html`'s `og:url`, lists paintings = `cat` not postcards/boxes/projects, not hidden, with `img`; re-renders a JPEG only when `img` (or `RENDER_VERSION`) changes; removes pages of hidden/deleted works. Local test: `PREVIEW_ITEMS=items.json PREVIEW_OUT=/tmp/w node .github/scripts/work-previews.mjs` (needs `npm i --no-save sharp@0.33.5`). Supabase Edge Functions can't serve HTML on the default domain (rewritten to text/plain) — that's why this is static.
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
- Admin URL: `https://antony-the-dev.github.io/kate_onokalo/admin.html`

## Design tokens

- Cream `#E9E4DC` (bg), deep navy **`#0A1C3B`** (dark sections/buttons — was `#111C2E`), terracotta `#B4501C`, gold `#C7A17A`, muted `#857F74`.
- Fonts: Cormorant Garamond (display) + Commissioner (body), loaded via Google Fonts in `<helmet>`.

## Gotchas / conventions

- **Don't edit `support.js`.** All site logic lives in the inline `<script type="text/x-dc">` inside `index.html`.
- After editing `index.html`, validate the inline script: extract it and run `node --check` (see below).
- Keep HTML balanced for `sc-if`/`sc-for`/`style`/`helmet` (past edits have broken `</style>` accidentally).
- **No absolute paths** (GitHub Pages subpath). Always relative: `img/...`, `./support.js`. (Exception: `404.html`, served at any depth — its home link is computed in JS; `w/*.html` use `../`.)
- The Work previews bot pushes to `main` — `git pull` before pushing.
- python SSL cert fails on this Mac (`CERTIFICATE_VERIFY_FAILED`) — use **node fetch** or `curl` for API calls.
- `image-slot.js` was removed; no longer used. The horizontal «Стіна» (wall) carousel was removed too (replaced by halls).
- The root wrapper uses `.dc-root { overflow-x: clip }` — `overflow-x: hidden` there breaks the sticky header.
- Overlays (`.dc-modal`) re-declare the light-text palette for dark theme via CSS variables; don't reintroduce `#artModal` attribute selectors.
- Title/description/OG tags live in the static `<head>` (crawlers don't run JS, `<helmet>` is runtime-only); `og:url`/`og:image` are absolute GitHub Pages URLs — update them if a custom domain is added. `<head>` also preconnects to the Supabase host.
- Nav switches to the burger at ≤1270px (7 items incl. the «Магазин ▾» dropdown = Листівки і закладинки + Брендована продукція, shown when either has items; 8 flat items didn't fit even at 1440). The phone menu stays a flat list.
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