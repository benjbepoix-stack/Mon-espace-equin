/* Planning : une activité par jour, répartition mensuelle, gestion des activités. */
import { $, $$, esc } from '../core/utils.js';
import { addDays, dateKey, mondayOf, todayKey, formatDate } from '../core/dates.js';
import * as store from '../core/store.js';
import { REST } from '../core/schema.js';
import { openSheet, confirmDialog, promptDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { slideIn } from '../ui/motion.js';
import { renderDonut, PALETTE } from '../ui/charts.js';
import { activityIcon } from '../ui/equine-icons.js';
import { capitalize, horseName } from './common.js';
import { renderCalendar, initCalendar, setPlanType, planNoteField, keepNoteInput, autosize, initNoteFields } from './calendar.js';

let weekStart = mondayOf(new Date());
let monthOffset = 0;
let mode = 'month'; // month (calendrier) | week

/* ---------- Semaine ---------- */
function renderWeek() {
  const plans = store.field('plans');
  const activities = store.field('activities');
  const today = todayKey();
  const current = mondayOf(new Date()).getTime() === weekStart.getTime();
  const end = addDays(weekStart, 6);
  $('#weekTitle').textContent = current ? 'Cette semaine' : `Semaine du ${formatDate(weekStart, { day: 'numeric', month: 'long' })}`;
  $('#weekSub').textContent = `${formatDate(weekStart, { day: 'numeric', month: 'short' })} → ${formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })} · ${horseName()}`;
  // Clé de date LOCALE (l'ancienne version utilisait l'heure UTC).
  const host = $('#weekRows');
  keepNoteInput(host, () => (host.innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const k = dateKey(d);
    const value = plans[k]?.type || '';
    const options = [`<option value=""${value ? '' : ' selected'}>— Non renseigné —</option>`, ...activities.map(a => `<option${a === value ? ' selected' : ''}>${esc(a)}</option>`)];
    if (value && !activities.includes(value)) options.push(`<option selected>${esc(value)}</option>`);
    return `<div class="day ${k === today ? 'is-today' : ''} ${value ? '' : 'is-empty'}">
      <div class="day__date"><span>${formatDate(d, { weekday: 'short' })}</span><strong>${d.getDate()}</strong></div>
      <span class="day__icon" aria-hidden="true">${value ? activityIcon(value) : ''}</span>
      <select class="input select day__select" data-day="${k}" aria-label="Activité du ${formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}"${store.activeId() ? '' : ' disabled'}>${options.join('')}</select>
      ${value && store.activeId() ? planNoteField(k, plans[k].note, `Commentaire du ${formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}`) : ''}
    </div>`;
  }).join('')));
  host.querySelectorAll('[data-plan-note]').forEach(autosize);
}

/* ---------- Mois ---------- */
function renderMonth() {
  const plans = store.field('plans');
  const activities = store.field('activities');
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  const key = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
  const isCurrent = monthOffset === 0;
  const counts = {};
  for (const [k, v] of Object.entries(plans)) {
    if (!k.startsWith(key) || (isCurrent && k > todayKey())) continue;
    counts[v.type] = (counts[v.type] || 0) + 1;
  }
  const firstKey = Object.keys(plans).sort()[0];
  const oldest = firstKey ? (now.getFullYear() - Number(firstKey.slice(0, 4))) * 12 + now.getMonth() - (Number(firstKey.slice(5, 7)) - 1) : 0;
  $('#activityOlder').disabled = monthOffset >= Math.max(0, oldest);
  $('#activityNewer').disabled = monthOffset === 0;
  $('#activityMonthTitle').textContent = capitalize(target.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
  $('#activityMonthSub').textContent = isCurrent ? 'Activités réalisées jusqu’à aujourd’hui' : 'Activités réalisées';
  // Couleurs attribuées dans l'ordre de la liste des activités : stables et toujours distinctes (≤ 8 activités).
  const rank = name => (activities.includes(name) ? activities.indexOf(name) : Infinity);
  const colors = new Map(
    Object.keys(counts)
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'fr'))
      .map((name, i) => [name, PALETTE[i % PALETTE.length]])
  );
  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .map(([name, n]) => [name, n, colors.get(name)]);
  renderDonut({ donut: $('#activityDonut'), legend: $('#activityLegend'), total: $('#activityTotal') }, entries, 'Aucune activité enregistrée pour ce mois.');
}

export function renderPlanning() {
  $$('#planningMode [data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('#calendarCard').hidden = mode !== 'month';
  $('#weekCard').hidden = mode !== 'week';
  if (mode === 'month') renderCalendar();
  else renderWeek();
  renderMonth();
  if (!$('#activitySheet').hidden) renderActivityList();
}

/* ---------- Gestion des activités ---------- */
function renderActivityList() {
  const list = store.field('activities');
  $('#activityList').innerHTML = list
    .map(
      (a, i) => `<div class="row" data-activity-index="${i}">
      <span class="row__icon">${activityIcon(a)}</span>
      <div class="row__body"><div class="row__title">${esc(a)}</div></div>
      <div class="row-actions">
        <button type="button" class="icon-btn icon-btn--sm" data-act="up" ${i === 0 ? 'disabled' : ''} aria-label="Monter">${icon('chevronUp', 16)}</button>
        <button type="button" class="icon-btn icon-btn--sm" data-act="down" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Descendre">${icon('chevronDown', 16)}</button>
        <button type="button" class="icon-btn icon-btn--sm" data-act="rename" aria-label="Renommer">${icon('edit', 16)}</button>
        <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-act="delete" ${a === REST ? 'disabled title="Repos ne peut pas être supprimé"' : ''} aria-label="Supprimer">${icon('trash', 16)}</button>
      </div>
    </div>`
    )
    .join('');
}

async function onActivityAction(e) {
  const btn = e.target.closest('[data-act]');
  const row = btn?.closest('[data-activity-index]');
  if (!row) return;
  const list = store.field('activities');
  const i = Number(row.dataset.activityIndex);
  const name = list[i];
  const act = btn.dataset.act;
  if (act === 'up' || act === 'down') {
    const j = i + (act === 'up' ? -1 : 1);
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    store.setField('activities', list);
  } else if (act === 'rename') {
    const next = await promptDialog({ title: 'Renommer l’activité', label: 'Nom', value: name, maxLength: 60 });
    if (!next || next === name) return;
    if (list.some((a, k) => k !== i && a.toLowerCase() === next.toLowerCase())) return toastError('Cette activité existe déjà.');
    list[i] = next;
    // Le planning suit le nouveau nom.
    const plans = store.field('plans');
    Object.values(plans).forEach(p => {
      if (p.type === name) p.type = next;
    });
    store.setKeys({ [`horse_${store.activeId()}_activities`]: list, [`horse_${store.activeId()}_plans`]: plans });
    toast('Activité renommée');
  } else if (act === 'delete') {
    if (name === REST) return;
    if (!(await confirmDialog({ title: `Supprimer « ${name} » ?`, message: 'Les jours déjà planifiés avec cette activité sont conservés dans l’historique.', confirmLabel: 'Supprimer', danger: true }))) return;
    store.setField('activities', list.filter((_, k) => k !== i));
    toast('Activité supprimée');
  }
}

export function initPlanning() {
  initCalendar();
  $('#planningMode').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b || b.dataset.mode === mode) return;
    mode = b.dataset.mode;
    renderPlanning();
  });
  document.addEventListener('click', e => {
    const w = e.target.closest('[data-week]');
    if (!w) return;
    const n = Number(w.dataset.week);
    const before = weekStart.getTime();
    weekStart = n === 0 ? mondayOf(new Date()) : addDays(weekStart, 7 * n);
    renderWeek();
    slideIn($('#weekRows'), Math.sign(weekStart.getTime() - before));
  });
  $('#weekRows').addEventListener('change', e => {
    const k = e.target.dataset.day;
    if (!k || !store.activeId()) return;
    setPlanType(k, e.target.value);
    toast(e.target.value ? `${e.target.value} · ${formatDate(new Date(`${k}T12:00:00`), { weekday: 'long', day: 'numeric' })}` : 'Journée effacée');
  });
  initNoteFields($('#weekRows'));
  $('#activityOlder').addEventListener('click', () => {
    monthOffset++;
    renderMonth();
  });
  $('#activityNewer').addEventListener('click', () => {
    monthOffset = Math.max(0, monthOffset - 1);
    renderMonth();
  });
  $('#activityForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = e.currentTarget.elements.name;
    const name = input.value.trim();
    if (!name) {
      input.setAttribute('aria-invalid', 'true');
      return input.focus();
    }
    input.removeAttribute('aria-invalid');
    const list = store.field('activities');
    if (list.some(a => a.toLowerCase() === name.toLowerCase())) return toastError('Cette activité existe déjà.');
    list.push(name);
    store.setField('activities', list);
    input.value = '';
    toast('Activité ajoutée');
  });
  $('#activityList').addEventListener('click', onActivityAction);
}

export function openActivities() {
  if (!store.activeId()) return toastError('Ajoutez d’abord un cheval.');
  renderActivityList();
  openSheet('activitySheet', { focus: false });
}
