// Pure data model and calculations. No DOM, no storage — everything here is unit-tested.
//
// A week holds per-category arrays of 7 numbers (Monday..Sunday):
//   targets[cat]  – weekly goal in hours
//   plan[cat]     – current plan, freely edited
//   baseline[cat] – copy of the plan frozen when the week starts (null before Monday)
//   actual[cat]   – recorded hours; null means the day has not been recorded yet
// A day is "recorded" when its actual values are filled for every category at once.

export const WEEK_HOURS = 168;
export const DAY_HOURS = 24;
export const STEP = 0.5;
export const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const DAY_NAMES_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export const PALETTE = [
  '#2f7de1', '#e8833a', '#9b5de5', '#2bb673', '#d4a72c', '#5b6b8c',
  '#e0457b', '#14a3b8', '#8a6d3b', '#6c8f2f', '#c2410c', '#64748b',
];

// ---------- Dates (local calendar dates as 'YYYY-MM-DD'; noon avoids DST edge cases) ----------

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function fmtDate(dt) {
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function todayStr(now = new Date()) {
  return fmtDate(now);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

export function weekdayIndex(s) {
  return (parseDate(s).getDay() + 6) % 7;
}

export function mondayOf(s) {
  return addDays(s, -weekdayIndex(s));
}

export function isoWeekId(s) {
  const thursday = addDays(s, 3 - weekdayIndex(s));
  const year = parseDate(thursday).getFullYear();
  const week1 = mondayOf(fmtDate(new Date(year, 0, 4, 12)));
  const week = Math.round((parseDate(mondayOf(s)) - parseDate(week1)) / (7 * 864e5)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function weekStart(weekId) {
  const [y, w] = weekId.split('-W').map(Number);
  return addDays(mondayOf(fmtDate(new Date(y, 0, 4, 12))), (w - 1) * 7);
}

export function shiftWeek(weekId, n) {
  return isoWeekId(addDays(weekStart(weekId), n * 7));
}

export function weekNumber(weekId) {
  return Number(weekId.split('-W')[1]);
}

export function fmtDayMonth(s) {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtWeekRange(weekId) {
  const start = weekStart(weekId);
  const end = addDays(start, 6);
  const a = parseDate(start);
  const b = parseDate(end);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${fmtDayMonth(start)} – ${fmtDayMonth(end)}`;
}

// Index of `today` inside the week: <0 if the week is in the future, >6 if it is in the past.
export function dayIndexInWeek(weekId, today) {
  return Math.round((parseDate(today) - parseDate(weekStart(weekId))) / 864e5);
}

// ---------- Hours ----------

export function roundHours(v) {
  return Math.round(v * 4) / 4;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Accepts "6", "6,5", "6.25", "1:30". Returns NaN for anything else.
export function parseHours(str) {
  const s = String(str).trim().replace(',', '.');
  if (s === '') return NaN;
  const hm = s.match(/^(\d{1,3}):(\d{1,2})$/);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  return /^\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

export function fmtH(v) {
  if (v == null || Number.isNaN(v)) return '–';
  const r = Math.round(v * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r).replace('.', ',');
}

export function sum(arr) {
  let t = 0;
  for (const v of arr) t += v ?? 0;
  return t;
}

// ---------- Settings ----------

export function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultSettings() {
  const cat = (id, name, color, row) => ({ id, name, color, createdAt: '2000-01-01', archived: false, row });
  const cats = [
    cat('main', 'Основная работа', PALETTE[0], [6, 6, 6, 6, 6, 0, 0]),
    cat('dispatch', 'Диспетчерская работа', PALETTE[1], [6, 6, 6, 6, 6, 0, 0]),
    cat('study', 'Учёба PM', PALETTE[2], [2, 2, 2, 2, 2, 2, 2]),
    cat('gym', 'Спортзал', PALETTE[3], [0, 0, 2, 0, 0, 2, 2]),
    // Weekdays are already 24h without the gym, so routine gives way on the weekday gym day.
    cat('routine', 'Рутина', PALETTE[4], [2, 2, 0, 2, 2, 3, 3]),
    cat('sleep', 'Сон', PALETTE[5], [8, 8, 8, 8, 8, 8, 8]),
  ];
  return {
    version: 1,
    categories: cats.map(({ row, ...c }) => c),
    template: Object.fromEntries(cats.map((c) => [c.id, c.row])),
  };
}

export function activeCategories(settings) {
  return settings.categories.filter((c) => !c.archived);
}

export function addCategory(settings, name, today) {
  const used = new Set(settings.categories.map((c) => c.color));
  const color = PALETTE.find((p) => !used.has(p)) ?? PALETTE[settings.categories.length % PALETTE.length];
  const c = { id: uid(), name, color, createdAt: today, archived: false };
  settings.categories.push(c);
  settings.template[c.id] = [0, 0, 0, 0, 0, 0, 0];
  return c;
}

export function moveCategory(settings, id, dir) {
  const list = settings.categories;
  const i = list.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

export function templateTarget(settings, catId) {
  return sum(settings.template[catId] ?? []);
}

// ---------- Weeks ----------

// Every user edit stamps the cells it touches ("layer|cat|day" or "targets|cat") so that
// two devices editing the same week can be merged cell by cell — the later edit wins.
let lastStamp = 0;
function nowStamp() {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

function stamp(week, key) {
  (week.stamps ??= {})[key] = nowStamp();
}

const zeros = () => [0, 0, 0, 0, 0, 0, 0];
const nulls = () => [null, null, null, null, null, null, null];

export function createWeek(settings, weekId, today) {
  const week = {
    id: weekId, start: weekStart(weekId), targets: {}, plan: {}, actual: {}, baseline: null,
    stamps: {}, createdAt: Date.now(), updatedAt: 0,
  };
  for (const c of activeCategories(settings)) {
    const row = settings.template[c.id] ?? zeros();
    week.targets[c.id] = sum(row);
    week.plan[c.id] = [...row];
    week.actual[c.id] = nulls();
  }
  freezeBaselineIfStarted(week, today);
  return week;
}

// Fills the week's plan from the template (keeps targets and recorded actuals).
export function applyTemplate(week, settings) {
  for (const id of Object.keys(week.plan)) {
    week.plan[id] = [...(settings.template[id] ?? zeros())];
    for (let d = 0; d < 7; d++) stamp(week, `plan|${id}|${d}`);
  }
}

// Copies another week's plan for categories both weeks share.
export function copyPlanFrom(week, source) {
  for (const id of Object.keys(week.plan)) {
    if (source.plan[id]) {
      week.plan[id] = [...source.plan[id]];
      for (let d = 0; d < 7; d++) stamp(week, `plan|${id}|${d}`);
    }
    if (source.targets[id] != null) {
      week.targets[id] = source.targets[id];
      stamp(week, `targets|${id}`);
    }
  }
}

export function freezeBaselineIfStarted(week, today) {
  if (week.baseline || today < week.start) return false;
  week.baseline = Object.fromEntries(Object.entries(week.plan).map(([id, row]) => [id, [...row]]));
  return true;
}

// Adds rows for categories created after the week was made. Returns true if anything changed.
export function syncWeekCategories(week, settings) {
  const weekEnd = addDays(week.start, 6);
  let changed = false;
  for (const c of activeCategories(settings)) {
    if (c.id in week.targets || c.createdAt > weekEnd) continue;
    week.targets[c.id] = 0;
    week.plan[c.id] = zeros();
    week.actual[c.id] = DAY_NAMES.map((_, d) => (isRecorded(week, d) ? 0 : null));
    if (week.baseline) week.baseline[c.id] = zeros();
    changed = true;
  }
  return changed;
}

export function hasData(week, catId) {
  return (week.targets[catId] ?? 0) > 0 || sum(week.plan[catId] ?? []) > 0 || sum(week.actual[catId] ?? []) > 0;
}

export function visibleCategories(week, settings) {
  return settings.categories.filter((c) => c.id in week.targets && (!c.archived || hasData(week, c.id)));
}

export function isRecorded(week, d) {
  return Object.values(week.actual).some((row) => row[d] != null);
}

export function recordedCount(week) {
  return DAY_NAMES.filter((_, d) => isRecorded(week, d)).length;
}

function materializeDay(week, d) {
  for (const id of Object.keys(week.actual)) {
    week.actual[id][d] = week.plan[id][d];
    stamp(week, `actual|${id}|${d}`);
  }
}

// A day never holds more than 24 hours. Increases stop at the free room left in the day;
// decreases are always allowed (so an already overfull day can be fixed).
function capToDay(current, value, others) {
  const v = clamp(roundHours(value), 0, DAY_HOURS);
  if (v <= current) return v;
  return Math.min(v, Math.max(current, DAY_HOURS - others));
}

function othersInDay(rows, catId, d) {
  let t = 0;
  for (const [id, row] of Object.entries(rows)) if (id !== catId) t += row[d] ?? 0;
  return t;
}

// Free hours left in a day of the plan/actual layer (actual falls back to plan when unrecorded).
export function dayRoom(week, layer, d) {
  let t = 0;
  for (const id of Object.keys(week.plan)) t += layer === 'actual' ? effective(week, id, d) : week.plan[id][d];
  return DAY_HOURS - t;
}

export function setCell(week, layer, catId, d, value) {
  if (layer === 'actual' && !isRecorded(week, d)) materializeDay(week, d);
  const rows = week[layer];
  rows[catId][d] = capToDay(rows[catId][d] ?? 0, value, othersInDay(rows, catId, d));
  stamp(week, `${layer}|${catId}|${d}`);
}

export function templateRoom(settings, d) {
  return DAY_HOURS - sum(activeCategories(settings).map((c) => settings.template[c.id]?.[d] ?? 0));
}

export function setTemplateCell(settings, catId, d, value) {
  const rows = Object.fromEntries(activeCategories(settings).map((c) => [c.id, settings.template[c.id]]));
  settings.template[catId][d] = capToDay(settings.template[catId][d], value, othersInDay(rows, catId, d));
}

export function setTarget(week, catId, value) {
  week.targets[catId] = clamp(roundHours(value), 0, WEEK_HOURS);
  stamp(week, `targets|${catId}`);
}

export function confirmDay(week, d) {
  if (!isRecorded(week, d)) materializeDay(week, d);
}

export function clearDay(week, d) {
  for (const id of Object.keys(week.actual)) {
    week.actual[id][d] = null;
    stamp(week, `actual|${id}|${d}`);
  }
}

// What the day most likely looks like: recorded actuals, otherwise the plan.
export function effective(week, catId, d) {
  return isRecorded(week, d) ? week.actual[catId][d] : week.plan[catId][d];
}

export function dayTotal(week, layer, d, cats) {
  let t = 0;
  for (const c of cats) {
    t += layer === 'effective' ? effective(week, c.id, d) : week[layer][c.id]?.[d] ?? 0;
  }
  return t;
}

export function weekTotal(week, layer, cats) {
  let t = 0;
  for (let d = 0; d < 7; d++) t += dayTotal(week, layer, d, cats);
  return t;
}

// Days still open for this category's remaining hours: unrecorded days from today onwards.
export function openDays(week, today) {
  const from = clamp(dayIndexInWeek(week.id, today), 0, 7);
  const out = [];
  for (let d = from; d < 7; d++) if (!isRecorded(week, d)) out.push(d);
  return out;
}

export function categoryProgress(week, catId, today) {
  const target = week.targets[catId] ?? 0;
  const planned = sum(week.plan[catId]);
  const actual = sum(week.actual[catId]);
  let forecast = 0;
  for (let d = 0; d < 7; d++) forecast += effective(week, catId, d);
  const remaining = Math.max(0, target - actual);
  const days = openDays(week, today).length;
  return {
    target,
    planned,
    actual,
    forecast,
    remaining,
    daysLeft: days,
    perDay: days > 0 ? remaining / days : null,
    shortfall: Math.max(0, target - forecast), // hours the current plan will not cover
    surplus: Math.max(0, forecast - target),
  };
}

export function weekSummary(week, settings, today) {
  const cats = visibleCategories(week, settings);
  const planned = weekTotal(week, 'plan', cats);
  const forecast = weekTotal(week, 'effective', cats);
  const target = sum(cats.map((c) => week.targets[c.id] ?? 0));
  return {
    target,
    planned,
    forecast,
    freeTarget: WEEK_HOURS - target,
    freePlanned: WEEK_HOURS - planned,
    freeForecast: WEEK_HOURS - forecast,
    recordedDays: recordedCount(week),
    overloadedDays: DAY_NAMES.map((_, d) => d).filter((d) => dayTotal(week, 'effective', d, cats) > DAY_HOURS),
  };
}

// ---------- Merging two copies (sync) ----------

const clone = (x) => JSON.parse(JSON.stringify(x));

// Merges two copies of the same week. Unedited cells come from the copy created first
// (its frozen baseline is the real one); every stamped cell takes the most recent edit.
export function mergeWeek(a, b) {
  if (!a) return clone(b);
  if (!b) return clone(a);
  const [first, second] = (a.createdAt ?? 0) <= (b.createdAt ?? 0) ? [a, b] : [b, a];
  const out = clone(first);
  out.baseline ??= second.baseline ? clone(second.baseline) : null;
  out.stamps = { ...(first.stamps ?? {}) };
  for (const [key, ts] of Object.entries(second.stamps ?? {})) {
    if (ts <= (out.stamps[key] ?? 0)) continue;
    out.stamps[key] = ts;
    const [layer, cat, d] = key.split('|');
    if (layer === 'targets') {
      out.targets[cat] = second.targets[cat];
    } else {
      out[layer][cat] ??= layer === 'actual' ? nulls() : zeros();
      out[layer][cat][Number(d)] = second[layer][cat]?.[Number(d)] ?? (layer === 'actual' ? null : 0);
    }
  }
  // Rows only one copy has (a category added on one device).
  for (const layer of ['targets', 'plan', 'actual']) {
    for (const cat of Object.keys(second[layer])) {
      if (!(cat in out[layer])) out[layer][cat] = clone(second[layer][cat]);
    }
  }
  if (out.baseline && second.baseline) {
    for (const cat of Object.keys(second.baseline)) out.baseline[cat] ??= clone(second.baseline[cat]);
  }
  out.updatedAt = Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0);
  return out;
}

// Settings change rarely; the most recently edited copy wins as a whole.
export function mergeSettings(a, b) {
  if (!a) return clone(b);
  if (!b) return clone(a);
  return clone((b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a);
}

// JSON with object keys sorted, so equal data always serialises identically.
export function canonicalJSON(x) {
  return JSON.stringify(x, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v);
}

export function sameData(a, b) {
  return canonicalJSON(a) === canonicalJSON(b);
}

// ---------- Export / import ----------

export function buildExport(settings, weeks) {
  return { app: 'personal-time-allocation', format: 1, exportedAt: new Date().toISOString(), settings, weeks };
}

export function validateImport(data) {
  if (!data || data.app !== 'personal-time-allocation') throw new Error('Это не файл экспорта этого приложения');
  if (data.format !== 1) throw new Error(`Неизвестная версия файла: ${data.format}`);
  if (!data.settings?.categories || !Array.isArray(data.weeks)) throw new Error('Файл повреждён');
  for (const w of data.weeks) {
    if (!/^\d{4}-W\d{2}$/.test(w.id) || !w.plan || !w.actual || !w.targets) throw new Error(`Повреждена неделя ${w.id}`);
  }
  return data;
}
