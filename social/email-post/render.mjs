// Renders each post in a posts file to a PNG: 1080 × 1350, or 1080 × 1080 for "shape": "square".
//   node social/email-post/render.mjs                      every post in posts.json  -> out/<id>.png
//   node social/email-post/render.mjs spotted-rsa          just that post
//   node social/email-post/render.mjs lost-reports.json    a carousel file           -> out/lost-reports/<id>.png
//   node social/email-post/render.mjs lost-reports.json 08-future
// Uses the web app's Playwright (cd web; npm install; npx playwright install chromium).
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../web/package.json'));
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const file = args[0]?.endsWith('.json') ? args.shift() : 'posts.json';
const only = args[0];
// A carousel file may be a plain list, or { "defaults": {...}, "posts": [...] } to share fields between slides.
const raw = JSON.parse(readFileSync(join(here, file), 'utf8'));
const posts = (Array.isArray(raw) ? raw : raw.posts).map(p => ({ ...(raw.defaults || {}), ...p }));
const todo = only ? posts.filter(p => p.id === only) : posts;
if (!todo.length) { console.error(`No post with id "${only}" in ${file}`); process.exit(1); }
const outDir = file === 'posts.json' ? join(here, 'out') : join(here, 'out', file.replace(/\.json$/, ''));

// Picture paths in posts.json are relative to the repo root; the template needs them relative to itself.
const root = resolve(here, '../..');
const fromTemplate = p => {
  if (!p) return p;
  const abs = resolve(root, p);
  if (!existsSync(abs)) throw new Error(`Picture not found: ${p}`);
  return relative(here, abs).replaceAll('\\', '/');
};

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();

for (const post of todo) {
  // A fresh page per post: an init script added to a page stays on it.
  const page = await browser.newPage({ viewport: { width: 1080, height: post.shape === 'square' ? 1080 : 1350 }, deviceScaleFactor: 1 });
  const data = { ...post };
  if (data.avatar) data.avatar = fromTemplate(data.avatar);
  if (data.mascot?.src) data.mascot = { ...data.mascot, src: fromTemplate(data.mascot.src) };
  await page.addInitScript(d => { window.POST = d; }, data);
  await page.goto(pathToFileURL(join(here, 'template.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
  });
  const out = join(outDir, `${post.id}.png`);
  await page.locator('#post').screenshot({ path: out });
  console.log('wrote', relative(root, out));
  await page.close();
}
await browser.close();
