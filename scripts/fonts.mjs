#!/usr/bin/env node
/**
 * Subset Satoshi Variable (from scraped source) to Latin and emit woff2.
 * Uses Python fontTools + brotli when available.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, copyFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_TTF = join(
  ROOT,
  'source/cdn/cdn.prod.website-files.com/693862b248ec4911a37dd5c9/693862b448ec4911a37dd70e_Satoshi-Variable.ttf'
);
const OUT_DIR = join(ROOT, 'src/fonts');
const OUT_WOFF2 = join(OUT_DIR, 'satoshi-variable-latin.woff2');

const PY = `
from fontTools import subset
from pathlib import Path
import sys

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
dst.parent.mkdir(parents=True, exist_ok=True)

options = subset.Options()
options.layout_features = ["*"]
options.name_IDs = ["*"]
options.name_legacy = True
options.name_languages = ["*"]
options.notdef_outline = True
options.recalc_bounds = True
options.recalc_timestamp = False
options.canonical_order = True
options.flavor = "woff2"
options.with_zopfli = False

# Latin + common punctuation / currency
unicodes = []
ranges = [
  (0x0020, 0x007E),  # Basic Latin
  (0x00A0, 0x00FF),  # Latin-1 Supplement
  (0x0100, 0x017F),  # Latin Extended-A
  (0x2010, 0x2027),  # dashes, quotes
  (0x2030, 0x203A),
  (0x20AC, 0x20AC),  # euro
]
for a, b in ranges:
  unicodes.extend(range(a, b + 1))

font = subset.load_font(str(src), options)
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=unicodes)
subsetter.subset(font)
subset.save_font(font, str(dst), options)
print(f"Wrote {dst} ({dst.stat().st_size} bytes)")
`;

async function main() {
  await access(SRC_TTF);
  await mkdir(OUT_DIR, { recursive: true });

  const result = spawnSync('python3', ['-c', PY, SRC_TTF, OUT_WOFF2], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    console.warn('fontTools woff2 failed — copying TTF as fallback');
    const fallback = join(OUT_DIR, 'satoshi-variable.ttf');
    await copyFile(SRC_TTF, fallback);
    console.log('Copied', fallback);
    process.exit(result.status === null ? 1 : result.status);
  }

  console.log(result.stdout.trim());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
