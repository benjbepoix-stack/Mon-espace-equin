/* Point d'entrée : connexion, état, navigation, synchronisation. */
import { $, $$, debounce } from './core/utils.js';
import * as store from './core/store.js';
import { rules, validate } from './core/validation.js';
import { readText, write } from './services/storage.js';
import { initFirebase, pushCloud, flushNow, clearPending, signIn, signUp, resetPassword, signOutUser, describeAuthError, currentUser } from './services/firebase.js';
import { initDialogs, openSheet, confirmDialog } from './ui/dialog.js';
import { applyTheme } from './ui/theme.js';
import { renderStatus } from './ui/status.js';
import { toast, toastError } from './ui/toast.js';
import { icon } from './ui/icons.js';
import { initCalendarPrompt } from './features/calendar-prompt.js';
import { renderHome } from './views/home.js';
import { initAppointments, openAppointment, renderPastSheet, exportUpcoming } from './views/appointments.js';
import { initFinance, renderFinance, openExpense } from './views/finance.js';
import { initPlanning, renderPlanning, openActivities } from './views/planning.js';
import { initProfile, renderProfile, openHorse, openNote, openSwitcher } from './views/profile.js';
import { initCures, openCure } from './views/cures.js';
import { initContacts, renderContacts, openContact } from './views/contacts.js';
import { horseName } from './views/common.js';

const VIEWS = { homeView: renderHome, financeView: renderFinance, planningView: renderPlanning, profileView: renderProfile, contactsView: renderContacts };
const VIEW_KEY = 'equin_last_view';
const LAST_UID = 'equin_last_uid';
let currentView = 'homeView';

/* ---------- Rendu ---------- */
function renderChrome() {
  const name = store.activeId() ? horseName() : 'Aucun cheval';
  $('#headerTitle').textContent = name;
  document.title = store.activeId() ? `${name} · Cavalia` : 'Cavalia';
}

const renderCurrent = () => {
  renderChrome();
  VIEWS[currentView]();
  if (!$('#pastSheet').hidden) renderPastSheet();
};

function switchView(id, { scroll = true } = {}) {
  if (!VIEWS[id]) id = 'homeView';
  currentView = id;
  $$('.view').forEach(v => (v.hidden = v.id !== id));
  $$('[data-view]').forEach(b => {
    const active = b.dataset.view === id;
    b.classList.toggle('is-active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  renderCurrent();
  try {
    sessionStorage.setItem(VIEW_KEY, id);
  } catch {
    /* navigation privée */
  }
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Connexion ---------- */
let authMode = 'login'; // login | signup | reset

function showAuth(state) {
  document.documentElement.classList.add('is-auth-pending');
  $('#authScreen').hidden = false;
  $('#authLoading').hidden = state !== 'loading';
  $('#authForm').hidden = state !== 'form';
  $('#authOffline').hidden = state !== 'offline';
}

function hideAuth() {
  document.documentElement.classList.remove('is-auth-pending');
  $('#authScreen').hidden = true;
}

function renderAuthMode() {
  const texts = {
    login: ['Connexion', 'Retrouvez les données de vos chevaux sur tous vos appareils.', 'Se connecter', 'Créer un compte'],
    signup: ['Créer mon compte', 'Un compte pour synchroniser vos données entre vos appareils.', 'Créer le compte', 'J’ai déjà un compte'],
    reset: ['Mot de passe oublié', 'Indiquez votre e-mail : vous recevrez un lien pour choisir un nouveau mot de passe.', 'Envoyer le lien', 'Retour à la connexion']
  }[authMode];
  [$('#authTitle').textContent, $('#authSub').textContent, $('#authSubmit').textContent, $('#authSwitch').textContent] = texts;
  $('#authPasswordField').hidden = authMode === 'reset';
  $('#authForgot').hidden = authMode !== 'login';
  $('#authPassword').autocomplete = authMode === 'signup' ? 'new-password' : 'current-password';
  $('#authError').textContent = '';
  $('#authError').classList.remove('is-success');
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  const err = $('#authError');
  const { valid, errors } = validate(
    { email, password },
    {
      email: [rules.required('L’e-mail'), v => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Adresse e-mail invalide.')],
      password: authMode === 'reset' ? [] : [rules.required('Le mot de passe'), v => (v.length >= 6 ? null : '6 caractères minimum.')]
    }
  );
  if (!valid) {
    err.textContent = Object.values(errors)[0];
    return;
  }
  const btn = $('#authSubmit');
  btn.classList.add('is-loading');
  btn.disabled = true;
  err.textContent = '';
  try {
    if (authMode === 'login') await signIn(email, password);
    else if (authMode === 'signup') await signUp(email, password);
    else {
      await resetPassword(email);
      err.classList.add('is-success');
      err.textContent = 'E-mail envoyé. Pensez à vérifier vos courriers indésirables.';
    }
  } catch (error) {
    console.error('[auth]', error);
    err.classList.remove('is-success');
    err.textContent = describeAuthError(error);
  } finally {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

function onUser(user) {
  if (user) {
    // Autre compte que le précédent sur cet appareil : on repart d'une base vide.
    const last = readText(LAST_UID, '');
    if (last && last !== user.uid) {
      clearPending();
      store.resetLocal();
    }
    write(LAST_UID, user.uid);
    $('#accountEmail').textContent = `Connecté : ${user.email}`;
    hideAuth();
    renderCurrent();
  } else {
    authMode = 'login';
    renderAuthMode();
    showAuth('form');
  }
}

function initAuthUI() {
  $('#authForm').addEventListener('submit', onAuthSubmit);
  $('#authSwitch').addEventListener('click', () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    renderAuthMode();
  });
  $('#authForgot').addEventListener('click', () => {
    authMode = 'reset';
    renderAuthMode();
  });
  $('#authRetry').addEventListener('click', () => location.reload());
  $('#authLocal').addEventListener('click', () => {
    hideAuth();
    $('#accountEmail').textContent = 'Mode hors ligne : données de cet appareil uniquement.';
    toast('Mode hors ligne', { type: 'info' });
  });
  $('#logoutBtn').addEventListener('click', async () => {
    if (!currentUser()) return location.reload();
    if (!(await confirmDialog({ title: 'Se déconnecter ?', message: 'Vos données restent enregistrées dans votre compte.', confirmLabel: 'Se déconnecter' }))) return;
    try {
      await signOutUser();
    } catch {
      toastError('Déconnexion impossible. Réessayez.');
    }
  });
}

/* ---------- Divers ---------- */
function initGlobalErrors() {
  let last = 0;
  const report = error => {
    console.error(error);
    if (Date.now() - last < 4000) return;
    last = Date.now();
    toastError('Une erreur inattendue est survenue. Vos données sont conservées.');
  };
  window.addEventListener('error', e => report(e.error || e.message));
  window.addEventListener('unhandledrejection', e => report(e.reason));
}

function onOpen(e) {
  const btn = e.target.closest('[data-open]');
  if (!btn) return;
  const what = btn.dataset.open;
  if (what === 'appointment') openAppointment();
  else if (what === 'expense') openExpense();
  else if (what === 'past') {
    renderPastSheet();
    openSheet('pastSheet', { focus: false });
  } else if (what === 'activities') openActivities();
  else if (what === 'horse') openHorse(false);
  else if (what === 'note') openNote();
  else if (what === 'cure') openCure();
  else if (what === 'contact') openContact();
  else if (what === 'export') exportUpcoming();
}

async function init() {
  initGlobalErrors();
  store.loadLocal();
  applyTheme(store.theme());
  $$('[data-icon]').forEach(el => (el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22)));

  initDialogs();
  initCalendarPrompt();
  initAppointments();
  initFinance();
  initPlanning();
  initProfile();
  initCures();
  initContacts();
  initAuthUI();

  store.subscribe(keys => {
    if (keys.includes('theme')) applyTheme(store.theme(), { animate: true });
    renderCurrent();
  });
  $$('[data-view]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  document.addEventListener('click', onOpen);
  $('#horseSwitchBtn').addEventListener('click', openSwitcher);
  $('#themeToggle').addEventListener('click', () => store.setKeys({ theme: store.theme() === 'light' ? 'dark' : 'light' }));

  let initial = 'homeView';
  try {
    initial = sessionStorage.getItem(VIEW_KEY) || initial;
  } catch {
    /* ignore */
  }
  switchView(initial, { scroll: false });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
    else renderCurrent();
  });
  window.addEventListener('pagehide', flushNow);
  window.addEventListener('resize', debounce(() => currentView === 'financeView' && renderFinance(), 150));

  showAuth('loading');
  store.setCloudSink(pushCloud);
  const ok = await initFirebase({
    onUser,
    onRemote: remote => store.applyRemote(remote),
    onStatus: renderStatus,
    onError: message => toastError(`Synchronisation : ${message}`),
    onAck: store.acknowledge,
    getSnapshot: store.cloudSnapshot
  });
  if (!ok) showAuth('offline');

  // Mises à jour : voir sw.js. Un nouveau service worker recharge la page une fois.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(error => console.warn('[sw] enregistrement impossible', error));
  }
}

init();
