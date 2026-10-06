/*
 * Schéma des données — STRICTEMENT compatible avec les versions précédentes.
 *
 * Les données sont une table plate de clés (identiques à l'ancien localStorage,
 * sans le préfixe « mon_espace_equin_v1_ ») :
 *   horses              [{ id, name, birth, discipline, breed, stable }]
 *   activeHorseId       'h_…'
 *   theme               'dark' | 'light'
 *   horse_<id>_profile      { name, birth, discipline, breed, stable, note }
 *   horse_<id>_finances     [{ id, type, name, date, amount(€), status, note, insurance, refundAmount }]
 *   horse_<id>_appointments [{ id, type, name, date, time, place, note, repeatMonths }]
 *   horse_<id>_plans        { 'AAAA-MM-JJ': { type } }
 *   horse_<id>_activities   ['Repos', …]
 *   horse_<id>_horseNotes   [{ id, date, text }]
 *   horse_<id>_cures        [{ id, name, kind, start, end, dose, note, done }]
 *
 * Les montants restent en euros (nombres décimaux) et les identifiants restent
 * numériques pour rester lisibles par une ancienne version de l'app.
 */
import { isDateKey, isTime } from './dates.js';

export const HORSE_FIELDS = ['profile', 'finances', 'appointments', 'plans', 'activities', 'horseNotes', 'cures'];

export const DEFAULT_ACTIVITIES = ['Repos', 'Travail sur le plat', 'Dressage', 'Saut d’obstacles', 'Trotting', 'Cavaletti', 'Paddock', 'Prés', 'Saut de puce', 'Balade extérieure', 'Travail à pied', 'Longe', 'Renforcement', 'Soin'];
export const REST = 'Repos';
export const EXPENSE_TYPES = ['Vétérinaire', 'Dentiste équin', 'Ostéopathe', 'Masseuse', 'Sellier', 'Maréchal-ferrant', 'Matériel', 'Pension', 'Alimentation', 'Concours', 'Transport', 'Autre'];
export const APPOINTMENT_TYPES = ['Maréchal-ferrant', 'Vétérinaire', 'Dentiste', 'Ostéopathe', 'Masseuse', 'Sellier', 'Vaccination', 'Concours', 'Autre'];
export const BREEDS = ['Selle Français', 'Anglo-Arabe', 'Pur-sang', 'Arabe', 'Lusitanien', 'PRE', 'KWPN', 'Hanovrien', 'Holsteiner', 'Oldenbourg', 'BWP', 'Connemara', 'Poney Français de Selle', 'Welsh', 'Appaloosa', 'Quarter Horse', 'Frison', 'Comtois', 'Autre'];
export const CONTACT_ROLES = ['Vétérinaire', 'Maréchal-ferrant', 'Dentiste équin', 'Ostéopathe', 'Masseuse', 'Sellier', 'Pension / écurie', 'Moniteur / coach', 'Transporteur', 'Assurance', 'Autre'];
export const INSURANCE = { none: 'Pas de remboursement', pending: 'En attente du remboursement', paid: 'Remboursé' };
// Rappel récurrent (vaccins, vermifuges…) : 0 = aucun rappel.
export const REPEAT_MONTHS = { 0: 'Jamais', 1: 'Tous les mois', 3: 'Tous les 3 mois', 6: 'Tous les 6 mois', 12: 'Tous les ans' };

export const horseKey = (id, field) => `horse_${id}_${field}`;
export const parseHorseKey = key => {
  const m = /^horse_(.+)_(profile|finances|appointments|plans|activities|horseNotes|cures)$/.exec(key);
  return m ? { id: m[1], field: m[2] } : null;
};

export const asArray = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 500) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)).slice(0, max);
const money = v => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};
const keepId = v => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v) ? v : null;
const byDateDesc = (a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id));

export function normalizeHorses(raw) {
  return asArray(raw)
    .filter(isObj)
    .map(h => ({ id: str(h.id, 80), name: str(h.name, 60) || 'Sans nom', birth: isDateKey(h.birth) ? h.birth : '', discipline: str(h.discipline, 60), breed: str(h.breed, 60), stable: str(h.stable, 80) }))
    .filter(h => h.id);
}

export function normalizeProfile(raw) {
  const p = isObj(raw) ? raw : {};
  return { name: str(p.name, 60), birth: isDateKey(p.birth) ? p.birth : '', discipline: str(p.discipline, 60), breed: str(p.breed, 60), stable: str(p.stable, 80), note: str(p.note, 20000) };
}

export function normalizeFinances(raw) {
  return asArray(raw)
    .filter(isObj)
    .map(x => {
      const amount = money(x.amount);
      return {
        id: keepId(x.id),
        type: str(x.type, 40) || 'Autre',
        name: str(x.name, 120),
        date: isDateKey(x.date) ? x.date : '',
        amount,
        status: x.status === 'unpaid' ? 'unpaid' : 'paid',
        note: str(x.note, 1000),
        insurance: INSURANCE[x.insurance] ? x.insurance : 'none',
        refundAmount: Math.min(amount, money(x.refundAmount))
      };
    })
    .filter(x => x.id !== null && x.date);
}

export function normalizeAppointments(raw) {
  return asArray(raw)
    .filter(isObj)
    .map(x => ({
      id: keepId(x.id),
      type: str(x.type, 40) || 'Autre',
      name: str(x.name, 120),
      date: isDateKey(x.date) ? x.date : '',
      time: isTime(x.time) ? x.time : '',
      place: str(x.place, 120),
      note: str(x.note, 1000),
      repeatMonths: REPEAT_MONTHS[Number(x.repeatMonths)] ? Number(x.repeatMonths) : 0
    }))
    .filter(x => x.id !== null && x.date);
}

export function normalizePlans(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (isDateKey(k) && isObj(v) && v.type) out[k] = { type: str(v.type, 60) };
  }
  return out;
}

export function normalizeActivities(raw) {
  const list = [...new Set(asArray(raw).map(a => str(a, 60).trim()).filter(Boolean))];
  if (!list.length) return [...DEFAULT_ACTIVITIES];
  return list.includes(REST) ? list : [REST, ...list];
}

export function normalizeNotes(raw) {
  return asArray(raw)
    .filter(isObj)
    .map(n => ({ id: keepId(n.id), date: isDateKey(n.date) ? n.date : '', text: str(n.text, 5000) }))
    .filter(n => n.id !== null && n.date && n.text.trim())
    .sort(byDateDesc);
}

/** Cures (compléments, traitements…) : en cours si début ≤ aujourd'hui ≤ fin (fin facultative). */
export const CURE_KINDS = ['Complément alimentaire', 'Traitement vétérinaire', 'Vermifuge', 'Phytothérapie', 'Soin local', 'Autre'];
export function normalizeCures(raw) {
  return asArray(raw)
    .filter(isObj)
    .map(c => {
      const start = isDateKey(c.start) ? c.start : '';
      const end = isDateKey(c.end) && c.end >= start ? c.end : '';
      return { id: keepId(c.id), name: str(c.name, 120).trim(), kind: CURE_KINDS.includes(c.kind) ? c.kind : 'Autre', start, end, dose: str(c.dose, 200), note: str(c.note, 1000), done: c.done === true };
    })
    .filter(c => c.id !== null && c.name && c.start)
    .sort((a, b) => b.start.localeCompare(a.start) || String(b.id).localeCompare(String(a.id)));
}

/** Contacts : communs à tous les chevaux (clé « contacts »). */
export function normalizeContacts(raw) {
  return asArray(raw)
    .filter(isObj)
    .map(c => ({ id: keepId(c.id), name: str(c.name, 80).trim(), role: CONTACT_ROLES.includes(c.role) ? c.role : 'Autre', phone: str(c.phone, 30).trim(), email: str(c.email, 120).trim(), note: str(c.note, 500) }))
    .filter(c => c.id !== null && c.name);
}

const FIELD_NORMALIZERS = {
  profile: normalizeProfile,
  finances: normalizeFinances,
  appointments: normalizeAppointments,
  plans: normalizePlans,
  activities: normalizeActivities,
  horseNotes: normalizeNotes,
  cures: normalizeCures
};

/** Normalise une valeur selon sa clé. */
export function normalizeKey(key, value) {
  if (key === 'horses') return normalizeHorses(value);
  if (key === 'activeHorseId') return typeof value === 'string' ? value : null;
  if (key === 'theme') return value === 'light' ? 'light' : 'dark';
  if (key === 'contacts') return normalizeContacts(value);
  const hk = parseHorseKey(key);
  if (hk) return FIELD_NORMALIZERS[hk.field](value);
  return value;
}

/** Clé reconnue par l'application ? (les autres sont ignorées) */
export const isKnownKey = key => key === 'horses' || key === 'contacts' || key === 'activeHorseId' || key === 'theme' || Boolean(parseHorseKey(key));

/** Identifiant numérique unique (compatible avec les anciennes versions). */
export function numericId(existing = []) {
  const used = new Set(existing.map(x => String(x.id)));
  let id;
  do id = Date.now() + Math.floor(Math.random() * 1000);
  while (used.has(String(id)));
  return id;
}

export const makeHorseId = () => `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
