/**
 * Section choreography below the flight: scroll-linked progress (--p),
 * split-text headings, word-by-word fill, class-based reveals,
 * and the split-flap departures board.
 */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

const BOARD_COLS = 18;
const BOARD_ROWS = 4;
const TRIPS = [
  ['BOARDROOM', 'TOKYO'],
  ['BACKPACK', 'BALI'],
  ['RED-EYE', 'LONDON'],
  ['ROAD TRIP', 'BIG SUR'],
  ['BEACH DAY', 'TULUM'],
  ['WEEKENDER', 'LISBON'],
  ['LAYOVER', 'DOHA'],
  ['FIELD TRIP', 'NAIROBI'],
];
const FLAP_CHARS = 'ABCDEFGHIJKLMNOPRSTUWY-';

const tripLine = ([trip, dest]) => (trip.padEnd(11) + dest).padEnd(BOARD_COLS).slice(0, BOARD_COLS);

function splitWords(el) {
  const text = el.textContent.trim().replace(/\s+/g, ' ');
  el.setAttribute('aria-label', text);
  el.textContent = '';
  text.split(' ').forEach((word, i, all) => {
    const outer = document.createElement('span');
    outer.className = 'w';
    outer.setAttribute('aria-hidden', 'true');
    outer.style.setProperty('--i', i);
    const inner = document.createElement('span');
    inner.textContent = word;
    outer.append(inner);
    el.append(outer, i < all.length - 1 ? ' ' : '');
  });
  el.style.setProperty('--n', text.split(' ').length);
}

function initProgress(reduce) {
  const els = [...document.querySelectorAll('[data-progress]')];
  if (!els.length || reduce) return;

  const active = new Set();
  let vh = innerHeight;
  let queued = false;

  const update = () => {
    queued = false;
    active.forEach((el) => {
      const end = Number(el.dataset.progress) || 0.3;
      const start = Number(el.dataset.start) || 1;
      const top = el.getBoundingClientRect().top;
      const p = clamp((vh * start - top) / (vh * (start - end)));
      const rounded = Math.round(p * 1000) / 1000;
      if (el._p !== rounded) {
        el._p = rounded;
        el.style.setProperty('--p', rounded);
      }
    });
  };
  const queue = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => (e.isIntersecting ? active.add(e.target) : active.delete(e.target)));
      queue();
    },
    { rootMargin: '15% 0px 15% 0px' }
  );
  els.forEach((el) => {
    el.style.setProperty('--p', 0);
    io.observe(el);
  });

  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', () => {
    vh = innerHeight;
    queue();
  });
}

function initReveals(reduce) {
  const els = document.querySelectorAll('[data-reveal], [data-split]');
  if (reduce) {
    els.forEach((el) => el.classList.add('is-revealed'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        entry.target.dispatchEvent(new CustomEvent('reveal'));
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.2, rootMargin: '0px 0px -10% 0px' }
  );
  els.forEach((el) => io.observe(el));
}

function initBoard(reduce) {
  const board = document.querySelector('[data-board]');
  if (!board) return;

  const rows = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    const row = document.createElement('div');
    row.className = 'board__row';
    const cells = [];
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = document.createElement('span');
      cell.className = 'board__cell';
      cell.textContent = ' ';
      row.append(cell);
      cells.push(cell);
    }
    const status = document.createElement('span');
    status.className = 'board__status';
    status.textContent = r === 0 ? 'Boarding' : 'On time';
    row.append(status);
    board.append(row);
    rows.push(cells);
  }

  let offset = 0;
  const lineFor = (r) => tripLine(TRIPS[(offset + r) % TRIPS.length]);

  if (reduce) {
    rows.forEach((cells, r) => [...lineFor(r)].forEach((ch, c) => (cells[c].textContent = ch)));
    return;
  }

  const flapKeys = [
    { transform: 'rotateX(0deg)', filter: 'brightness(1)' },
    { transform: 'rotateX(-80deg)', filter: 'brightness(0.6)' },
    { transform: 'rotateX(0deg)', filter: 'brightness(1)' },
  ];

  const flip = (cell, target, delay) => {
    if (cell.textContent === target) return;
    const steps = target === ' ' ? 2 : 3 + Math.floor(Math.random() * 5);
    let n = 0;
    const tick = () => {
      n++;
      cell.textContent = n >= steps ? target : FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)];
      cell.animate(flapKeys, { duration: 70, easing: 'ease-in-out' });
      if (n < steps) setTimeout(tick, 70);
    };
    setTimeout(tick, delay);
  };

  const paint = () => {
    rows.forEach((cells, r) => {
      [...lineFor(r)].forEach((ch, c) => flip(cells[c], ch, r * 140 + c * 28));
    });
  };

  let timer = 0;
  let visible = false;
  const start = () => {
    if (timer || !visible || document.hidden) return;
    paint();
    timer = setInterval(() => {
      offset = (offset + 1) % TRIPS.length;
      paint();
    }, 4200);
  };
  const stop = () => {
    clearInterval(timer);
    timer = 0;
  };

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible ? start() : stop();
  }, { threshold: 0.3 }).observe(board);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
}

export function initScenes() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-split], [data-words]').forEach(splitWords);
  initProgress(reduce);
  initReveals(reduce);
  initBoard(reduce);
}
