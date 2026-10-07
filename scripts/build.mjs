#!/usr/bin/env node
/**
 * Optimize images (AVIF/WebP), minify CSS/JS, copy HTML + fonts → dist/
 */
import { mkdir, readdir, copyFile, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { dirname, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const { transform } = require('lightningcss');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const ASSET_SRC = join(
  ROOT,
  'source/cdn/cdn.prod.website-files.com/693862b248ec4911a37dd5c9'
);

const WIDTHS = [480, 800, 1200, 1600];
const FORCE = process.argv.includes('--clean');
const CACHE_FILE = join(DIST, 'images', '.cache.json');
let CACHE = {};

/** Logical image jobs: source file → output stem + options */
const IMAGE_JOBS = [
  // Flight scene: bands are trimmed to their opaque bounds so they can be positioned precisely
  { file: '69668b33571089ee3313bc7b_Clouds-1.png', stem: 'sky', trim: true, alpha: true, q: 60, widths: [800, 1200, 1600] },
  { file: '69668b33571089ee3313bc93_Clouds-2.png', stem: 'band-1', trim: true, alpha: true, q: 60, widths: [800, 1200, 1600] },
  { file: '69668b33571089ee3313bc72_Clouds-3.png', stem: 'band-2', trim: true, alpha: true, q: 60, widths: [800, 1200, 1600] },
  { file: '69668b33571089ee3313bcb8_Clouds-4.png', stem: 'band-3', trim: true, alpha: true, q: 60, widths: [800, 1200, 1600] },
  { file: '69668b33571089ee3313bcc1_Clouds-5.png', stem: 'band-4', trim: true, alpha: true, q: 60, widths: [800, 1200, 1600] },
  { file: '69668b33571089ee3313bca9_Clouds-6.png', stem: 'band-5', trim: true, alpha: true, q: 60, widths: [800, 1200, 1600] },
  // AVIF with soft alpha comes out larger than WebP for these puffs
  { file: '69668b33571089ee3313bc87_Fog1.png', stem: 'puff-1', trim: true, feather: true, alpha: true, q: 45, widths: [480, 800, 1200], formats: ['webp'] },
  { file: '69668b33571089ee3313bc9e_Fog2.png', stem: 'puff-2', trim: true, feather: true, alpha: true, q: 45, widths: [480, 800, 1200], formats: ['webp'] },
  { file: '69668b33571089ee3313bccd_rr_plane.webp', stem: 'plane', trim: true, alpha: true, q: 72, widths: [480, 800, 1200] },
  { file: '69668b33571089ee3313bcb0_6580a5368bd954da4cba9499_RoamandRepeat_Logo_White_Shadow.png', stem: 'logo', alpha: true, q: 80, maxW: 400, widths: [200, 400] },
  { file: '693862b448ec4911a37dd722_hero-bg-sky.webp', stem: 'hero-sky', alpha: false, q: 65, maxW: 1600 },
  { file: '69669c5df21e2bcd3c404dfb_airport.webp', stem: 'airport', alpha: false, q: 65, maxW: 1200 },
  // Product / gallery photos — cap at 1200 (display size never needs 1600+)
  { file: '696918d9b30f6368f36aad32_AdobeStock_493921143.jpg', stem: 'product-1', q: 68, maxW: 1200 },
  { file: '696918d83258960d727337b5_AdobeStock_279190530.jpg', stem: 'product-2', q: 68, maxW: 1200 },
  { file: '696918d95112b5217576f98d_AdobeStock_425653713.jpg', stem: 'product-3', q: 65, maxW: 1200 },
  { file: '696918d9f77435f6456d4498_AdobeStock_279718042.jpg', stem: 'gallery-tl', q: 65, maxW: 1200 },
  { file: '69692680e1a24961d1f6e719_Roam_Repeat_Open_Graph.webp', stem: 'gallery-center', q: 70, maxW: 1200 },
  { file: '696918dad1b9e8032edc13cf_AdobeStock_279126842.jpg', stem: 'gallery-tr', q: 65, maxW: 1200 },
  { file: '696918daeac6649cb79a45be_AdobeStock_183724962.jpg', stem: 'gallery-bl', q: 65, maxW: 1200 },
  { file: '696918d97a2b99ae86dc8780_AdobeStock_196990370.jpg', stem: 'gallery-br', q: 65, maxW: 1200 },
  { file: '696918da97a3f7fc65673ffe_AdobeStock_183725134.jpg', stem: 'contact', q: 68, maxW: 1200 },
  { file: '69b054fca268563b2510fb23_RoamandRepeat_favicon_32.jpg', stem: 'favicon', q: 85, widths: [32], formats: ['png'] },
  { file: '69b054ff20c22f6c59b2a004_RoamandRepeat_favicon.jpg', stem: 'apple-touch-icon', q: 85, widths: [180], formats: ['png'] },
];

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

/** Crop to the bounding box of pixels with visible alpha. */
async function alphaTrim(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > 8) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right < 0) return sharp(input).png().toBuffer();
  return sharp(input)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png()
    .toBuffer();
}

/** Fade the outer edges to transparent; some source fog art is cut off at the canvas edge. */
async function feather(buffer) {
  const { width, height } = await sharp(buffer).metadata();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs><radialGradient id="g" cx="50%" cy="50%" r="50%">
        <stop offset="55%" stop-color="#fff" stop-opacity="1"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </radialGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`
  );
  return sharp(buffer).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

async function isFresh(out, inputMtime) {
  try {
    return (await stat(out)).mtimeMs >= inputMtime;
  } catch {
    return false;
  }
}

async function processImage(job) {
  const input = join(ASSET_SRC, job.file);
  const outDir = join(DIST, 'images');
  await ensureDir(outDir);

  let source = job.trim ? await alphaTrim(input) : input;
  if (job.feather) source = await feather(source);
  const meta = await sharp(source).metadata();
  const widths = (job.widths || WIDTHS).filter((w) => w <= (job.maxW || 2400) && w <= (meta.width || 9999));
  if (!widths.length) widths.push(Math.min(meta.width || 800, job.maxW || 1600));

  const formats = job.formats || ['avif', 'webp'];
  const results = [];
  const inputMtime = (await stat(input)).mtimeMs;
  const signature = JSON.stringify(job);
  const settingsChanged = job.stem in CACHE && CACHE[job.stem] !== signature;
  CACHE[job.stem] = signature;

  for (const w of widths) {
    let pipeline = sharp(source).resize({ width: w, withoutEnlargement: true });
    for (const fmt of formats) {
      const out = join(outDir, `${job.stem}-${w}.${fmt}`);
      if (!FORCE && !settingsChanged && (await isFresh(out, inputMtime))) {
        results.push({ file: out, bytes: (await stat(out)).size, cached: true });
        continue;
      }
      let p = pipeline.clone();
      if (fmt === 'avif') p = p.avif({ quality: job.q || 65, effort: 5, chromaSubsampling: '4:2:0' });
      else if (fmt === 'webp')
        p = p.webp({
          quality: job.q || 68,
          alphaQuality: job.alpha ? 60 : 100,
          smartSubsample: true,
          effort: 5,
        });
      else if (fmt === 'png') p = p.png({ compressionLevel: 9 });
      await p.toFile(out);
      const s = await stat(out);
      results.push({ file: out, bytes: s.size });
    }
  }

  return { stem: job.stem, width: meta.width, height: meta.height, results };
}

async function copySvgs() {
  const outDir = join(DIST, 'images');
  await ensureDir(outDir);
  const svgs = [
    '69668b33571089ee3313bc6d_down-arrow.svg',
    '693862b448ec4911a37dd715_left-arrow.svg',
    '693862b448ec4911a37dd716_right-arrow.svg',
  ];
  for (const f of svgs) {
    const name = f.includes('down') ? 'down-arrow.svg' : f.includes('left') ? 'left-arrow.svg' : 'right-arrow.svg';
    await copyFile(join(ASSET_SRC, f), join(outDir, name));
  }
}

async function buildCss() {
  const cssPath = join(SRC, 'styles/main.css');
  const css = await readFile(cssPath, 'utf8');
  const { code } = transform({
    filename: 'main.css',
    code: Buffer.from(css),
    minify: true,
    sourceMap: false,
  });
  await ensureDir(join(DIST, 'css'));
  await writeFile(join(DIST, 'css/main.css'), code);
  return code.length;
}

async function buildJs() {
  await ensureDir(join(DIST, 'js'));
  await esbuild.build({
    entryPoints: [join(SRC, 'js/main.js')],
    outfile: join(DIST, 'js/main.js'),
    bundle: true,
    minify: true,
    target: ['es2020'],
    format: 'iife',
  });
  const s = await stat(join(DIST, 'js/main.js'));
  return s.size;
}

async function copyHtmlAndFonts() {
  await copyFile(join(SRC, 'index.html'), join(DIST, 'index.html'));
  await ensureDir(join(DIST, 'fonts'));
  try {
    const fonts = await readdir(join(SRC, 'fonts'));
    for (const f of fonts) {
      await copyFile(join(SRC, 'fonts', f), join(DIST, 'fonts', f));
    }
  } catch {
    console.warn('No fonts in src/fonts — run npm run fonts first');
  }
}

async function writeReport(imageStats, cssBytes, jsBytes) {
  const walk = async (dir, acc = []) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return acc;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p, acc);
      else {
        const s = await stat(p);
        acc.push({ path: p.replace(DIST + '/', ''), bytes: s.size });
      }
    }
    return acc;
  };
  const files = await walk(DIST);
  const total = files.reduce((s, f) => s + f.bytes, 0);
  let baseline = null;
  try {
    baseline = JSON.parse(await readFile(join(ROOT, 'source/baseline.json'), 'utf8'));
  } catch {}

  // Estimate typical mobile transfer: HTML + CSS + JS + font + one ~800w WebP per image stem
  const webp800 = files.filter((f) => /images\/.+-800\.webp$/.test(f.path));
  const logo = files.find((f) => f.path.includes('logo-400.webp'));
  const favicon = files.find((f) => f.path.includes('favicon-32.png'));
  const fontFile = files.find((f) => f.path.endsWith('.woff2'));
  const htmlFile = files.find((f) => f.path === 'index.html');
  const transferEstimate =
    (htmlFile?.bytes || 0) +
    cssBytes +
    jsBytes +
    (fontFile?.bytes || 0) +
    (logo?.bytes || 0) +
    (favicon?.bytes || 0) +
    webp800.reduce((s, f) => s + f.bytes, 0);

  const report = {
    builtAt: new Date().toISOString(),
    distBytes: total,
    distMB: +(total / (1024 * 1024)).toFixed(2),
    fileCount: files.length,
    cssBytes,
    jsBytes,
    estimatedMobileTransferKB: +(transferEstimate / 1024).toFixed(1),
    baselineMB: baseline?.totalMB ?? null,
    baselineBytes: baseline?.totalBytes ?? null,
    diskSavingsPct: baseline
      ? +(((baseline.totalBytes - total) / baseline.totalBytes) * 100).toFixed(1)
      : null,
    transferVsBaselinePct: baseline
      ? +(((baseline.totalBytes - transferEstimate) / baseline.totalBytes) * 100).toFixed(1)
      : null,
    largest: files.sort((a, b) => b.bytes - a.bytes).slice(0, 20),
    images: imageStats.map((i) => ({
      stem: i.stem,
      variants: i.results.length,
      bytes: i.results.reduce((s, r) => s + r.bytes, 0),
    })),
  };
  await writeFile(join(DIST, 'build-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nDist: ${report.fileCount} files, ${report.distMB} MB on disk`);
  console.log(`Estimated mobile transfer (HTML+CSS+JS+font+800w WebPs): ${report.estimatedMobileTransferKB} KB`);
  if (report.diskSavingsPct != null) {
    console.log(`vs baseline ${report.baselineMB} MB → ${report.transferVsBaselinePct}% less transfer weight`);
  }
  return report;
}

async function main() {
  console.log('Building dist/…');
  if (FORCE) {
    await rm(DIST, { recursive: true, force: true });
  } else {
    // Keep dist/images as a cache; stale stems are pruned below
    for (const entry of await readdir(DIST).catch(() => [])) {
      if (entry !== 'images') await rm(join(DIST, entry), { recursive: true, force: true });
    }
  }
  await ensureDir(join(DIST, 'images'));
  if (!FORCE) CACHE = JSON.parse(await readFile(CACHE_FILE, 'utf8').catch(() => '{}'));

  console.log('Optimizing images…');
  const imageStats = [];
  for (const job of IMAGE_JOBS) {
    try {
      const r = await processImage(job);
      const kb = (r.results.reduce((s, x) => s + x.bytes, 0) / 1024).toFixed(1);
      const cached = r.results.every((x) => x.cached) ? ', cached' : '';
      console.log(`  ✓ ${job.stem} ${r.width}x${r.height} (${r.results.length} variants, ${kb} KB${cached})`);
      imageStats.push(r);
    } catch (err) {
      console.warn(`  ✗ ${job.stem}: ${err.message}`);
    }
  }
  await copySvgs();

  const keep = new Set(imageStats.flatMap((i) => i.results.map((r) => basename(r.file))));
  keep.add('.cache.json');
  for (const f of await readdir(join(DIST, 'images'))) {
    if (!f.endsWith('.svg') && !keep.has(f)) await rm(join(DIST, 'images', f));
  }
  await writeFile(CACHE_FILE, JSON.stringify(CACHE, null, 2));

  console.log('Minifying CSS…');
  const cssBytes = await buildCss();
  console.log(`  ✓ css/main.css ${(cssBytes / 1024).toFixed(1)} KB`);

  console.log('Bundling JS…');
  const jsBytes = await buildJs();
  console.log(`  ✓ js/main.js ${(jsBytes / 1024).toFixed(1)} KB`);

  await copyHtmlAndFonts();
  await writeReport(imageStats, cssBytes, jsBytes);
  console.log('Done → dist/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
