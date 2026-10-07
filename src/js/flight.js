const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const range = (v, a, b) => clamp((v - a) / (b - a));

// Plane path keyframes in stage percentages: [progress, x, y, scale, rotateDeg]
const PLANE_PATH = [
  [0.0, 20, 74, 0.55, -14],
  [0.2, 48, 52, 1, -5],
  [0.5, 52, 48, 1.04, -2],
  [0.8, 54, 46, 1.06, -3],
  [1.0, 118, 2, 0.35, -20],
];

const PUFF_SRC = {
  1: 'images/puff-1-480.webp 480w, images/puff-1-800.webp 800w, images/puff-1-1200.webp 1200w',
  2: 'images/puff-2-480.webp 480w, images/puff-2-800.webp 800w, images/puff-2-1200.webp 1200w',
};

// x/y: lateral offset from screen centre (-1..1); at: progress when the puff reaches the camera
const PUFFS = [
  { img: 1, x: -0.8, y: 0.3, at: 0.14, w: 46 },
  { img: 2, x: 0.7, y: -0.2, at: 0.22, w: 52 },
  { img: 1, x: 0.15, y: 0.15, at: 0.31, w: 60 },
  { img: 2, x: -0.55, y: -0.35, at: 0.4, w: 44, desktop: true },
  { img: 1, x: 0.85, y: 0.4, at: 0.47, w: 50 },
  { img: 2, x: -0.2, y: 0.05, at: 0.55, w: 64 },
  { img: 1, x: 0.5, y: -0.4, at: 0.62, w: 42, desktop: true },
  { img: 2, x: -0.9, y: 0.25, at: 0.69, w: 54 },
  { img: 1, x: 0.3, y: 0.3, at: 0.76, w: 58, desktop: true },
  { img: 2, x: -0.35, y: -0.15, at: 0.83, w: 60 },
  { img: 1, x: 0.05, y: 0.05, at: 0.95, w: 90 },
];

function planeAt(p) {
  let i = 0;
  while (i < PLANE_PATH.length - 2 && p > PLANE_PATH[i + 1][0]) i++;
  const a = PLANE_PATH[i];
  const b = PLANE_PATH[i + 1];
  const t = smooth(range(p, a[0], b[0]));
  return { x: lerp(a[1], b[1], t), y: lerp(a[2], b[2], t), s: lerp(a[3], b[3], t), r: lerp(a[4], b[4], t) };
}

export function initFlight() {
  const section = document.querySelector('[data-flight]');
  if (!section) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const stage = section.querySelector('[data-flight-stage]');
  const sky = stage.querySelector('[data-layer="sky"]');
  const grade = stage.querySelector('[data-grade]');
  const sun = stage.querySelector('[data-sun]');
  const bands = [...stage.querySelectorAll('[data-band]')].map((el) => ({ el, depth: +el.dataset.band }));
  const plane = stage.querySelector('[data-plane]');
  const trail = stage.querySelector('[data-trail]');
  const captions = [...stage.querySelectorAll('[data-caption]')].map((el) => {
    const [a, b] = el.dataset.caption.split(' ').map(Number);
    return { el, a, b };
  });
  const alt = stage.querySelector('[data-alt]');
  const routePlane = stage.querySelector('[data-route-plane]');
  const cue = stage.querySelector('[data-cue]');
  const whiteout = stage.querySelector('[data-whiteout]');
  const header = document.querySelector('[data-nav]');
  const backLayer = stage.querySelector('[data-puffs-back]');
  const frontLayer = stage.querySelector('[data-puffs-front]');

  const isDesktop = window.matchMedia('(min-width: 768px)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const puffs = PUFFS.filter((d) => isDesktop || !d.desktop).map((d) => {
    const img = new Image();
    img.className = 'flight__puff';
    img.alt = '';
    img.decoding = 'async';
    img.srcset = PUFF_SRC[d.img];
    img.sizes = `${d.w}vw`;
    img.style.width = `${d.w}vw`;
    backLayer.append(img);
    return { ...d, el: img, flip: d.x < 0 ? -1 : 1, front: false };
  });

  stage.classList.add('is-live');

  let target = 0;
  let current = 0;
  let prev = 0;
  let velocity = 0;
  let px = 0;
  let py = 0;
  let tx = 0;
  let ty = 0;
  let last = performance.now();
  let running = false;
  let inView = false;
  let raf = 0;
  let lastAlt = -1;

  const measure = () => {
    const rect = section.getBoundingClientRect();
    const travel = section.offsetHeight - window.innerHeight;
    target = travel > 0 ? clamp(-rect.top / travel) : 0;
  };

  const render = (now) => {
    const dt = Math.min(64, now - last);
    last = now;

    current += (target - current) * (1 - Math.pow(0.86, dt / 16.67));
    if (Math.abs(target - current) < 0.0001) current = target;
    velocity = lerp(velocity, ((current - prev) / dt) * 1000, 0.15);
    prev = current;
    px += (tx - px) * 0.06;
    py += (ty - py) * 0.06;

    const p = current;
    const W = window.innerWidth;
    const H = window.innerHeight;

    sky.style.transform = `translate3d(${px * -8}px, ${p * 6 + py * -6}vh, 0) scale(${1.08 + p * 0.12})`;
    grade.style.opacity = (1 - smooth(range(p, 0, 0.6))).toFixed(3);
    sun.style.opacity = smooth(range(p, 0.15, 0.75)).toFixed(3);

    // Climbing: nearer cloud banks drop away faster and swell toward the camera
    for (const { el, depth } of bands) {
      const y = p * depth * 70;
      const s = 1 + p * depth * 0.7;
      el.style.transform = `translate3d(calc(-50% + ${px * depth * -24}px), ${y}vh, 0) scale(${s})`;
    }

    const bob = Math.sin(now / 900) * 6;
    const bank = clamp(velocity * 18, -7, 7);
    const pp = planeAt(p);
    plane.style.transform =
      `translate3d(calc(${(pp.x / 100) * W}px - 50% + ${px * 22}px), calc(${(pp.y / 100) * H}px - 50% + ${bob + py * 14}px), 0) ` +
      `rotate(${pp.r - bank + px * 2}deg) scale(${pp.s})`;
    trail.style.transform = `translateY(-50%) scaleX(${(0.25 + Math.min(Math.abs(velocity) * 2.5, 0.9)).toFixed(3)})`;
    trail.style.opacity = (0.35 + Math.min(Math.abs(velocity) * 2, 0.5)).toFixed(3);

    // Perspective projection of each puff toward a camera moving along the flight
    for (const puff of puffs) {
      const dz = puff.at - p;
      const depth = dz * 4 + 0.2;
      if (dz < -0.05 || dz > 0.38) {
        if (puff.visible) {
          puff.el.style.opacity = '0';
          puff.visible = false;
        }
        continue;
      }
      puff.visible = true;
      const scale = clamp(1 / depth, 0.15, 6);
      const fadeIn = smooth(range(dz, 0.38, 0.26));
      const fadeOut = smooth(range(depth, 0.08, 0.5));
      const x = (puff.x * W * 0.42) / depth + px * -30 * scale;
      const y = (puff.y * H * 0.42) / depth + py * -20 * scale;
      puff.el.style.opacity = (fadeIn * fadeOut * (depth < 0.9 ? 0.7 : 0.9)).toFixed(3);
      puff.el.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), 0) scale(${(scale * puff.flip).toFixed(3)}, ${scale.toFixed(3)})`;

      const front = depth < 0.9;
      if (front !== puff.front) {
        (front ? frontLayer : backLayer).append(puff.el);
        puff.front = front;
      }
    }

    for (const c of captions) {
      const fade = Math.min(smooth(range(p, c.a, c.a + 0.06)), 1 - smooth(range(p, c.b - 0.06, c.b)));
      c.el.style.opacity = fade.toFixed(3);
      c.el.style.transform = `translate3d(0, ${(1 - fade) * (p < (c.a + c.b) / 2 ? 24 : -24)}px, 0)`;
      c.el.classList.toggle('is-active', fade > 0.5);
    }

    const altitude = Math.round((smooth(range(p, 0, 0.85)) * 35000) / 100) * 100;
    if (altitude !== lastAlt) {
      alt.textContent = altitude.toLocaleString('en-US');
      lastAlt = altitude;
    }
    routePlane.style.left = `${(p * 100).toFixed(2)}%`;
    header?.classList.toggle('is-glass', p > 0.08);
    cue.style.opacity = (1 - range(p, 0, 0.04)).toFixed(3);
    cue.style.pointerEvents = p > 0.04 ? 'none' : '';
    whiteout.style.opacity = smooth(range(p, 0.86, 0.99)).toFixed(3);

    raf = running ? requestAnimationFrame(render) : 0;
  };

  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(render);
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) {
      measure();
      start();
    } else {
      stop();
    }
  }).observe(section);
  window.addEventListener('scroll', measure, { passive: true });
  window.addEventListener('resize', measure);

  if (finePointer) {
    section.addEventListener('pointermove', (e) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
    });
    section.addEventListener('pointerleave', () => {
      tx = 0;
      ty = 0;
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (inView) start();
  });

  measure();
  current = target;
  prev = target;
}
