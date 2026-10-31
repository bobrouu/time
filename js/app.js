// App shell: state, routing, rendering and user actions.

import * as m from './model.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { icon } from './ui.js';
import { renderWeek } from './views/week.js';
import { renderDay } from './views/day.js';
import { renderPlan } from './views/plan.js';
import { renderSettings } from './views/settings.js';
import { renderSheet } from './views/sheet.js';
import { renderWeekReport, renderTrends } from './views/stats.js';

const VERSION = '0.3.0';

const state = {
  settings: null,
  weeks: new Map(), // id -> week
  ephemeral: new Set(), // past weeks opened for viewing but never edited — not saved
  ui: { planLayer: 'plan', sheet: null, statsPeriod: 12 },
  storageNote: '',
  // status: off | syncing | ok | offline | error
  sync: { config: null, status: 'off', message: '', at: 0 },
};

// ---------- Persistence ----------

const dirtyWeeks = new Set();
let settingsDirty = false;
let saveTimer = null;

function markWeek(w) {
  w.updatedAt = Date.now();
  state.ephemeral.delete(w.id);
  dirtyWeeks.add(w.id);
  scheduleSave();
  scheduleSync();
}

function markSettings() {
  state.settings.updatedAt = Date.now();
  settingsDirty = true;
  scheduleSave();
  scheduleSync();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}

// ---------- Sync (optional, through the user's private GitHub repository) ----------

let syncing = false;
let syncAgain = false;
let syncTimer = null;
let pendingSync = false; // local edits not yet synced

function scheduleSync(delay = 4000) {
  if (!state.sync.config) return;
  pendingSync = true;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}

function setSyncStatus(status, message = '') {
  state.sync.status = status;
  state.sync.message = message;
  if (status === 'ok') state.sync.at = Date.now();
  // Don't re-render under the user's fingers while they type.
  if (!document.activeElement?.matches('input')) render();
}

async function runSync() {
  const cfg = state.sync.config;
  if (!cfg) return;
  clearTimeout(syncTimer);
  if (syncing) {
    syncAgain = true;
    return;
  }
  if (!navigator.onLine) {
    setSyncStatus('offline', 'Нет интернета — синхронизируется, когда связь появится');
    return;
  }
  syncing = true;
  pendingSync = false;
  setSyncStatus('syncing');
  try {
    await flush();
    const r = await sync.sync(cfg, { settings: state.settings, weeks: savedWeeks() });
    cfg.files = r.files;
    await store.saveSyncConfig(cfg);
    applyRemote(r);
    setSyncStatus('ok');
  } catch (e) {
    console.warn('sync failed', e);
    pendingSync = true;
    setSyncStatus('error', e.message);
  } finally {
    syncing = false;
    if (syncAgain) {
      syncAgain = false;
      scheduleSync(500);
    }
  }
}

// Merges the synced data into live state (the user may have edited during the sync).
function applyRemote(r) {
  if (!m.sameData(state.settings, r.settings)) {
    state.settings = m.mergeSettings(state.settings, r.settings);
    settingsDirty = true;
  }
  for (const w of r.weeks) {
    const cur = state.ephemeral.has(w.id) ? null : state.weeks.get(w.id);
    const next = cur ? m.mergeWeek(cur, w) : w;
    if (cur && m.sameData(cur, next)) continue;
    state.weeks.set(w.id, next);
    state.ephemeral.delete(w.id);
    dirtyWeeks.add(w.id);
  }
  scheduleSave();
}

async function flush() {
  clearTimeout(saveTimer);
  const weeks = [...dirtyWeeks].map((id) => state.weeks.get(id));
  dirtyWeeks.clear();
  const saveSettings = settingsDirty;
  settingsDirty = false;
  try {
    if (saveSettings) await store.saveSettings(state.settings);
    if (weeks.length) await store.saveWeeks(weeks);
  } catch (e) {
    console.error(e);
    alert(`Не удалось сохранить данные: ${e.message}`);
  }
}

// ---------- Week access ----------

const today = () => m.todayStr();

function getWeek(id) {
  const t = today();
  let w = state.weeks.get(id);
  if (!w) {
    w = m.createWeek(state.settings, id, t);
    state.weeks.set(id, w);
    // Browsing an old empty week shouldn't invent history; it is saved only once edited.
    if (m.dayIndexInWeek(id, t) > 6) state.ephemeral.add(id);
    else markWeek(w);
    return w;
  }
  const changed = m.syncWeekCategories(w, state.settings) | m.freezeBaselineIfStarted(w, t);
  if (changed && !state.ephemeral.has(id)) markWeek(w);
  return w;
}

function savedWeeks() {
  return [...state.weeks.values()].filter((w) => !state.ephemeral.has(w.id)).sort((a, b) => a.id.localeCompare(b.id));
}

function categoryUsed(catId) {
  return savedWeeks().some((w) => m.hasData(w, catId));
}

// ---------- Routing & rendering ----------

function parseRoute() {
  const [, name = 'week', arg] = location.hash.split('/');
  const t = today();
  switch (name) {
    case 'day':
      return { name, arg: /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : t };
    case 'plan':
      return { name, arg: /^\d{4}-W\d{2}$/.test(arg) ? arg : m.isoWeekId(t) };
    case 'settings':
      return { name };
    case 'stats': {
      const id = location.hash.split('/')[3];
      return arg === 'trends'
        ? { name, arg }
        : { name, arg: /^\d{4}-W\d{2}$/.test(id) ? id : m.isoWeekId(t) };
    }
    default:
      return { name: 'week', arg: /^\d{4}-W\d{2}$/.test(arg) ? arg : m.isoWeekId(t) };
  }
}

const app = document.getElementById('app');
const sheetEl = document.getElementById('sheet');
let lastRouteKey = '';

function ctx() {
  return {
    settings: state.settings,
    today: today(),
    ui: state.ui,
    getWeek,
    categoryUsed,
    storageNote: state.storageNote,
    sync: state.sync,
    version: VERSION,
  };
}

function render() {
  if (!state.settings) return; // still booting
  const route = parseRoute();
  const c = ctx();
  let html;
  if (route.name === 'day') html = renderDay(c, route.arg);
  else if (route.name === 'plan') html = renderPlan(c, route.arg);
  else if (route.name === 'settings') html = renderSettings(c);
  else if (route.name === 'stats') html = route.arg === 'trends' ? renderTrends(c, savedWeeks()) : renderWeekReport(c, route.arg);
  else html = renderWeek(c, route.arg);

  app.innerHTML = html + tabBar(route);
  sheetEl.innerHTML = state.ui.sheet ? renderSheet(c, state.ui.sheet) : '';
  document.body.classList.toggle('sheet-open', !!state.ui.sheet);

  const key = `${route.name}/${route.arg ?? ''}`;
  if (key !== lastRouteKey) {
    window.scrollTo(0, 0);
    lastRouteKey = key;
  }
}

function tabBar(route) {
  const t = today();
  const tab = (name, href, label, ic) =>
    `<a class="tab${route.name === name ? ' on' : ''}" href="${href}">${icon(ic)}<span>${label}</span></a>`;
  // Tabs keep the selected week when switching between Week and Plan.
  const weekId = route.name === 'week' || route.name === 'plan' ? route.arg : m.isoWeekId(t);
  return `<nav class="tabbar">
    ${tab('week', `#/week/${weekId}`, 'Неделя', 'week')}
    ${tab('day', '#/day', 'День', 'day')}
    ${tab('plan', `#/plan/${weekId}`, 'План', 'plan')}
    ${tab('stats', `#/stats/week/${weekId}`, 'Аналитика', 'stats')}
    ${tab('settings', '#/settings', 'Настройки', 'settings')}
  </nav>`;
}

// ---------- Editing values ----------

function readValue(a) {
  const d = Number(a.day);
  if (a.layer === 'template') return state.settings.template[a.cat][d];
  const w = getWeek(a.week);
  if (a.layer === 'target') return w.targets[a.cat];
  if (a.layer === 'actual') return m.effective(w, a.cat, d);
  return w.plan[a.cat][d];
}

function writeValue(a, v) {
  const d = Number(a.day);
  if (a.layer === 'template') {
    m.setTemplateCell(state.settings, a.cat, d, v);
    markSettings();
    return;
  }
  const w = getWeek(a.week);
  if (a.layer === 'target') m.setTarget(w, a.cat, v);
  else m.setCell(w, a.layer, a.cat, d, v);
  markWeek(w);
}

// ---------- Actions ----------

const actions = {
  step(a) {
    writeValue(a, readValue(a) + Number(a.delta) * m.STEP);
  },
  'open-row'(a) {
    state.ui.sheet = { layer: a.layer, week: a.week, cat: a.cat, focus: a.focus != null ? Number(a.focus) : null };
  },
  'close-sheet'() {
    state.ui.sheet = null;
  },
  'stats-period'(a) {
    state.ui.statsPeriod = Number(a.period);
  },
  'plan-layer'(a) {
    state.ui.planLayer = a.layer;
  },
  'confirm-day'(a) {
    const w = getWeek(a.week);
    m.confirmDay(w, Number(a.day));
    markWeek(w);
  },
  'clear-day'(a) {
    if (!confirm('Сбросить отметку дня? Введённые фактические часы будут удалены.')) return false;
    const w = getWeek(a.week);
    m.clearDay(w, Number(a.day));
    markWeek(w);
  },
  'apply-template'(a) {
    if (!confirm('Заменить план недели раскладкой из шаблона?')) return false;
    const w = getWeek(a.week);
    m.applyTemplate(w, state.settings);
    markWeek(w);
  },
  'copy-prev'(a) {
    const prev = state.weeks.get(m.shiftWeek(a.week, -1));
    if (!prev || state.ephemeral.has(prev.id)) {
      alert('Прошлой недели нет в истории.');
      return false;
    }
    if (!confirm('Заменить план и цели этой недели значениями прошлой недели?')) return false;
    const w = getWeek(a.week);
    m.copyPlanFrom(w, prev);
    markWeek(w);
  },
  'cat-move'(a) {
    m.moveCategory(state.settings, a.cat, Number(a.dir));
    markSettings();
  },
  'cat-archive'(a) {
    const c = state.settings.categories.find((x) => x.id === a.cat);
    if (!confirm(`Перенести «${c.name}» в архив? История сохранится.`)) return false;
    c.archived = true;
    markSettings();
  },
  'cat-restore'(a) {
    state.settings.categories.find((x) => x.id === a.cat).archived = false;
    markSettings();
  },
  'cat-delete'(a) {
    const c = state.settings.categories.find((x) => x.id === a.cat);
    if (!confirm(`Удалить «${c.name}» навсегда?`)) return false;
    state.settings.categories = state.settings.categories.filter((x) => x.id !== a.cat);
    delete state.settings.template[a.cat];
    for (const w of state.weeks.values()) {
      for (const layer of ['targets', 'plan', 'actual']) delete w[layer][a.cat];
      if (w.baseline) delete w.baseline[a.cat];
      if (!state.ephemeral.has(w.id)) markWeek(w);
    }
    markSettings();
  },
  export: exportData,
  'sync-now'() {
    runSync();
    return false;
  },
  async 'sync-disconnect'() {
    if (!confirm('Отключить синхронизацию на этом устройстве? Данные останутся и здесь, и в GitHub.')) return;
    state.sync = { config: null, status: 'off', message: '', at: 0 };
    await store.saveSyncConfig(null);
    render();
  },
};

// Text inputs commit on change (blur / Enter).
const changeActions = {
  set(a, el) {
    const v = m.parseHours(el.value);
    if (!Number.isNaN(v)) writeValue(a, v);
  },
  'cat-name'(a, el) {
    const name = el.value.trim();
    if (name) state.settings.categories.find((x) => x.id === a.cat).name = name;
    markSettings();
  },
  'cat-color'(a, el) {
    state.settings.categories.find((x) => x.id === a.cat).color = el.value;
    markSettings();
  },
  import(a, el) {
    const file = el.files[0];
    if (file) importData(file);
    return false;
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT' || el.tagName === 'FORM') return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  if (fn(el.dataset, el) !== false) render();
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action]');
  const fn = el && changeActions[el.dataset.action];
  if (fn && fn(el.dataset, el) !== false) render();
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  if (form.dataset.action === 'sync-connect') {
    e.preventDefault();
    connectSync(form);
    return;
  }
  if (form.dataset.action !== 'add-cat') return;
  e.preventDefault();
  const name = form.elements.name.value.trim();
  if (!name) return;
  m.addCategory(state.settings, name, today());
  markSettings();
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.step-val, .name-input')) e.target.blur();
  if (e.key === 'Escape' && state.ui.sheet) {
    state.ui.sheet = null;
    render();
  }
});

// Select the whole number on focus so typing replaces it.
document.addEventListener('focusin', (e) => {
  if (e.target.matches('.step-val')) e.target.select();
});

async function connectSync(form) {
  const [owner, repo] = form.elements.repo.value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '').split('/');
  const token = form.elements.token.value.trim();
  if (!owner || !repo || !token) {
    alert('Укажите репозиторий в виде «имя-пользователя/название» и токен.');
    return;
  }
  const cfg = { owner, repo, token, files: {} };
  const button = form.querySelector('button');
  button.disabled = true;
  button.textContent = 'Проверяю…';
  try {
    const problem = await sync.checkRepo(cfg);
    if (problem) throw new Error(problem);
    await store.saveSyncConfig(cfg);
    state.sync.config = cfg;
    await runSync();
  } catch (e) {
    alert(`Не удалось подключить: ${e.message}`);
    render();
  }
}

// ---------- Export / import ----------

async function exportData() {
  await flush();
  const json = JSON.stringify(m.buildExport(state.settings, savedWeeks()), null, 1);
  const name = `time-allocation-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  // On the phone the share sheet is the reliable way to save to Files or AirDrop to the Mac.
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return false;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return false;
}

async function importData(file) {
  try {
    const data = m.validateImport(JSON.parse(await file.text()));
    const msg = `Файл от ${new Date(data.exportedAt).toLocaleString('ru-RU')}: недель — ${data.weeks.length}.\n\nЗаменить ВСЕ текущие данные на этом устройстве содержимым файла?`;
    if (!confirm(msg)) return;
    await store.replaceAll(data.settings, data.weeks);
    loadState(data.settings, data.weeks);
    render();
    scheduleSync(0);
    alert('Данные импортированы.');
  } catch (e) {
    alert(`Не удалось импортировать: ${e.message}`);
  }
}

// ---------- Boot ----------

function loadState(settings, weeks) {
  state.settings = settings;
  state.weeks = new Map(weeks.map((w) => [w.id, w]));
  state.ephemeral.clear();
  state.ui.sheet = null;
}

async function boot() {
  let settings = await store.loadSettings();
  if (!settings) {
    settings = m.defaultSettings();
    await store.saveSettings(settings);
  }
  loadState(settings, await store.loadWeeks());
  state.sync.config = (await store.loadSyncConfig()) ?? null;
  render();
  runSync();

  const persisted = await store.requestPersistence().catch(() => null);
  state.storageNote = persisted
    ? 'Браузер разрешил постоянное хранение данных.'
    : 'Браузер не гарантирует постоянное хранение — делайте экспорт. На iPhone установите приложение на экран «Домой».';
}

window.addEventListener('hashchange', () => {
  state.ui.sheet = null;
  render();
});
// Re-render when coming back to the app (the day may have changed) and save before leaving.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    render();
    // Pick up edits from the other device when coming back (at most every 30 s).
    if (pendingSync || Date.now() - state.sync.at > 30_000) runSync();
  } else {
    flush();
    if (pendingSync) runSync();
  }
});
window.addEventListener('online', () => runSync());
window.addEventListener('pagehide', flush);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
}

boot().catch((e) => {
  console.error(e);
  app.innerHTML = `<main class="content"><section class="card"><h2>Ошибка запуска</h2><p>${e.message}</p></section></main>`;
});
