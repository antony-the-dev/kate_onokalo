// «Приміряти на стіні» check, shared by index.html (the room view) and admin.html (hints for Kateryna):
// can the painted canvas be cut out of the photo, and at what real size and orientation?
(function () {
  "use strict";

  // Two numbers in cm ("40x40", "100 × 60 см"); anything else (diptychs, free text) → null.
  function parseSize(s) {
    const nums = String(s || "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g);
    if (!nums || nums.length !== 2) return null;
    const a = Number(nums[0]), b = Number(nums[1]);
    return (a >= 5 && b >= 5 && a <= 400 && b <= 400) ? [a, b] : null;
  }

  // Finds the canvas inside a studio shot on a plain backdrop: the border ring gives the backdrop colour,
  // rows/columns that mostly differ from it are the painting. Busy backgrounds (interiors, packaging) → null.
  function detectBox(img) {
    const S = 200, sc = S / Math.max(img.naturalWidth, img.naturalHeight);
    const w = Math.max(8, Math.round(img.naturalWidth * sc)), h = Math.max(8, Math.round(img.naturalHeight * sc));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const m = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    const ring = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (i < m || j < m || i >= w - m || j >= h - m) { const k = (j * w + i) * 4; ring.push([d[k], d[k + 1], d[k + 2]]); }
    }
    const med = [0, 1, 2].map((ch) => { const v = ring.map((p) => p[ch]).sort((a, b) => a - b); return v[v.length >> 1]; });
    const spread = Math.sqrt(ring.reduce((s, p) => s + (p[0] - med[0]) ** 2 + (p[1] - med[1]) ** 2 + (p[2] - med[2]) ** 2, 0) / ring.length);
    if (spread > 35) return null;
    const T = Math.max(38, spread * 2.2);
    const rows = new Array(h).fill(0), cols = new Array(w).fill(0);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      if (Math.hypot(d[k] - med[0], d[k + 1] - med[1], d[k + 2] - med[2]) > T) { rows[j]++; cols[i]++; }
    }
    const on = (v, n) => v / n > 0.35;
    const t = rows.findIndex((v) => on(v, w)), b = h - 1 - [...rows].reverse().findIndex((v) => on(v, w));
    const l = cols.findIndex((v) => on(v, h)), r = w - 1 - [...cols].reverse().findIndex((v) => on(v, h));
    if (t < 0 || l < 0 || (b - t + 1) / h < 0.2 || (r - l + 1) / w < 0.2) return null;
    return [l / w, t / h, (r + 1) / w, (b + 1) / h];
  }

  // img must be loaded (CORS-readable); dims = full-size {w, h}; size = parseSize() result.
  // → { ok: true, box, wCm, hCm } or { ok: false, reason: "size" | "photo" | "ratio" }.
  function check(img, dims, size) {
    if (!size) return { ok: false, reason: "size" };
    const box = detectBox(img);
    if (!box) return { ok: false, reason: "photo" };
    const ar = ((box[2] - box[0]) * dims.w) / ((box[3] - box[1]) * dims.h);
    const opts = size[0] === size[1] ? [size] : [size, [size[1], size[0]]];
    const best = opts.map((o) => ({ o, err: Math.abs(Math.log(ar / (o[0] / o[1]))) })).sort((p, q) => p.err - q.err)[0];
    if (best.err > Math.log(1.25)) return { ok: false, reason: "ratio" };
    return { ok: true, box, wCm: best.o[0], hCm: best.o[1] };
  }

  window.KoWall = { parseSize, detectBox, check };
})();
