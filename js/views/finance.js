/* Finances : filtres, synthèse annuelle, graphique mensuel, historique, formulaire. */
import { $, $$, esc } from '../core/utils.js';
import { formatKey, todayKey } from '../core/dates.js';
import * as store from '../core/store.js';
import { EXPENSE_TYPES, INSURANCE, numericId } from '../core/schema.js';
import { rules, validate, showErrors, clearErrors, formValues } from '../core/validation.js';
import { openSheet, closeSheet, confirmDialog } from '../ui/dialog.js';
import { toast, toastError } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { serviceIcon } from '../ui/equine-icons.js';
import { renderBarChart } from '../ui/charts.js';
import { euro, euroRound, netExpense, refundOf, toAmount, amountInput, capitalize } from './common.js';

const WINDOW = 6;
const MAX_AMOUNT = 100000;
let filter = 'all';
let offset = 0; // décalage de la fenêtre de 6 mois (0 = mois récents)

const monthKeyOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const shift = (key, delta) => monthKeyOf(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + delta, 1));

export function expenseRow(x) {
  const refund = refundOf(x);
  const tags = [
    `<span class="tag ${x.status === 'paid' ? 'tag--ok' : 'tag--warn'}">${x.status === 'paid' ? 'Payée' : 'À payer'}</span>`,
    x.insurance !== 'none' ? `<span class="tag ${x.insurance === 'pending' ? 'tag--info' : 'tag--ok'}">${x.insurance === 'pending' ? 'Remb. en attente' : `Remboursé ${refund ? euro(refund) : ''}`}</span>` : ''
  ].join('');
  return `<div class="row" data-expense="${esc(x.id)}">
    <span class="row__icon">${serviceIcon(x.type)}</span>
    <div class="row__body">
      <div class="row__title">${esc(x.type)}</div>
      <div class="row__sub">${[x.name, formatKey(x.date, { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="row__tags">${tags}</div>
    </div>
    <div class="row__amount">${euro(netExpense(x))}${refund ? `<small>sur ${euro(x.amount)}</small>` : ''}</div>
    <button type="button" class="icon-btn icon-btn--sm" data-ex-action="edit" aria-label="Modifier la dépense">${icon('edit', 17)}</button>
  </div>`;
}

function renderChart(list) {
  const current = monthKeyOf(new Date());
  const firstData = list.reduce((min, x) => (x.date.slice(0, 7) < min ? x.date.slice(0, 7) : min), current);
  // nombre de fenêtres disponibles vers le passé
  let months = 0;
  for (let k = firstData; k <= current; k = shift(k, 1)) months++;
  const maxOffset = Math.max(0, months - WINDOW);
  offset = Math.min(offset, maxOffset);
  const end = shift(current, -offset);
  const keys = Array.from({ length: WINDOW }, (_, i) => shift(end, i - WINDOW + 1));
  const groups = keys.map(key => {
    const d = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
    const items = list.filter(x => x.date.startsWith(key));
    return {
      key,
      label: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
      title: capitalize(d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })),
      values: { spent: items.reduce((s, x) => s + netExpense(x), 0), count: items.length }
    };
  });
  const total = groups.reduce((s, g) => s + g.values.spent, 0);
  $('#financeRange').textContent = `${groups[0].title} → ${groups[WINDOW - 1].title} · ${euroRound(total)}`;
  $('#financeOlder').disabled = offset >= maxOffset;
  $('#financeNewer').disabled = offset === 0;
  renderBarChart($('#financeChart'), groups, {
    bars: [{ key: 'spent', label: 'Dépenses (après remboursements)', color: 'var(--accent)' }],
    fmt: euro,
    axisFmt: v => (v >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€` : `${Math.round(v)} €`),
    highlight: current,
    extra: g => `<span class="chart-tip__row">Factures<b>${g.values.count}</b></span>`
  });
}

export function renderFinance() {
  const list = store.field('finances');
  $$('#financeFilter [data-filter]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.filter === filter)));
  const overview = filter === 'all';
  $('#financeOverview').hidden = !overview;
  if (overview) {
    const year = todayKey().slice(0, 4);
    const yearList = list.filter(x => x.date.startsWith(year));
    const paid = yearList.filter(x => x.status === 'paid').reduce((s, x) => s + netExpense(x), 0);
    const due = yearList.filter(x => x.status !== 'paid').reduce((s, x) => s + netExpense(x), 0);
    const pending = list.filter(x => x.insurance === 'pending').length;
    $('#financeStats').innerHTML = [
      [euroRound(paid + due), `dépensés en ${year}`],
      [euroRound(due), 'à payer'],
      [String(pending), 'remb. en attente']
    ]
      .map(([v, l]) => `<div class="stat"><strong data-count-up>${esc(v)}</strong><span>${l}</span></div>`)
      .join('');
    const total = paid + due;
    const pct = total ? Math.round((paid / total) * 100) : 0;
    $('#paidRate').innerHTML = `<div class="paid-rate__top"><span>Réglé en ${year}</span><strong data-count-up>${pct} %</strong></div><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Part réglée"><div class="progress__bar" style="--value:${pct}%"></div></div><p class="card__sub">${euro(paid)} payés · ${euro(due)} restant à payer</p>`;
    renderChart(list);
  }
  let shown = [...list].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  if (filter === 'paid') shown = shown.filter(x => x.status === 'paid');
  if (filter === 'unpaid') shown = shown.filter(x => x.status !== 'paid');
  if (filter === 'refund') shown = shown.filter(x => x.insurance === 'pending');
  $('#financeList').innerHTML = shown.length ? shown.map(expenseRow).join('') : `<div class="empty-state"><p>${store.activeId() ? 'Aucune dépense dans cette sélection.' : 'Ajoutez d’abord un cheval.'}</p></div>`;
}

/* ---------- Formulaire ---------- */
function syncRefundField() {
  const f = $('#expenseForm');
  f.querySelector('[data-for="refund"]').hidden = f.elements.insurance.value === 'none';
}

export function openExpense(id = null, { date } = {}) {
  if (!store.activeId()) return toastError('Ajoutez d’abord un cheval.');
  const x = id !== null ? store.field('finances').find(e => String(e.id) === String(id)) : null;
  const f = $('#expenseForm');
  f.reset();
  clearErrors(f);
  f.elements.editId.value = x ? x.id : '';
  f.elements.type.value = x?.type || EXPENSE_TYPES[0];
  f.elements.name.value = x?.name || '';
  f.elements.date.value = x?.date || date || todayKey();
  f.elements.amount.value = x ? amountInput(x.amount) : '';
  f.elements.status.value = x?.status || 'paid';
  f.elements.insurance.value = x?.insurance || 'none';
  f.elements.refundAmount.value = x?.refundAmount ? amountInput(x.refundAmount) : '';
  f.elements.note.value = x?.note || '';
  syncRefundField();
  $('#expenseTitle').textContent = x ? 'Modifier la dépense' : 'Nouvelle dépense';
  $('#expenseDelete').hidden = !x;
  openSheet('expenseSheet', { focus: false });
}

const schema = {
  type: [rules.required('Le type')],
  name: [rules.required('Le libellé'), rules.maxLength(120)],
  date: [rules.date({ required: true })],
  amount: [rules.number({ min: 0, max: MAX_AMOUNT, required: true, label: 'Le montant' })],
  refundAmount: [
    rules.number({ min: 0, max: MAX_AMOUNT }),
    (v, all) => (all.insurance !== 'none' && toAmount(v) !== null && toAmount(all.amount) !== null && toAmount(v) > toAmount(all.amount) ? 'Le remboursement dépasse le montant.' : null)
  ],
  note: [rules.maxLength(1000)]
};

function onSubmit(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const v = formValues(f);
  const { valid, errors } = validate(v, schema);
  if (!valid) return showErrors(f, errors);
  const list = store.field('finances');
  const existing = v.editId !== '' ? list.find(x => String(x.id) === v.editId) : null;
  const amount = toAmount(v.amount);
  const item = {
    ...(existing || {}),
    id: existing ? existing.id : numericId(list),
    type: v.type,
    name: v.name,
    date: v.date,
    amount,
    status: v.status === 'unpaid' ? 'unpaid' : 'paid',
    insurance: INSURANCE[v.insurance] ? v.insurance : 'none',
    refundAmount: v.insurance === 'none' ? 0 : Math.min(amount, toAmount(v.refundAmount) || 0),
    note: v.note
  };
  if (existing) list[list.indexOf(existing)] = item;
  else list.push(item);
  store.setField('finances', list);
  closeSheet('expenseSheet');
  toast(`${existing ? 'Dépense modifiée' : 'Dépense enregistrée'} · ${euro(netExpense(item))}`);
}

async function remove() {
  const id = $('#expenseForm').elements.editId.value;
  const list = store.field('finances');
  const x = list.find(e => String(e.id) === id);
  if (!x) return;
  if (!(await confirmDialog({ title: 'Supprimer cette dépense ?', message: `${x.type} · ${euro(x.amount)} — ${formatKey(x.date)}`, confirmLabel: 'Supprimer', danger: true }))) return;
  store.setField('finances', list.filter(e => e !== x));
  closeSheet('expenseSheet');
  toast('Dépense supprimée');
}

export function initFinance() {
  $('#exType').innerHTML = EXPENSE_TYPES.map(t => `<option>${esc(t)}</option>`).join('');
  $('#financeFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    renderFinance();
  });
  $('#financeOlder').addEventListener('click', () => {
    offset++;
    renderFinance();
  });
  $('#financeNewer').addEventListener('click', () => {
    offset = Math.max(0, offset - 1);
    renderFinance();
  });
  const f = $('#expenseForm');
  f.addEventListener('submit', onSubmit);
  f.elements.insurance.addEventListener('change', syncRefundField);
  $('#expenseDelete').addEventListener('click', remove);
  document.addEventListener('click', e => {
    const row = e.target.closest('[data-expense]');
    if (row && e.target.closest('[data-ex-action="edit"], .row__body, .row__amount')) openExpense(row.dataset.expense);
  });
}
