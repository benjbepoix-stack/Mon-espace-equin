/*
 * Système de modales unifié :
 * - feuille glissante (bottom sheet) sur mobile, boîte centrée sur ordinateur ;
 * - pile de modales (une confirmation peut s'ouvrir au-dessus d'une autre) ;
 * - fermeture par Échap, clic sur le fond ou bouton [data-close] ;
 * - blocage du défilement et restitution du focus ;
 * - sur mobile, la feuille se ferme aussi en la tirant vers le bas.
 * Remplace aussi confirm()/prompt() natifs par des dialogues élégants.
 */
import { esc } from '../core/utils.js';
import { icon } from './icons.js';
import { reducedMotion } from './motion.js';

const stack = [];
const ANIMATION_MS = 440; // durée de sortie la plus longue (--dur-sheet)

function syncLock() {
  document.documentElement.classList.toggle('is-locked', stack.length > 0);
}

export function openSheet(target, { onClose, focus = true } = {}) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;
  if (stack.some(s => s.el === el)) return;
  stack.push({ el, onClose, returnFocus: document.activeElement });
  el.hidden = false;
  void el.offsetWidth; // force le reflow pour déclencher la transition
  el.classList.add('is-open');
  syncLock();
  if (focus) {
    const first = el.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button:not([data-close])');
    // Pas d'autofocus sur mobile tactile : le clavier iOS masquerait la feuille.
    const touch = window.matchMedia('(pointer: coarse)').matches;
    setTimeout(() => (touch ? el.querySelector('.sheet')?.focus({ preventScroll: true }) : first?.focus({ preventScroll: true })), 60);
  }
}

export function closeSheet(target) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  const index = stack.findIndex(s => s.el === el);
  if (index === -1) return;
  const [entry] = stack.splice(index, 1);
  el.classList.remove('is-open');
  setTimeout(() => {
    if (!el.classList.contains('is-open')) el.hidden = true;
  }, ANIMATION_MS);
  syncLock();
  entry.returnFocus?.focus?.({ preventScroll: true });
  entry.onClose?.();
}

export const isOpen = id => stack.some(s => s.el.id === id);
export const closeTop = () => stack.length && closeSheet(stack[stack.length - 1].el);

/* ---------- Glisser pour fermer (feuille mobile) ---------- */
const DISMISS_DISTANCE = 0.3; // part de la hauteur de la feuille
const DISMISS_VELOCITY = 0.5; // px/ms : un geste vif suffit, même court

function initDragToDismiss() {
  const mobile = window.matchMedia('(max-width: 719px)');
  let drag = null;

  document.addEventListener('pointerdown', e => {
    if (!mobile.matches || reducedMotion() || e.button !== 0) return;
    const handle = e.target.closest('.sheet__grabber, .sheet__head');
    if (!handle || e.target.closest('button, a, input, select, textarea')) return;
    const sheet = handle.closest('.sheet');
    const backdrop = sheet?.closest('.sheet-backdrop');
    if (!backdrop?.classList.contains('is-open')) return;
    drag = { sheet, backdrop, id: e.pointerId, y0: e.clientY, dy: 0, last: [e.clientY, e.timeStamp], v: 0 };
    handle.setPointerCapture(e.pointerId);
    backdrop.classList.add('is-dragging');
  });

  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const raw = e.clientY - drag.y0;
    // Vers le haut : résistance (la feuille ne peut pas monter plus haut).
    drag.dy = raw > 0 ? raw : -Math.sqrt(-raw) * 2;
    const dt = e.timeStamp - drag.last[1];
    if (dt > 0) drag.v = (e.clientY - drag.last[0]) / dt;
    drag.last = [e.clientY, e.timeStamp];
    drag.sheet.style.transform = `translateY(${drag.dy}px)`;
    drag.backdrop.style.opacity = String(1 - Math.max(0, drag.dy) / drag.sheet.offsetHeight / 1.5);
  });

  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const { sheet, backdrop, dy, v } = drag;
    drag = null;
    backdrop.classList.remove('is-dragging');
    // On rend la main aux transitions CSS : elles repartent de la position actuelle.
    sheet.style.transform = '';
    backdrop.style.opacity = '';
    if (dy > sheet.offsetHeight * DISMISS_DISTANCE || (dy > 10 && v > DISMISS_VELOCITY)) closeSheet(backdrop);
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
}

export function initDialogs() {
  initDragToDismiss();
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && stack.length) {
      e.preventDefault();
      closeTop();
    }
  });
  document.addEventListener('click', e => {
    const closer = e.target.closest('[data-close]');
    if (closer) {
      closeSheet(closer.closest('.sheet-backdrop'));
      return;
    }
    if (e.target.classList?.contains('sheet-backdrop')) closeSheet(e.target);
  });
}

/* ---------- Dialogues dynamiques ---------- */
function buildDialog(inner) {
  const el = document.createElement('div');
  el.className = 'sheet-backdrop sheet-backdrop--dialog';
  el.hidden = true;
  el.innerHTML = `<div class="sheet sheet--dialog" role="alertdialog" aria-modal="true" tabindex="-1">${inner}</div>`;
  document.body.appendChild(el);
  return el;
}

const dispose = el => setTimeout(() => el.remove(), ANIMATION_MS + 50);

/**
 * Confirmation asynchrone.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message = '', confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false }) {
  return new Promise(resolve => {
    let result = false;
    const el = buildDialog(`
      <div class="dialog__icon ${danger ? 'dialog__icon--danger' : ''}">${icon(danger ? 'trash' : 'info', 22)}</div>
      <h2 class="dialog__title">${esc(title)}</h2>
      ${message ? `<p class="dialog__message">${esc(message)}</p>` : ''}
      <div class="dialog__actions">
        <button type="button" class="btn btn--ghost" data-close>${esc(cancelLabel)}</button>
        <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm>${esc(confirmLabel)}</button>
      </div>`);
    el.querySelector('[data-confirm]').addEventListener('click', () => {
      result = true;
      closeSheet(el);
    });
    openSheet(el, {
      focus: false,
      onClose: () => {
        dispose(el);
        resolve(result);
      }
    });
    setTimeout(() => el.querySelector('[data-confirm]').focus(), 60);
  });
}

/**
 * Saisie de texte asynchrone (remplace prompt()).
 * @returns {Promise<string|null>}
 */
export function promptDialog({ title, label = '', value = '', placeholder = '', maxLength = 80, confirmLabel = 'Enregistrer' }) {
  return new Promise(resolve => {
    let result = null;
    const el = buildDialog(`
      <form class="dialog__form" novalidate>
        <h2 class="dialog__title">${esc(title)}</h2>
        <div class="field">
          ${label ? `<label class="field__label" for="prompt-input">${esc(label)}</label>` : ''}
          <input id="prompt-input" class="input" name="value" maxlength="${maxLength}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" required>
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn btn--ghost" data-close>Annuler</button>
          <button type="submit" class="btn btn--primary">${esc(confirmLabel)}</button>
        </div>
      </form>`);
    const form = el.querySelector('form');
    const input = form.querySelector('input');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) {
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      result = v;
      closeSheet(el);
    });
    openSheet(el, {
      focus: false,
      onClose: () => {
        dispose(el);
        resolve(result);
      }
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 80);
  });
}
