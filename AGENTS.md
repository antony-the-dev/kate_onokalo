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
| `index.html` | Public site: hero, wall, catalog, postcards, boxes, about, order, collab, contact, cart, modal. Reads Supabase with fallback to hardcoded data. |
| `admin.html` | Admin panel (standalone, plain JS): login, tabs (Картини / Листівки / Бокси / Зали), CRUD, image upload with client-side resize to webp 1600px, order/hide/delete. |
| `supabase-config.js` | Supabase url + anonKey. |
| `support.js` | DC runtime (generated — don't edit). |
| `img/` | WebP assets + favicons. |
| `ДОКУМЕНТАЦІЯ.md`, `ІНСТРУКЦІЯ-ДЛЯ-КАТЕРИНИ.md` | Handover docs (UA). |

## Supabase data model

Table **`items`** (id uuid PK; app generates UUIDs via `crypto.randomUUID()`):
`cat` (paintings|postcards|boxes), `title`, `title_en`, `price` (int, UAH), `size`, `size_en`, `tech`, `tech_en`, `hall`, `hall_en`, `description`, `description_en`, `year`, `img` (storage publicUrl), `sort_order`, `hidden`, `created_at`.

Table **`halls`**: `num` (label like "I"), `name` (UA, grouping key), `name_en`, `note`, `note_en`, `sort_order`.

Storage bucket **`items`** (public), files at `<itemId>/full.webp`.

**RLS:** read public (`using (true)`), write only `to authenticated`.

## Data flow in `index.html`

- `loadSupabase()` (called in `componentDidMount`): lazily loads `@supabase/supabase-js` from CDN only if config present; queries `items` + `halls`; `applyRows()` → `setState({ paints, postcards, boxes, halls })`. Resilient: halls error → `halls: null`; items still load. If items empty → sections show empty states (honest, no fallback). Real-time via `postgres_changes` channel + reload on `visibilitychange`.
- Getters `paints()/posts()/boxes()` return live state or hardcoded defaults (defaults only when Supabase not configured / failed).
- `loc(it, lang)` — UA/EN with EN fallback to UA.
- Cart SKUs: `w<id>` painting, `p<id>` postcard, `b<id>` box. Checkout/ask/order → `t.me/@kate_art_tort?text=<encoded>` (never clipboard).
- `buildWall()` groups paintings by `hall` into divider + work blocks; falls back to built-in HALLS map.

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
- `image-slot.js` was removed; no longer used.
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

# Local preview:
python3 -m http.server 8000
```