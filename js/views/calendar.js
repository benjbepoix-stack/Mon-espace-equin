/* Calendrier mensuel : tous les jours du mois, rendez-vous, activités et dépenses du cheval actif. */
import { $, esc, plural } from '../core/utils.js';
import { addDays, dateKey, mondayOf, todayKey, formatDate, fromKey } from '../core/dates.js';
import * as store from '../core/store.js';
import { REST } from '../core/schema.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { slideIn } from '../ui/motion.js';
import { activityIcon } from '../ui/equine-icons.js';
import { appointmentRow, openAppointment } from './appointments.js';
import { expenseRow, openExpense } from './finance.js';
import { capitalize, euro, netExpense } from './common.js';

let month = firstOfMonth(new Date());
let selected = todayKey();

function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const byTime = (a, b) => (a.time || '99').localeCompare(b.time || '99');

function groupByDay(list) {
  const map = {};
  list.forEach(x => (map[x.date] ||= []).push(x));
  return map;
}

/* ---------- Grille ---------- */
function renderGrid() {
  const plans = store.field('plans');
  const apts = groupByDay(store.field('appointments'));
  const exps = groupByDay(store.field('finances'));
  const today = todayKey();
  const mk = monthKey(month);

  $('#calTitle').textContent = capitalize(formatDate(month, { month: 'long', year: 'numeric' }));
  const nApt = Object.entries(apts).filter(([k]) => k.startsWith(mk)).reduce((n, [, l]) => n + l.length, 0);
  const nAct = Object.entries(plans).filter(([k, v]) => k.startsWith(mk) && v.type !== REST).length;
  $('#calSub').textContent = `${nApt} ${plural(nApt, 'rendez-vous', 'rendez-vous')} · ${nAct} ${plural(nAct, 'séance')}`;

  // Semaines complètes du lundi au dimanche couvrant le mois
  const start = mondayOf(month);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
  const weeks = Math.ceil((Math.round((last - start) / 86400000) + 1) / 7);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const k = dateKey(d);
    const out = d.getMonth() !== month.getMonth();
    const plan = plans[k]?.type;
    const a = apts[k]?.length || 0;
    const e = exps[k]?.length || 0;
    const label = [formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' }), a && `${a} ${plural(a, 'rendez-vous', 'rendez-vous')}`, plan, e && `${e} ${plural(e, 'dépense')}`].filter(Boolean).join(', ');
    const cls = ['cal-day', out && 'is-out', k === today && 'is-today', k === selected && 'is-selected', k < today && 'is-past'].filter(Boolean).join(' ');
    const marks = [a ? '<i class="cal-mark cal-mark--apt"></i>' : '', plan ? `<i class="cal-mark cal-mark--act${plan === REST ? ' is-rest' : ''}"></i>` : '', e ? '<i class="cal-mark cal-mark--exp"></i>' : ''].join('');
    cells.push(`<button type="button" class="${cls}" data-cal-day="${k}" role="gridcell" aria-label="${esc(label)}"${k === selected ? ' aria-selected="true"' : ''}><span class="cal-day__num">${d.getDate()}</span><span class="cal-day__marks">${marks}</span></button>`);
  }
  $('#calGrid').innerHTML = cells.join('');
}

/* ---------- Détail du jour ---------- */
function renderDay() {
  const host = $('#calDay');
  const d = fromKey(selected);
  const plans = store.field('plans');
  const activities = store.field('activities');
  const apts = store.field('appointments').filter(a => a.date === selected).sort(byTime);
  const exps = store.field('finances').filter(x => x.date === selected);
  const value = plans[selected]?.type || '';
  const hasHorse = Boolean(store.activeId());
  const options = [`<option value=""${value ? '' : ' selected'}>— Aucune activité —</option>`, ...activities.map(a => `<option${a === value ? ' selected' : ''}>${esc(a)}</option>`)];
  if (value && !activities.includes(value)) options.push(`<option selected>${esc(value)}</option>`);
  const spent = exps.reduce((s, x) => s + netExpense(x), 0);

  host.innerHTML = `
    <header class="cal-detail__head">
      <div><h3 class="cal-detail__title">${esc(capitalize(formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })))}</h3>
      <p class="card__sub">${selected === todayKey() ? 'Aujourd’hui' : esc(formatDate(d, { year: 'numeric' }))}</p></div>
    </header>
    <div class="cal-detail__activity">
      <span class="day__icon" aria-hidden="true">${value ? activityIcon(value) : ''}</span>
      <select class="input select day__select" id="calActivity" aria-label="Activité du jour"${hasHorse ? '' : ' disabled'}>${options.join('')}</select>
    </div>
    ${apts.length ? `<p class="cal-detail__label">Rendez-vous</p><div class="card card--list card--flat">${apts.map(a => appointmentRow(a, { isPast: selected < todayKey() })).join('')}</div>` : ''}
    ${exps.length ? `<p class="cal-detail__label">Dépenses · ${esc(euro(spent))}</p><div class="card card--list card--flat">${exps.map(expenseRow).join('')}</div>` : ''}
    ${!apts.length && !exps.length ? '<p class="cal-detail__empty">Aucun rendez-vous ni dépense ce jour-là.</p>' : ''}
    <div class="cal-detail__actions">
      <button type="button" class="btn btn--soft btn--sm" data-cal-add="appointment"${hasHorse ? '' : ' disabled'}>${icon('calendarPlus', 17)}<span>Rendez-vous</span></button>
      <button type="button" class="btn btn--soft btn--sm" data-cal-add="expense"${hasHorse ? '' : ' disabled'}>${icon('coins', 17)}<span>Dépense</span></button>
    </div>`;
}

export function renderCalendar() {
  renderGrid();
  renderDay();
}

function step(n) {
  const before = month.getTime();
  if (n === 0) {
    month = firstOfMonth(new Date());
    selected = todayKey();
  } else {
    month = new Date(month.getFullYear(), month.getMonth() + n, 1);
    // on sélectionne le 1er du mois affiché (ou aujourd'hui s'il en fait partie)
    selected = monthKey(month) === todayKey().slice(0, 7) ? todayKey() : dateKey(month);
  }
  renderCalendar();
  // Le nouveau mois arrive du côté vers lequel on avance.
  const dir = Math.sign(month.getTime() - before);
  if (dir) slideIn($('#calGrid'), dir);
  slideIn($('#calDay'));
}

export function initCalendar() {
  const card = $('#calendarCard');
  card.addEventListener('click', e => {
    const s = e.target.closest('[data-cal-step]');
    if (s) return step(Number(s.dataset.calStep));
    const day = e.target.closest('[data-cal-day]');
    if (day) {
      if (day.dataset.calDay === selected) return;
      selected = day.dataset.calDay;
      const d = fromKey(selected);
      // Jour grisé d'un mois voisin : on change de mois en glissant de ce côté.
      const otherMonth = d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear();
      const dir = otherMonth ? Math.sign(d - month) : 0;
      if (dir) month = firstOfMonth(d);
      renderCalendar();
      if (dir) slideIn($('#calGrid'), dir);
      return slideIn($('#calDay'));
    }
    const add = e.target.closest('[data-cal-add]');
    if (add?.dataset.calAdd === 'appointment') openAppointment(null, { date: selected });
    else if (add?.dataset.calAdd === 'expense') openExpense(null, { date: selected });
  });
  card.addEventListener('change', e => {
    if (e.target.id !== 'calActivity' || !store.activeId()) return;
    const plans = store.field('plans');
    if (e.target.value) plans[selected] = { type: e.target.value };
    else delete plans[selected];
    store.setField('plans', plans);
    toast(e.target.value ? `${e.target.value} · ${formatDate(fromKey(selected), { weekday: 'long', day: 'numeric' })}` : 'Journée effacée');
  });
  // Balayage horizontal sur la grille pour changer de mois
  let x0 = null;
  let y0 = null;
  const grid = $('#calGrid');
  grid.addEventListener('touchstart', e => ([x0, y0] = [e.touches[0].clientX, e.touches[0].clientY]), { passive: true });
  grid.addEventListener(
    'touchend',
    e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dy) < 40) step(dx < 0 ? 1 : -1);
    },
    { passive: true }
  );
}
