/*
 * Store central : table plate de clés (format historique), persistance locale
 * et synchronisation cloud fine.
 *
 * - Même clés localStorage qu'avant (préfixe « mon_espace_equin_v1_ ») :
 *   les données déjà présentes sur l'appareil sont reprises telles quelles.
 * - Cloud : chaque clé modifiée est envoyée seule (`update`), au lieu de
 *   réécrire toute la base à chaque saisie. Deux appareils qui modifient des
 *   choses différentes ne s'écrasent plus.
 * - Les écritures non confirmées sont conservées (equin_unsynced) et
 *   renvoyées au prochain lancement.
 */
import { readJSON, write } from '../services/storage.js';
import { sameJSON } from './utils.js';
import { normalizeKey, isKnownKey, horseKey, normalizeHorses, normalizeProfile, normalizeActivities } from './schema.js';

export const BASE = 'mon_espace_equin_v1_';
const UNSYNCED_KEY = 'equin_unsynced';

const data = {};
const listeners = new Set();
let cloudSink = null;
let unsynced = {};

function persist(key) {
  try {
    if (key in data) localStorage.setItem(BASE + key, JSON.stringify(data[key]));
    else localStorage.removeItem(BASE + key);
  } catch (error) {
    console.warn('[store] écriture locale impossible', key, error);
  }
}
const persistUnsynced = () => write(UNSYNCED_KEY, JSON.stringify(unsynced));

function notify(keys, source) {
  listeners.forEach(fn => {
    try {
      fn(keys, source);
    } catch (error) {
      console.error('[store] erreur dans un abonné', error);
    }
  });
}

export function loadLocal() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(BASE)) continue;
      const key = k.slice(BASE.length);
      if (!isKnownKey(key)) continue;
      data[key] = normalizeKey(key, readJSON(k, null));
    }
  } catch (error) {
    console.warn('[store] lecture locale impossible', error);
  }
  const saved = readJSON(UNSYNCED_KEY, {});
  unsynced = saved && typeof saved === 'object' ? saved : {};
  // Cheval actif invalide -> premier cheval
  const list = horses();
  if (!list.some(h => h.id === data.activeHorseId)) data.activeHorseId = list[0]?.id || null;
}

export const subscribe = fn => (listeners.add(fn), () => listeners.delete(fn));

/* ---------- Lecture ---------- */
export const get = key => data[key];
export const horses = () => data.horses || [];
export const activeId = () => data.activeHorseId || null;
export const theme = () => data.theme || 'dark';
export const contacts = () => structuredClone(data.contacts || []);
export const activeHorse = () => horses().find(h => h.id === activeId()) || null;

const DEFAULTS = { profile: () => normalizeProfile(null), finances: () => [], appointments: () => [], plans: () => ({}), activities: () => normalizeActivities(null), horseNotes: () => [], cures: () => [] };

/** Champ du cheval actif (copie modifiable). */
export function field(name, id = activeId()) {
  if (!id) return DEFAULTS[name]();
  const value = data[horseKey(id, name)];
  return value === undefined ? DEFAULTS[name]() : structuredClone(value);
}

/* ---------- Écriture ---------- */
/**
 * Enregistre un ensemble de clés : { clé: valeur } ; valeur null = suppression.
 */
export function setKeys(patch) {
  const payload = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) {
      if (!(key in data)) continue;
      delete data[key];
    } else {
      data[key] = normalizeKey(key, value);
    }
    persist(key);
    payload[key] = key in data ? data[key] : null;
    unsynced[key] = true;
  }
  persistUnsynced();
  if (Object.keys(payload).length) cloudSink?.(payload);
  notify(Object.keys(payload), 'local');
}

/** Enregistre un champ du cheval actif. */
export const setField = (name, value, id = activeId()) => id && setKeys({ [horseKey(id, name)]: value });

/* ---------- Synchronisation ---------- */
export function setCloudSink(fn) {
  cloudSink = fn;
  const keys = Object.keys(unsynced);
  if (keys.length) cloudSink(Object.fromEntries(keys.map(k => [k, k in data ? data[k] : null])));
}

export function acknowledge(keys) {
  let changed = false;
  keys.forEach(k => {
    if (unsynced[k]) {
      delete unsynced[k];
      changed = true;
    }
  });
  if (changed) persistUnsynced();
}

/** Applique l'état distant complet (users/<uid>/app). */
export function applyRemote(remote) {
  const incoming = remote && typeof remote === 'object' ? remote : {};
  const keys = new Set([...Object.keys(data), ...Object.keys(incoming)].filter(isKnownKey));
  const changed = [];
  for (const key of keys) {
    if (unsynced[key]) continue; // modification locale en cours d'envoi
    if (key in incoming) {
      const next = normalizeKey(key, incoming[key]);
      if (sameJSON(next, data[key])) continue;
      data[key] = next;
    } else {
      if (!(key in data)) continue;
      delete data[key];
    }
    persist(key);
    changed.push(key);
  }
  if (!horses().some(h => h.id === data.activeHorseId)) {
    const first = horses()[0]?.id || null;
    if (data.activeHorseId !== first) {
      data.activeHorseId = first;
      persist('activeHorseId');
      changed.push('activeHorseId');
    }
  }
  if (changed.length) notify(changed, 'remote');
  return changed;
}

/** Efface toutes les données locales (changement de compte). */
export function resetLocal() {
  Object.keys(data).forEach(k => {
    delete data[k];
    persist(k);
  });
  unsynced = {};
  persistUnsynced();
  notify(['horses', 'activeHorseId'], 'reset');
}

/** Instantané complet (première connexion d'un compte vide). */
export const cloudSnapshot = () => structuredClone(data);

/** Supprime toutes les données d'un cheval (clés locales et cloud). */
export function removeHorseData(id) {
  const patch = {};
  ['profile', 'finances', 'appointments', 'plans', 'activities', 'horseNotes', 'cures'].forEach(f => (patch[horseKey(id, f)] = null));
  return patch;
}

export { normalizeHorses };
