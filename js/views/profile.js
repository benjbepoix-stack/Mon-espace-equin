/* Fiche : informations du cheval, cures, notes, pense-bête, gestion des chevaux, compte. */
import { $, esc, debounce } from '../core/utils.js';
import { formatKey, todayKey } from '../core/dates.js';
import * as store from '../core/store.js';
import { BREEDS, horseKey, makeHorseId, numericId, DEFAULT_ACTIVITIES } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { ageFromBirth, horseName } from './common.js';
import { renderCures } from './cures.js';

/* ---------- Rendu ---------- */
function renderCard() {
  const p = store.field('profile');
  const host = $('#profileCard');
  if (!store.activeId()) {
    host.innerHTML = `<div class="empty-state"><p>Aucun cheval suivi pour le moment.</p><button type="button" class="btn btn--primary btn--sm" data-open="horse"><span>🥕</span><span>Ajouter un cheval</span></button></div>`;
    return;
  }
  const age = ageFromBirth(p.birth);
  const info = [
    ['Naissance', p.birth ? formatKey(p.birth, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'],
    ['Âge', age || '—'],
    ['Discipline', p.discipline || '—'],
    ['Race', p.breed || '—'],
    ['Écurie', p.stable || '—']
  ];
  host.innerHTML = `<header class="profile__head"><div class="profile__avatar" aria-hidden="true">🐴</div><div><h2 class="profile__name">${esc(horseName())}</h2><p class="card__sub">${esc([p.discipline, age].filter(Boolean).join(' · ') || 'Fiche à compléter')}</p></div>
      <button type="button" class="icon-btn" data-horse-edit aria-label="Modifier la fiche">${icon('edit', 18)}</button></header>
    <dl class="info-grid">${info.map(([k, v]) => `<div class="info"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

function renderNotes() {
  const notes = store.field('horseNotes');
  $('#notesSub').textContent = `Observations datées sur ${horseName()}`;
  $('#notesList').innerHTML = notes.length
    ? notes
        .map(
          n => `<article class="note card" data-note="${esc(n.id)}"><header class="note__head"><span class="note__date">${esc(formatKey(n.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</span><button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-note-delete aria-label="Supprimer la note">${icon('trash', 16)}</button></header><p class="note__text">${esc(n.text)}</p></article>`
        )
        .join('')
    : `<div class="empty-state"><p>Aucune observation. Utilisez 🥕 pour ajouter une note datée.</p></div>`;
}

function horseRows(target) {
  const list = store.horses();
  if (!list.length) return '<div class="empty-state"><p>Aucun cheval.</p></div>';
  return list
    .map(h => {
      const active = h.id === store.activeId();
      return `<button type="button" class="row horse-row ${active ? 'is-active' : ''}" data-horse-pick="${esc(h.id)}" data-target="${target}" ${active ? 'aria-current="true"' : ''}>
        <span class="row__icon" aria-hidden="true">🐴</span>
        <span class="row__body"><span class="row__title">${esc(h.name)}</span><span class="row__sub">${esc([h.discipline, ageFromBirth(h.birth), h.stable].filter(Boolean).join(' · ') || '—')}</span></span>
        ${active ? `<span class="badge">Sélectionné</span>` : icon('chevronRight', 16)}
      </button>`;
    })
    .join('');
}

export function renderProfile() {
  renderCard();
  const note = $('#profileNote');
  const p = store.field('profile');
  note.disabled = !store.activeId();
  if (document.activeElement !== note && note.value !== p.note) note.value = p.note || '';
  renderCures();
  renderNotes();
  $('#horseList').innerHTML = horseRows('list');
  if (!$('#switchSheet').hidden) $('#switchList').innerHTML = horseRows('switch');
}

export function openSwitcher() {
  $('#switchList').innerHTML = horseRows('switch');
  openSheet('switchSheet', { focus: false });
}

/* ---------- Chevaux ---------- */
export function openHorse(edit = false) {
  const f = $('#horseForm');
  f.reset();
  clearErrors(f);
  const p = edit ? store.field('profile') : null;
  f.elements.editId.value = edit ? store.activeId() : '';
  if (p) ['name', 'birth', 'discipline', 'breed', 'stable'].forEach(k => (f.elements[k].value = p[k] || ''));
  $('#horseTitle').textContent = edit ? `Modifier la fiche · ${horseName()}` : 'Nouveau cheval';
  $('#horseDelete').hidden = !edit;
  closeSheet('switchSheet');
  openSheet('horseSheet', { focus: false });
}

const horseSchema = {
  name: [rules.required('Le nom'), rules.maxLength(60)],
  birth: [rules.date(), v => (v && v > todayKey() ? 'La date de naissance est dans le futur.' : null)],
  discipline: [rules.maxLength(60)],
  breed: [rules.maxLength(60)],
  stable: [rules.maxLength(80)]
};

function onHorseSubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const v = formValues(f);
  const { valid, errors } = validate(v, horseSchema);
  if (!valid) return showErrors(f, errors);
  const info = { name: v.name, birth: v.birth, discipline: v.discipline, breed: v.breed, stable: v.stable };
  const list = store.horses().map(h => ({ ...h }));
  if (v.editId) {
    const profile = { ...store.field('profile', v.editId), ...info };
    const i = list.findIndex(h => h.id === v.editId);
    if (i >= 0) list[i] = { id: v.editId, ...info };
    store.setKeys({ horses: list, [horseKey(v.editId, 'profile')]: profile });
    toast('Fiche mise à jour');
  } else {
    const id = makeHorseId();
    list.push({ id, ...info });
    store.setKeys({
      horses: list,
      activeHorseId: id,
      [horseKey(id, 'profile')]: { ...info, note: '' },
      [horseKey(id, 'activities')]: [...DEFAULT_ACTIVITIES]
    });
    toast(`${v.name} ajouté 🐴`);
  }
  closeSheet('horseSheet');
}

async function removeHorse() {
  const id = store.activeId();
  const name = horseName();
  if (!id) return;
  if (store.horses().length <= 1) return toastError('Impossible de retirer le dernier cheval suivi.');
  const ok = await confirmDialog({
    title: `Retirer ${name} du suivi ?`,
    message: 'Toutes ses données (rendez-vous, dépenses, planning, notes) seront supprimées sur tous vos appareils. Cette action est irréversible.',
    confirmLabel: 'Retirer définitivement',
    danger: true
  });
  if (!ok) return;
  const list = store.horses().filter(h => h.id !== id);
  store.setKeys({ ...store.removeHorseData(id), horses: list, activeHorseId: list[0].id });
  closeSheet('horseSheet');
  toast(`${name} retiré`);
}

export function pickHorse(id) {
  if (!id || id === store.activeId()) return closeSheet('switchSheet');
  store.setKeys({ activeHorseId: id });
  closeSheet('switchSheet');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast(`${horseName()} sélectionné`);
}

/* ---------- Notes ---------- */
export function openNote() {
  if (!store.activeId()) return toastError('Ajoutez d’abord un cheval.');
  const f = $('#noteForm');
  f.reset();
  clearErrors(f);
  f.elements.date.value = todayKey();
  openSheet('noteSheet', { focus: false });
}

function onNoteSubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const v = formValues(f);
  const { valid, errors } = validate(v, { date: [rules.date({ required: true })], text: [rules.required('L’observation'), rules.maxLength(5000)] });
  if (!valid) return showErrors(f, errors);
  const notes = store.field('horseNotes');
  notes.push({ id: numericId(notes), date: v.date, text: v.text });
  store.setField('horseNotes', notes);
  closeSheet('noteSheet');
  toast('Note ajoutée');
}

export function initProfile() {
  $('#breedChoices').innerHTML = BREEDS.map(b => `<option value="${esc(b)}">`).join('');
  $('#horseForm').addEventListener('submit', onHorseSubmit);
  $('#horseDelete').addEventListener('click', removeHorse);
  $('#noteForm').addEventListener('submit', onNoteSubmit);
  const note = $('#profileNote');
  const state = $('#profileNoteState');
  let noteHorse = null; // cheval concerné par la saisie en cours (même si on change de cheval entre-temps)
  const save = debounce(() => {
    if (!noteHorse) return;
    const p = store.field('profile', noteHorse);
    p.note = note.value.slice(0, 20000);
    store.setField('profile', p, noteHorse);
    state.textContent = 'Enregistré';
    state.classList.remove('is-saving');
  }, 600);
  note.addEventListener('input', () => {
    noteHorse = store.activeId();
    state.textContent = 'Enregistrement…';
    state.classList.add('is-saving');
    save();
  });
  document.addEventListener('click', async e => {
    if (e.target.closest('[data-horse-edit]')) return openHorse(true);
    const pick = e.target.closest('[data-horse-pick]');
    if (pick) return pickHorse(pick.dataset.horsePick);
    const del = e.target.closest('[data-note-delete]');
    if (del) {
      const id = del.closest('[data-note]').dataset.note;
      if (!(await confirmDialog({ title: 'Supprimer cette note ?', confirmLabel: 'Supprimer', danger: true }))) return;
      store.setField('horseNotes', store.field('horseNotes').filter(n => String(n.id) !== id));
      toast('Note supprimée');
    }
  });
}
