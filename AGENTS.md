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
| `admin.html` | Admin panel (standalone, plain JS): login, tabs (Картини / Листівки / Бокси / Реалізовані проєкти / Зали / Налаштування), CRUD, section («Розділ») select to move items between categories, photo pipeline (see below), order/hide/delete, settings (projects intro, Etsy URL), one-off legacy photo re-compression. |
| `supabase-config.js` | Supabase url + anonKey. |
| `support.js` | DC runtime (generated — don't edit). |
| `img/` | WebP assets, favicons, `og-1200.jpg` (link-preview image). |
| `ДОКУМЕНТАЦІЯ.md`, `ІНСТРУКЦІЯ-ДЛЯ-КАТЕРИНИ.md` | Handover docs (UA). |

## Supabase data model

Table **`items`** (id uuid PK; app generates UUIDs via `crypto.randomUUID()`):
`cat` (paintings|postcards|boxes|projects), `title`, `title_en`, `price` (int, UAH), `size`, `size_en`, `tech`, `tech_en`, `hall`, `hall_en`, `description`, `description_en`, `year`, `img` (storage publicUrl), `sort_order`, `hidden`, `created_at`.

Table **`halls`**: `num` (label like "I"), `name` (UA, grouping key — items reference it by this string; admin cascades renames into `items.hall`/`hall_en`), `name_en`, `note`, `note_en`, `sort_order`.

Table **`settings`** (`key` text PK, `value` text): `projects_intro`, `projects_intro_en`, `etsy_url`. Created by the SQL in `ДОКУМЕНТАЦІЯ.md` §8; the site works without it (defaults, Etsy hidden).

`projects` items are photo-only (title/price unused on the site).

Storage bucket **`items`** (public). Uploads are named `<itemId>/<base36 stamp>-<w>x<h>-full.<webp|jpg>` plus a sibling `-thumb` (800px). A new name per upload (no overwrite/caching issues), uploaded via signed upload URL with `Cache-Control: max-age=31536000`; the old files are removed afterwards. The site derives the thumb URL and the image dimensions (for `width`/`height`) from the name. Legacy `<itemId>/full.webp` PNGs were re-compressed on 2026-09-28; the Налаштування card only appears if a non-optimized image exists. Uploads go through `uploadToSignedUrl` (multipart — the only way `cacheControl` is stored; a raw PUT ignores the header and falls back to `no-cache`), with a raw PUT as fallback. Deleting files needs storage RLS select+delete policies for `authenticated` (SQL №3 in `ДОКУМЕНТАЦІЯ.md`) — without them `remove()` silently deletes nothing. `admin.html?tools` shows an orphan-file cleanup. Safari can't encode WebP in `canvas.toBlob` → admin falls back to JPEG.

**RLS:** read public (`using (true)`), write only `to authenticated`.

## Data flow in `index.html`

- `loadSupabase()` (called in `componentDidMount`): plain `fetch` to PostgREST (`items`, `halls`, `settings`, anon key in `apikey` header); `applyRows()` → `setState({ paints, postcards, boxes, projects })`. `state.dataMode`: `loading` → `live`, or `error` (honest message, no fake works), or `demo` when Supabase isn't configured (only then the hardcoded `works`/`goods` show). Halls/settings errors are non-fatal. Supabase JS SDK is loaded ~3 s later only for the realtime `postgres_changes` channel; also reloads on `visibilitychange`.
- `hallGroups()` groups visible paintings into halls: `halls.sort_order` first, then halls only referenced by items (legacy `HALLS` map for texts), then no-hall works as «Інші роботи». Empty halls are dropped. Each gets a transliterated slug `hall-…`.
- Hall navigation is hash-based: `#halls` = overview cards, `#hall-<slug>` = single hall (`state.hall`), handled in the root click handler + `popstate`. Header «Зали ▾» dropdown (CSS hover/focus-within) and mobile menu list the halls.
- Image frames (`.dc-frame`): fixed 4:5 box, image `max-width/max-height: 100%`, bottom-aligned — never cropped or stretched (Kateryna's complaint about the old wall/catalog).
- `loc(it, lang)` — UA/EN with EN fallback to UA.
- Cart SKUs: `w<id>` painting, `p<id>` postcard, `b<id>` box; persisted in `localStorage.ko_cart`; hidden/deleted/price-0 items drop out of the cart. Price 0 → «Ціна за запитом» + «Запитати» (Telegram) instead of «В кошик». Checkout/ask/order → `t.me/@kate_art_tort?text=<encoded>` (never clipboard).
- Body scroll is locked in `componentDidUpdate` whenever the menu, cart, work modal or project lightbox is open.

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
- **No absolute paths** (GitHub Pages subpath). Always relative: `img/...`, `./support.js`.
- python SSL cert fails on this Mac (`CERTIFICATE_VERIFY_FAILED`) — use **node fetch** or `curl` for API calls.
- `image-slot.js` was removed; no longer used. The horizontal «Стіна» (wall) carousel was removed too (replaced by halls).
- The root wrapper uses `.dc-root { overflow-x: clip }` — `overflow-x: hidden` there breaks the sticky header.
- Overlays (`.dc-modal`) re-declare the light-text palette for dark theme via CSS variables; don't reintroduce `#artModal` attribute selectors.
- Title/description/OG tags live in the static `<head>` (crawlers don't run JS, `<helmet>` is runtime-only); `og:url`/`og:image` are absolute GitHub Pages URLs — update them if a custom domain is added. `<head>` also preconnects to the Supabase host.
- Nav switches to the burger below 1180px (7 items don't fit earlier).
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