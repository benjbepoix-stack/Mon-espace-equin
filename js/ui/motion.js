/*
 * Mouvement : préférences d'accessibilité, entrée des vues, compteurs animés,
 * glissements de contenu. Tout passe par ici pour respecter « Réduire les animations ».
 */
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => reduceQuery.matches;

// Mêmes courbes que --ease-out / --ease-drawer (tokens.css), pour l'API Web Animations.
export const EASE_OUT = 'cubic-bezier(.23, 1, .32, 1)';
export const EASE_DRAWER = 'cubic-bezier(.32, .72, 0, 1)';

const ENTER_MS = 1000;
let entering = null;
let enterTimer = null;

/**
 * Marque une vue comme « en train d'entrer » le temps de ses animations d'arrivée
 * (glissement selon le sens de navigation, barres et graphiques qui se remplissent).
 * @param {HTMLElement} view
 * @param {{dir?: -1|0|1, cascade?: boolean}} options  cascade : blocs en léger décalé (1re ouverture)
 */
export function playViewEnter(view, { dir = 0, cascade = false } = {}) {
  entering?.classList.remove('is-entering', 'is-cascade');
  if (reducedMotion()) dir = 0;
  view.style.setProperty('--view-dir', dir);
  void view.offsetWidth; // relance l'animation CSS si la vue était déjà marquée
  view.classList.add('is-entering');
  view.classList.toggle('is-cascade', cascade);
  entering = view;
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => view.classList.remove('is-entering', 'is-cascade'), ENTER_MS);
}

/** Vrai si l'élément appartient à une vue qui vient d'apparaître. */
export const isEntering = el => !reducedMotion() && Boolean(el?.closest('.view.is-entering'));

/* ---------- Interpolation image par image ---------- */
const running = new WeakMap();
const easeOutCubic = t => 1 - (1 - t) ** 3;

/**
 * Appelle draw(k) avec k de 0 à 1 (courbe ease-out) pendant `ms`.
 * Une nouvelle interpolation sur le même élément remplace la précédente.
 */
export function tween(el, ms, draw) {
  cancelAnimationFrame(running.get(el));
  const start = performance.now();
  const frame = now => {
    const t = Math.min(1, (now - start) / ms);
    draw(easeOutCubic(t));
    if (t < 1 && el.isConnected) running.set(el, requestAnimationFrame(frame));
    else running.delete(el);
  };
  draw(0);
  running.set(el, requestAnimationFrame(frame));
}

/* ---------- Compteurs ---------- */
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Fait défiler de 0 à leur valeur les nombres marqués [data-count-up] (« 1 234 € », « 45 % », « 12 »). */
export function countUp(root) {
  if (reducedMotion()) return;
  root.querySelectorAll('[data-count-up]').forEach(el => {
    const text = el.textContent;
    const m = text.match(/\d(?:[\s  ]?\d)*/);
    if (!m || /\d,\d/.test(text)) return; // décimales : on affiche directement
    const target = Number(m[0].replace(/\D/g, ''));
    if (target < 2) return;
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    tween(el, 700, k => (el.textContent = k < 1 ? before + integer.format(Math.round(target * k)) + after : text));
  });
}

/**
 * Nouveau contenu qui arrive du côté où l'on navigue (mois suivant : depuis la droite).
 * dir = 0 : simple fondu (contenu remplacé sur place).
 */
export function slideIn(el, dir = 0) {
  if (!el?.animate) return;
  const x = reducedMotion() ? 0 : dir * 24;
  el.animate([{ opacity: 0, transform: `translateX(${x}px)` }, { opacity: 1, transform: 'none' }], { duration: dir ? 240 : 180, easing: EASE_OUT });
}
