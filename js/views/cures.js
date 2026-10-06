/* Fiche : suivi des cures (compléments, traitements…). Seules les cures en cours sont affichées, les autres restent dans l'historique. */
import { $, esc } from '../core/utils.js';
import { formatKey, todayKey, fromKey } from '../core/dates.js';
import * as store from '../core/store.js';
import { CURE_KINDS, numericId } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { icon } from '../ui/icons.js';

const KIND_EMOJI = { 'Complément alimentaire': '🌾', 'Traitement vétérinaire': '💊', Vermifuge: '🪱', Phytothérapie: '🌿', 'Soin local': '🩹', Autre: '🧴' };
const day = k => formatKey(k, { day: 'numeric', month: 'short', year: 'numeric' });
const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 864e5);

// Une cure « terminée » à la main passe dans l'historique, même si sa date de fin est aujourd'hui.
export const isCurrent = (c, today = todayKey()) => !c.done && c.start <= today && (!c.end || c.end >= today);
const isUpcoming = (c, today = todayKey()) => !c.done && c.start > today;
const isPast = (c, today = todayKey()) => c.done || (c.end && c.end < today);

function period(c) {
  if (!c.end) return `Depuis le ${day(c.start)} · sans date de fin`;
  return `${day(c.start)} → ${day(c.end)} · ${daysBetween(c.start, c.end) + 1} j`;
}

function currentCard(c, today) {
  const upcoming = isUpcoming(c, today);
  let progress = '';
  let status;
  if (upcoming) status = `Commence ${daysBetween(today, c.start) === 1 ? 'demain' : `dans ${daysBetween(today, c.start)} jours`}`;
  else if (c.end) {
    const total = daysBetween(c.start, c.end) + 1;
    const done = daysBetween(c.start, today) + 1;
    const left = total - done;
    status = `Jour ${done} sur ${total} · ${left ? `${left} jour${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}` : 'dernier jour'}`;
    progress = `<div class="cure__bar" aria-hidden="true"><span style="width:${Math.round((done / total) * 100)}%"></span></div>`;
  } else status = `Jour ${daysBetween(c.start, today) + 1}`;
  return `<article class="cure card" data-cure="${esc(String(c.id))}">
    <button type="button" class="cure__main" data-cure-edit>
      <span class="row__icon" aria-hidden="true">${KIND_EMOJI[c.kind] || '🧴'}</span>
      <span class="row__body"><span class="row__title">${esc(c.name)}</span><span class="row__sub">${esc([c.kind, c.dose].filter(Boolean).join(' · '))}</span></span>
      ${upcoming ? '<span class="badge">À venir</span>' : ''}
    </button>
    <p class="cure__status">${esc(status)}</p>
    ${progress}
    <p class="cure__period">${esc(period(c))}</p>
    ${c.note ? `<p class="cure__note">${esc(c.note)}</p>` : ''}
    ${upcoming ? '' : `<button type="button" class="btn btn--soft btn--sm cure__stop" data-cure-stop>${icon('check', 16)}<span>Terminer aujourd’hui</span></button>`}
  </article>`;
}

export function renderCures() {
  const cures = store.field('cures');
  const today = todayKey();
  const current = cures.filter(c => isCurrent(c, today) || isUpcoming(c, today)).sort((a, b) => a.start.localeCompare(b.start));
  const past = cures.filter(c => isPast(c, today)).sort((a, b) => (b.end || b.start).localeCompare(a.end || a.start));
  $('#curesList').innerHTML = current.length
    ? current.map(c => currentCard(c, today)).join('')
    : `<div class="empty-state"><p>Aucune cure en cours. Utilisez 🥕 pour en ajouter une.</p></div>`;
  const hist = $('#curesHistory');
  hist.hidden = !past.length;
  $('#curesHistoryCount').textContent = past.length;
  $('#curesHistoryList').innerHTML = past
    .map(
      c => `<button type="button" class="row" data-cure="${esc(String(c.id))}" data-cure-edit>
        <span class="row__icon is-muted" aria-hidden="true">${KIND_EMOJI[c.kind] || '🧴'}</span>
        <span class="row__body"><span class="row__title">${esc(c.name)}</span><span class="row__sub">${esc(period(c))}${c.dose ? ` · ${esc(c.dose)}` : ''}</span></span>
        ${icon('chevronRight', 16)}
      </button>`
    )
    .join('');
}

/* ---------- Saisie ---------- */
export function openCure(id = null) {
  if (!store.activeId()) return toastError('Ajoutez d’abord un cheval.');
  const f = $('#cureForm');
  f.reset();
  clearErrors(f);
  const c = id !== null ? store.field('cures').find(x => String(x.id) === String(id)) : null;
  f.elements.editId.value = c ? c.id : '';
  f.elements.name.value = c?.name || '';
  f.elements.kind.value = c?.kind || CURE_KINDS[0];
  f.elements.start.value = c?.start || todayKey();
  f.elements.end.value = c?.end || '';
  f.elements.dose.value = c?.dose || '';
  f.elements.note.value = c?.note || '';
  $('#cureTitle').textContent = c ? 'Modifier la cure' : 'Nouvelle cure';
  $('#cureDelete').hidden = !c;
  openSheet('cureSheet', { focus: false });
}

function onSubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const v = formValues(f);
  const { valid, errors } = validate(v, {
    name: [rules.required('Le produit'), rules.maxLength(120)],
    start: [rules.date({ required: true })],
    end: [rules.date(), x => (x && v.start && x < v.start ? 'La fin est avant le début.' : null)],
    dose: [rules.maxLength(200)],
    note: [rules.maxLength(1000)]
  });
  if (!valid) return showErrors(f, errors);
  const cures = store.field('cures');
  const cure = { name: v.name.trim(), kind: v.kind, start: v.start, end: v.end, dose: v.dose.trim(), note: v.note };
  if (v.editId) {
    const i = cures.findIndex(c => String(c.id) === String(v.editId));
    // Une cure terminée reste dans l'historique, sauf si sa fin est repoussée après aujourd'hui.
    if (i >= 0) cures[i] = { ...cures[i], ...cure, done: Boolean(cures[i].done && cure.end && cure.end <= todayKey()) };
  } else cures.push({ id: numericId(cures), ...cure });
  store.setField('cures', cures);
  closeSheet('cureSheet');
  toast(v.editId ? 'Cure mise à jour' : 'Cure ajoutée');
}

async function remove() {
  const id = $('#cureForm').elements.editId.value;
  if (!id || !(await confirmDialog({ title: 'Supprimer cette cure ?', message: 'Elle disparaîtra aussi de l’historique.', confirmLabel: 'Supprimer', danger: true }))) return;
  store.setField('cures', store.field('cures').filter(c => String(c.id) !== id));
  closeSheet('cureSheet');
  toast('Cure supprimée');
}

function stop(id) {
  const today = todayKey();
  store.setField('cures', store.field('cures').map(c => (String(c.id) === id ? { ...c, end: c.start <= today ? today : c.start, done: true } : c)));
  toast('Cure terminée, rangée dans l’historique');
}

export function initCures() {
  $('#cureKind').innerHTML = CURE_KINDS.map(k => `<option value="${esc(k)}">${KIND_EMOJI[k]} ${esc(k)}</option>`).join('');
  $('#cureForm').addEventListener('submit', onSubmit);
  $('#cureDelete').addEventListener('click', remove);
  document.addEventListener('click', e => {
    const host = e.target.closest('[data-cure]');
    if (!host) return;
    if (e.target.closest('[data-cure-stop]')) return stop(host.dataset.cure);
    if (e.target.closest('[data-cure-edit]')) openCure(host.dataset.cure);
  });
}
