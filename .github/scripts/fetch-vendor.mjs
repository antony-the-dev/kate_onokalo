// Re-downloads the self-hosted JS libraries into vendor/ from npm, so the site loads nothing from public CDNs
// (visitor IPs stay off unpkg/jsdelivr, and a CDN outage can't take the site down):
//   · React 18.3.1 UMD — must be byte-identical to what support.js expects (checked against its SRI hashes);
//     support.js skips its own unpkg download when window.React / window.ReactDOM already exist;
//   · @supabase/supabase-js UMD (window.supabase) — realtime on the site, everything in the admin.
// Run from the repo root:  node .github/scripts/fetch-vendor.mjs [supabase-js version]
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const SUPABASE = process.argv[2] || '2.117.2';
const PKGS = [
  { spec: 'react@18.3.1', file: 'umd/react.production.min.js', out: 'react.production.min.js', sri: 'REACT_SRI', lic: 'LICENSE-react.txt' },
  { spec: 'react-dom@18.3.1', file: 'umd/react-dom.production.min.js', out: 'react-dom.production.min.js', sri: 'REACT_DOM_SRI', lic: 'LICENSE-react-dom.txt' },
  { spec: '@supabase/supabase-js@' + SUPABASE, file: 'dist/umd/supabase.js', out: 'supabase.js', lic: 'LICENSE-supabase-js.txt' }
];

const support = await fs.readFile('support.js', 'utf8');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vendor-'));
await fs.mkdir('vendor', { recursive: true });
for (const p of PKGS) {
  const dir = path.join(tmp, p.out);
  await fs.mkdir(dir);
  const tgz = execFileSync('npm', ['pack', p.spec, '--silent'], { cwd: dir, encoding: 'utf8' }).trim().split('\n').pop();
  execFileSync('tar', ['xzf', tgz], { cwd: dir });
  const buf = await fs.readFile(path.join(dir, 'package', p.file));
  if (p.sri) {
    const want = (support.match(new RegExp(p.sri + ' = "([^"]+)"')) || [])[1];
    const got = 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
    if (want !== got) throw new Error(p.spec + ': hash ' + got + ' does not match support.js ' + p.sri + ' ' + want);
  }
  await fs.writeFile(path.join('vendor', p.out), buf);
  await fs.copyFile(path.join(dir, 'package', 'LICENSE'), path.join('vendor', p.lic));
  console.log(p.spec + ' → vendor/' + p.out + ' (' + Math.round(buf.length / 1024) + ' KB)');
}
await fs.rm(tmp, { recursive: true, force: true });
