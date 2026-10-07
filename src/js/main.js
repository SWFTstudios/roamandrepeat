/**
 * Roam and Repeat — vanilla interactions
 * Flight scene, reveal overlays, gallery lightbox, mobile nav
 */
import { initFlight } from './flight.js';
import { initScenes } from './scenes.js';

(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Mobile nav ---------- */
  const nav = document.querySelector('[data-nav]');
  const toggle = document.querySelector('[data-nav-toggle]');
  const menu = document.querySelector('[data-nav-menu]');

  if (toggle && menu && nav) {
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('nav-open', open);
    };

    toggle.addEventListener('click', () => {
      setOpen(!nav.classList.contains('is-open'));
    });

    menu.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => setOpen(false));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  /* ---------- Smooth scroll for hash links ---------- */
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ---------- Flight scene + solid header once past it ---------- */
  initFlight();

  const flight = document.querySelector('[data-flight]');
  if (flight && nav) {
    new IntersectionObserver(([entry]) => nav.classList.toggle('is-solid', !entry.isIntersecting)).observe(
      flight
    );
  }

  /* ---------- Section scroll choreography ---------- */
  initScenes();

  /* ---------- Gallery lightbox ---------- */
  const dialog = document.querySelector('[data-lightbox]');
  const galleryItems = [...document.querySelectorAll('[data-gallery-item]')];

  if (dialog && galleryItems.length) {
    const img = dialog.querySelector('[data-lightbox-img]');
    const caption = dialog.querySelector('[data-lightbox-caption]');
    const btnClose = dialog.querySelector('[data-lightbox-close]');
    const btnPrev = dialog.querySelector('[data-lightbox-prev]');
    const btnNext = dialog.querySelector('[data-lightbox-next]');
    let index = 0;
    let touchX = null;

    const sourcesFor = (item) => {
      const full = item.dataset.full;
      const alt = item.querySelector('img')?.alt || '';
      return { full, alt };
    };

    const show = (i) => {
      index = (i + galleryItems.length) % galleryItems.length;
      const { full, alt } = sourcesFor(galleryItems[index]);
      if (img) {
        img.src = full;
        img.alt = alt;
      }
      if (caption) caption.textContent = alt;
    };

    const open = (i) => {
      show(i);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    };

    const close = () => {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    };

    galleryItems.forEach((item, i) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        open(i);
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(i);
        }
      });
    });

    btnClose?.addEventListener('click', close);
    btnPrev?.addEventListener('click', () => show(index - 1));
    btnNext?.addEventListener('click', () => show(index + 1));

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });

    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    });

    dialog.addEventListener(
      'touchstart',
      (e) => {
        touchX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );
    dialog.addEventListener(
      'touchend',
      (e) => {
        if (touchX == null) return;
        const dx = e.changedTouches[0].screenX - touchX;
        if (Math.abs(dx) > 50) show(dx > 0 ? index - 1 : index + 1);
        touchX = null;
      },
      { passive: true }
    );
  }
})();
