#!/usr/bin/env node
/**
 * Download the published Roam and Repeat homepage + assets into source/
 * and write a baseline weight report.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'source');
const SITE_URL = 'https://roamandrepeat.webflow.io/';

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function download(url, dest) {
  await ensureDir(dirname(dest));
  const res = await fetch(url, {
    headers: { 'User-Agent': 'roamandrepeat-scrape/1.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return { url, dest, bytes: buf.length, contentType: res.headers.get('content-type') };
}

function isOriginalAsset(url) {
  // Skip Webflow responsive variants like -p-500, -p-800, etc.
  return !/-p-\d+\./.test(url);
}

function localPathFor(url) {
  const u = new URL(url);
  if (u.hostname.includes('website-files.com') || u.hostname.includes('cloudfront.net') || u.hostname.includes('googleapis.com')) {
    const safe = u.pathname.replace(/^\//, '').replace(/%20/g, '_');
    return join(SOURCE, 'cdn', u.hostname, safe);
  }
  return join(SOURCE, 'cdn', u.hostname, basename(u.pathname) || 'index');
}

function extractUrls(html) {
  const urls = new Set();
  const patterns = [
    /(?:href|src)=["'](https?:\/\/[^"']+)["']/gi,
    /srcset=["']([^"']+)["']/gi,
    /url\(["']?(https?:\/\/[^"')]+)["']?\)/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html))) {
      if (re.source.includes('srcset')) {
        for (const part of m[1].split(',')) {
          const u = part.trim().split(/\s+/)[0];
          if (u?.startsWith('http')) urls.add(u);
        }
      } else {
        urls.add(m[1]);
      }
    }
  }
  return [...urls];
}

async function main() {
  console.log('Scraping', SITE_URL);
  await ensureDir(SOURCE);

  const home = await download(SITE_URL, join(SOURCE, 'index.html'));
  const html = await readFile(home.dest, 'utf8');

  const urls = extractUrls(html).filter((u) => {
    try {
      const parsed = new URL(u);
      return /\.(css|js|woff2?|ttf|otf|svg|png|jpe?g|webp|avif|gif|ico)(\?|$)/i.test(parsed.pathname)
        || parsed.pathname.includes('/css/')
        || parsed.pathname.includes('/js/')
        || parsed.pathname.includes('/gsap/');
    } catch {
      return false;
    }
  });

  // Prefer originals over -p-N variants for images
  const filtered = urls.filter((u) => {
    if (/\.(png|jpe?g|webp|avif|gif)$/i.test(u)) return isOriginalAsset(u);
    return true;
  });

  const results = [home];
  for (const url of filtered) {
    const dest = localPathFor(url);
    try {
      const r = await download(url, dest);
      results.push(r);
      console.log(`  ✓ ${(r.bytes / 1024).toFixed(1)} KB  ${url}`);
    } catch (err) {
      console.warn(`  ✗ ${url}: ${err.message}`);
    }
  }

  // Also pull CSS-referenced assets (fonts, images in CSS)
  const cssEntries = results.filter((r) => r.dest.endsWith('.css'));
  for (const css of cssEntries) {
    const cssText = await readFile(css.dest, 'utf8');
    const cssUrls = [...cssText.matchAll(/url\(["']?(https?:\/\/[^"')]+)["']?\)/gi)].map((m) => m[1]);
    for (const url of cssUrls) {
      if (results.some((r) => r.url === url)) continue;
      try {
        const r = await download(url, localPathFor(url));
        results.push(r);
        console.log(`  ✓ CSS asset ${(r.bytes / 1024).toFixed(1)} KB  ${url}`);
      } catch (err) {
        console.warn(`  ✗ ${url}: ${err.message}`);
      }
    }
  }

  const totalBytes = results.reduce((s, r) => s + r.bytes, 0);
  const report = {
    scrapedAt: new Date().toISOString(),
    siteUrl: SITE_URL,
    fileCount: results.length,
    totalBytes,
    totalMB: +(totalBytes / (1024 * 1024)).toFixed(2),
    files: results
      .map((r) => ({
        url: r.url,
        bytes: r.bytes,
        kb: +(r.bytes / 1024).toFixed(1),
        path: r.dest.replace(ROOT + '/', ''),
      }))
      .sort((a, b) => b.bytes - a.bytes),
  };

  await writeFile(join(SOURCE, 'baseline.json'), JSON.stringify(report, null, 2));
  console.log(`\nBaseline: ${report.fileCount} files, ${report.totalMB} MB`);
  console.log(`Report → source/baseline.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
