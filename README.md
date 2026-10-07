# Roam and Repeat — Optimized Static Site

Lean, mobile-first rebuild of [roamandrepeat.webflow.io](https://roamandrepeat.webflow.io/). Keeps the cloud parallax hero, floating image reveals, and gallery lightbox while cutting page weight dramatically.

## Setup

```bash
npm install
npm run scrape   # pull published assets into source/
npm run fonts    # download & subset Satoshi
npm run build    # optimize images + emit dist/
npm run dev      # preview dist/ at http://localhost:4173
```

## Structure

| Path | Purpose |
|------|---------|
| `source/` | Untouched scrape of the published Webflow site (baseline) |
| `src/` | Hand-rebuilt HTML, CSS, JS, fonts |
| `dist/` | Production output (minified CSS/JS, AVIF/WebP images) |
| `scripts/` | scrape, fonts, and build pipelines |

## Goals

- Responsive AVIF/WebP images with correct `sizes`
- Self-hosted Latin-subset Satoshi (no Exo / webfont.js)
- Vanilla JS only (no jQuery, Webflow runtime, or GSAP)
- Mobile-first fluid type + spacing tokens
- Accessible nav, lightbox (`<dialog>`), and reduced-motion support

## Performance (after build)

| Metric | Webflow baseline | Optimized `dist/` |
|--------|------------------|-------------------|
| On-disk assets | ~16.5 MB | ~3.6 MB (all responsive variants) |
| Est. mobile transfer | multi-MB originals + ~650 KB JS | ~592 KB (HTML+CSS+JS+font+800w WebPs) |
| CSS | ~71 KB | ~11 KB |
| JS | ~650 KB (jQuery + Webflow + GSAP) | ~2.8 KB |
| Font | Exo (18 cuts) + unbroken Satoshi TTF | 35 KB Latin Satoshi woff2 |

Transfer weight is ~96% lower than the scraped baseline.

Preview: `npm run dev` → http://localhost:4173
