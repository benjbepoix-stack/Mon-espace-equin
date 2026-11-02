/* Accueil : cheval actif, prochain rendez-vous, chiffres clés, rendez-vous. */
import { $, esc } from '../core/utils.js';
import { formatKey, todayKey } from '../core/dates.js';
import * as store from '../core/store.js';
import { icon } from '../ui/icons.js';
import { serviceIcon } from '../ui/equine-icons.js';
import { euroRound, netExpense, ageFromBirth, horseName, daysFromToday } from './common.js';
import { upcoming, past, appointmentRow, dueReminders, openAppointment } from './appointments.js';

function renderHero() {
  const p = store.field('profile');
  const meta = [p.discipline, p.breed, ageFromBirth(p.birth)].filter(v => v && v !== '—');
  $('#hero').innerHTML = store.activeId()
    ? `<div class="hero__kicker">Mon cheval</div><h1 class="hero__name">${esc(horseName())}</h1>${meta.length ? `<p class="hero__meta">${meta.map(esc).join(' · ')}</p>` : ''}${p.stable ? `<p class="hero__stable">${icon('pin', 14)} ${esc(p.stable)}</p>` : ''}`
    : `<div class="hero__kicker">Bienvenue</div><h1 class="hero__name">Ajoutez votre premier cheval</h1><p class="hero__meta">Suivez ses rendez-vous, dépenses et activités.</p><button type="button" class="btn btn--primary section" data-open="horse"><span>🥕</span><span>Ajouter un cheval</span></button>`;
}

function renderNext() {
  const next = upcoming()[0];
  const host = $('#nextAppointment');
  if (!store.activeId()) {
    host.innerHTML = '';
    return;
  }
  if (!next) {
    host.innerHTML = `<div class="next card"><div class="next__body"><div class="next__kicker">Prochain rendez-vous</div><div class="next__title">Aucun rendez-vous prévu</div><div class="next__sub">Ajoutez le prochain soin ou concours avec 🥕.</div></div></div>`;
    return;
  }
  const d = daysFromToday(next.date);
  host.innerHTML = `<div class="next card" data-appointment="${esc(next.id)}">
    <span class="next__icon">${serviceIcon(next.type)}</span>
    <div class="next__body">
      <div class="next__kicker">Prochain rendez-vous</div>
      <div class="next__title">${esc(next.type)}${next.name ? ` <span class="row__soft">· ${esc(next.name)}</span>` : ''}</div>
      <div class="next__sub">${esc(formatKey(next.date, { weekday: 'long', day: 'numeric', month: 'long' }))}${next.time ? ` · ${esc(next.time)}` : ''}${next.place ? ` · ${esc(next.place)}` : ''}</div>
      <button type="button" class="chip-btn next__cal" data-ap-action="calendar">${icon('calendarPlus', 14)} Ajouter au calendrier</button>
    </div>
    <div class="next__count"><strong>${d === 0 ? 'Auj.' : `J−${d}`}</strong><span>${d === 0 ? 'aujourd’hui' : d === 1 ? 'demain' : 'jours'}</span></div>
  </div>`;
}

function renderStats() {
  const now = todayKey();
  const fin = store.field('finances');
  const year = fin.filter(x => x.date.slice(0, 4) === now.slice(0, 4));
  const month = year.filter(x => x.date.slice(0, 7) === now.slice(0, 7));
  const sum = list => list.reduce((s, x) => s + netExpense(x), 0);
  $('#homeStats').innerHTML = [
    [euroRound(sum(month)), 'ce mois-ci'],
    [euroRound(sum(year)), 'cette année'],
    [String(upcoming().length), 'rendez-vous']
  ]
    .map(([v, l]) => `<div class="stat"><strong data-count-up>${esc(v)}</strong><span>${l}</span></div>`)
    .join('');
}

function renderDueReminders() {
  const due = store.activeId() ? dueReminders() : [];
  $('#dueRemindersSection').hidden = !due.length;
  if (!due.length) return;
  $('#dueRemindersList').innerHTML = due
    .map(r => {
      const d = daysFromToday(r.dueDate);
      const late = d < 0;
      return `<div class="row" data-due-type="${esc(r.type)}" data-due-date="${esc(r.dueDate)}" data-due-repeat="${esc(r.repeatMonths)}">
        <span class="row__icon ${late ? '' : 'is-muted'}">${serviceIcon(r.type)}</span>
        <div class="row__body"><div class="row__title">${esc(r.type)}</div><div class="row__sub">${late ? 'Échéance dépassée' : 'À prévoir'} · ${esc(formatKey(r.dueDate, { day: 'numeric', month: 'long', year: 'numeric' }))}</div></div>
        <button type="button" class="chip-btn" data-due-action="plan">Planifier</button>
      </div>`;
    })
    .join('');
}

export function renderHome() {
  renderHero();
  renderNext();
  renderStats();
  renderDueReminders();
  const up = upcoming();
  $('#upcomingList').innerHTML = up.length ? up.map(a => appointmentRow(a)).join('') : '<div class="empty-state"><p>Aucun rendez-vous à venir.</p></div>';
  const ps = past();
  $('#pastList').innerHTML = ps.length ? ps.slice(0, 2).map(a => appointmentRow(a, { isPast: true })).join('') : '<div class="empty-state"><p>Aucun rendez-vous passé.</p></div>';
}
