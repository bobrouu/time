// Local persistence in IndexedDB: one record for settings, one record per week.

const DB_NAME = 'personal-time-allocation';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('meta');
      db.createObjectStore('weeks', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function loadSettings() {
  return run('meta', 'readonly', (s) => s.get('settings'));
}

export function saveSettings(settings) {
  return run('meta', 'readwrite', (s) => s.put(settings, 'settings'));
}

export function loadWeeks() {
  return run('weeks', 'readonly', (s) => s.getAll());
}

export function saveWeeks(weeks) {
  return run('weeks', 'readwrite', (s) => {
    for (const w of weeks) s.put(w);
  });
}

// Sync settings (repository + token) stay on this device: never exported or synced.
export function loadSyncConfig() {
  return run('meta', 'readonly', (s) => s.get('sync'));
}

export function saveSyncConfig(cfg) {
  return run('meta', 'readwrite', (s) => (cfg ? s.put(cfg, 'sync') : s.delete('sync')));
}

export async function replaceAll(settings, weeks) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['meta', 'weeks'], 'readwrite');
    tx.objectStore('meta').put(settings, 'settings');
    const ws = tx.objectStore('weeks');
    ws.clear();
    for (const w of weeks) ws.put(w);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Asks the browser not to evict our data under storage pressure.
export async function requestPersistence() {
  if (!navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
