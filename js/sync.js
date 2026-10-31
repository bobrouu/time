// Sync through a private GitHub repository you own, using the GitHub REST "contents" API.
//
// Repository layout (plain JSON, readable on github.com; every sync is a commit = history):
//   data/settings.json      categories + template
//   data/weeks-2026.json    all weeks of one ISO year
//
// Each device keeps a full local copy. A sync downloads only files that changed since this
// device last saw them, merges them cell by cell (model.mergeWeek), and uploads the result.

import * as m from './model.js';

const API = 'https://api.github.com';
const DIR = 'data';

export class SyncError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function client(cfg, fetchImpl) {
  const base = `${API}/repos/${cfg.owner}/${cfg.repo}`;
  async function call(method, path, body) {
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SyncError('Нет связи с GitHub', 0);
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const msg = {
        401: 'Токен недействителен или истёк — создайте новый',
        403: 'Нет доступа: проверьте права токена (Contents: Read and write) или лимит запросов',
        409: 'conflict',
        422: 'conflict',
      }[res.status];
      throw new SyncError(msg ?? `GitHub ответил ${res.status}: ${text.slice(0, 120)}`, res.status);
    }
    return res.json();
  }
  return {
    repo: () => call('GET', ''),
    list: async () => {
      const items = await call('GET', `/contents/${DIR}`);
      return Object.fromEntries((Array.isArray(items) ? items : []).map((f) => [f.name, f.sha]));
    },
    get: async (name) => {
      const f = await call('GET', `/contents/${DIR}/${name}`);
      return f ? JSON.parse(fromBase64(f.content)) : null;
    },
    put: async (name, obj, sha) => {
      const res = await call('PUT', `/contents/${DIR}/${name}`, {
        message: `Sync ${name}`,
        content: toBase64(JSON.stringify(obj, null, 1)),
        ...(sha ? { sha } : {}),
      });
      return res.content.sha;
    },
  };
}

export function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16);
}

// Checks the repository before the first sync. Returns a user-facing problem or null.
export async function checkRepo(cfg, fetchImpl = fetch) {
  const repo = await client(cfg, fetchImpl).repo();
  if (!repo) return 'Репозиторий не найден, или у токена нет к нему доступа';
  if (!repo.private) return 'Репозиторий публичный — ваши данные были бы видны всем. Сделайте его приватным';
  if (repo.permissions && !repo.permissions.push) return 'У токена нет права записи (Contents: Read and write)';
  return null;
}

function weeksFile(year) {
  return `weeks-${year}.json`;
}

function mergeWeekLists(a = [], b = []) {
  const map = new Map(a.map((w) => [w.id, w]));
  for (const w of b) map.set(w.id, m.mergeWeek(map.get(w.id), w));
  return [...map.values()].sort((x, y) => x.id.localeCompare(y.id));
}

// One sync pass. `cfg.files` remembers, per file, the remote sha and the hash of the data
// this device last synced, so unchanged files cost a single directory listing.
// Returns the merged data; the caller merges it into its live state.
export async function syncOnce(cfg, local, fetchImpl = fetch) {
  const api = client(cfg, fetchImpl);
  const remote = await api.list();
  const files = { ...(cfg.files ?? {}) };

  const byYear = new Map();
  for (const w of local.weeks) {
    const y = w.id.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(w);
  }
  for (const name of Object.keys(remote)) {
    const y = name.match(/^weeks-(\d{4})\.json$/)?.[1];
    if (y && !byYear.has(y)) byYear.set(y, []);
  }

  const jobs = [['settings.json', local.settings, (a, b) => m.mergeSettings(a, b)]];
  for (const [y, weeks] of [...byYear].sort()) {
    jobs.push([weeksFile(y), { weeks: [...weeks].sort((a, b) => a.id.localeCompare(b.id)) },
      (a, b) => ({ weeks: mergeWeekLists(a.weeks, b.weeks) })]);
  }

  const out = { settings: local.settings, weeks: [] };
  let uploaded = 0;
  for (const [name, localObj, merge] of jobs) {
    const known = files[name] ?? {};
    const remoteSha = remote[name];
    const localHash = hash(m.canonicalJSON(localObj));
    let merged = localObj;

    if (remoteSha && remoteSha === known.sha && localHash === known.hash) {
      // nothing changed on either side
    } else {
      const remoteObj = remoteSha && remoteSha !== known.sha ? await api.get(name) : null;
      merged = remoteObj ? merge(localObj, remoteObj) : localObj;
      let sha = remoteSha;
      // Upload unless the remote copy already holds exactly the merged data.
      if (!remoteObj || !m.sameData(merged, remoteObj)) {
        sha = await api.put(name, merged, remoteSha);
        uploaded++;
      }
      files[name] = { sha, hash: hash(m.canonicalJSON(merged)) };
    }

    if (name === 'settings.json') out.settings = merged;
    else out.weeks.push(...merged.weeks);
  }
  return { ...out, files, uploaded };
}

// Retries when another device committed between our read and write.
export async function sync(cfg, local, fetchImpl = fetch) {
  let files = cfg.files;
  for (let attempt = 0; ; attempt++) {
    try {
      return await syncOnce({ ...cfg, files }, local, fetchImpl);
    } catch (e) {
      if (e.status === 409 || e.status === 422) {
        if (attempt >= 2) throw new SyncError('Не удалось синхронизировать: данные одновременно меняются на другом устройстве', e.status);
        files = {}; // forget cached shas and re-read everything
        continue;
      }
      throw e;
    }
  }
}
