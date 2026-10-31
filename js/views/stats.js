// Analytics: a single week's report, and trends + history across finished weeks.

import * as m from '../model.js';
import * as st from '../stats.js';
import { esc, dot, navHeader, data } from '../ui.js';

const PERIODS = [
  [4, '4 нед.'],
  [12, '12 нед.'],
  [0, 'Все'],
];

function modeSwitch(mode, weekId) {
  return `<div class="segmented">
    <a class="${mode === 'week' ? 'on' : ''}" href="#/stats/week/${weekId}">Неделя</a>
    <a class="${mode === 'trends' ? 'on' : ''}" href="#/stats/trends">Тренды</a>
  </div>`;
}

// ---------- Week report ----------

export function renderWeekReport(ctx, weekId) {
  const w = ctx.getWeek(weekId);
  const r = st.weekReport(w, ctx.settings);

  const header = navHeader(
    `Отчёт · неделя ${m.weekNumber(weekId)}`,
    m.fmtWeekRange(weekId),
    `#/stats/week/${m.shiftWeek(weekId, -1)}`,
    `#/stats/week/${m.shiftWeek(weekId, 1)}`,
  );

  const rows = r.rows.map((x) => {
    const tone = x.target > 0 ? (x.diff >= 0 ? 'good' : 'bad') : '';
    return `<tr>
      <th class="cat">${dot(x.cat.color)}<span>${esc(x.cat.name)}</span></th>
      <td>${m.fmtH(x.target)}</td>
      <td class="muted-cell">${m.fmtH(x.baseline)}</td>
      <td class="muted-cell">${m.fmtH(x.plan)}</td>
      <td><b>${m.fmtH(x.actual)}</b></td>
      <td class="${tone}">${x.diff > 0 ? '+' : ''}${m.fmtH(x.diff)}</td>
    </tr>`;
  }).join('');

  const body = r.recordedDays === 0
    ? `<section class="card empty"><p>В этой неделе ещё нет отмеченных дней.</p>
        <p class="hint">Отмечайте факт на экране «День» — здесь появится сравнение с планом.</p></section>`
    : `<section class="card stats-grid">
        ${stat('Выполнение целей', st.pct(r.completion), r.recordedDays < 7 ? 'неотмеченные дни = 0 ч' : 'по каждой цели')}
        ${stat('Точность плана', st.pct(r.accuracy), `отклонение ${m.fmtH(r.deviation)} ч`)}
        ${stat('Отмечено', `${r.recordedDays}<small> / 7</small>`, 'дней')}
        ${stat('Свободно (факт)', `${m.fmtH(r.freeActual)}<small> ч</small>`, `за ${r.recordedDays} дн.`)}
      </section>
      <section class="card grid-wrap">
        <table class="grid report">
          <thead><tr><th class="corner"></th><th>Цель</th><th>Исх.</th><th>План</th><th>Факт</th><th>Δ</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
      <p class="hint"><b>Исх.</b> — план, зафиксированный в начале недели${r.hasBaseline ? '' : ' (ещё не зафиксирован — показан текущий)'}.
      <b>Точность плана</b> — насколько отмеченные дни совпали с исходным планом: каждый час,
      сделанный не там или не тогда, уменьшает её. <b>Выполнение</b> считается по каждой цели отдельно:
      перевыполнение одной категории не компенсирует недобор в другой.</p>`;

  return `${header}
  <main class="content">
    ${modeSwitch('week', weekId)}
    ${body}
  </main>`;
}

const round1 = (v) => Math.round(v * 10) / 10;

function stat(label, value, sub) {
  return `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span><span class="stat-sub">${sub}</span></div>`;
}

// ---------- Trends & history ----------

export function renderTrends(ctx, weeks) {
  const period = ctx.ui.statsPeriod;
  const t = st.trends(weeks, ctx.settings, ctx.today, period || undefined);
  const finished = st.finishedWeeks(weeks, ctx.today);
  const currentWeek = m.isoWeekId(ctx.today);

  const header = `<header class="topbar"><div class="topbar-title"><h1>Тренды</h1><p>завершённые недели с отметками</p></div></header>`;
  const chips = `<div class="chips">${PERIODS.map(([n, label]) =>
    `<button class="chip${period === n ? ' on' : ''}" ${data({ action: 'stats-period', period: n })}>${label}</button>`).join('')}</div>`;

  if (t.weeks === 0) {
    return `${header}<main class="content">${modeSwitch('trends', currentWeek)}
      <section class="card empty"><p>Тренды появятся после первой завершённой недели с отмеченными днями.</p>
      <p class="hint">Отчёт по текущей неделе доступен во вкладке «Неделя» выше.</p></section></main>`;
  }

  const cats = t.categories.map((c) => `<section class="card trend">
      <div class="cat-head">
        <span class="cat-name">${dot(c.cat.color)}${esc(c.cat.name)}${c.cat.archived ? ' <span class="plan-note">архив</span>' : ''}</span>
        <span class="cat-nums"><b>${m.fmtH(round1(c.avgActual))}</b> / ${m.fmtH(round1(c.avgTarget))} ч</span>
      </div>
      ${sparkline(c.series, c.cat.color)}
      <div class="cat-status">в среднем за неделю${c.targetWeeks ? ` · цель выполнена ${c.metWeeks} из ${c.targetWeeks} нед.` : ''}</div>
    </section>`).join('');

  const history = finished.map((w) => {
    const r = st.weekReport(w, ctx.settings);
    return `<a class="history-row" href="#/stats/week/${w.id}">
      <span><b>Неделя ${m.weekNumber(w.id)}</b> <span class="muted">${m.fmtWeekRange(w.id)}${w.id.slice(0, 4) !== ctx.today.slice(0, 4) ? ` ${w.id.slice(0, 4)}` : ''}</span></span>
      <span class="muted">${r.recordedDays}/7 дн.</span>
      <b class="${r.completion >= 0.95 ? 'good' : r.completion < 0.8 ? 'bad' : ''}">${st.pct(r.completion)}</b>
    </a>`;
  }).join('');

  return `${header}
  <main class="content">
    ${modeSwitch('trends', currentWeek)}
    ${chips}
    <section class="card stats-grid">
      ${stat('Выполнение целей', st.pct(t.avgCompletion), 'в среднем')}
      ${stat('Точность плана', st.pct(t.avgAccuracy), 'в среднем')}
    </section>
    <section class="card">
      <div class="card-head"><h2>Выполнение по неделям</h2><span class="muted">${t.weeks} нед.</span></div>
      ${completionChart(t.completionSeries)}
    </section>
    <div class="stack">${cats}</div>
    <section class="card">
      <div class="card-head"><h2>История</h2><span class="muted">${finished.length} нед.</span></div>
      <div class="history">${history}</div>
    </section>
  </main>`;
}

// Bars of actual hours per week with a tick at that week's target.
function sparkline(series, color) {
  const slots = Math.max(series.length, 8);
  const offset = slots - series.length; // right-align so the newest week is always at the edge
  const max = Math.max(1, ...series.map((s) => Math.max(s.actual, s.target)));
  const H = 40;
  const bars = series.map((s, i) => {
    if (!s.present) return '';
    const x = (offset + i) * 10 + 2;
    const h = (s.actual / max) * H;
    const ty = H - (s.target / max) * H;
    return `<g><title>Неделя ${m.weekNumber(s.weekId)}: ${m.fmtH(s.actual)} из ${m.fmtH(s.target)} ч</title>
      <rect x="${x}" y="${(H - h).toFixed(2)}" width="6" height="${Math.max(h, 0.5).toFixed(2)}" rx="1.5" fill="${esc(color)}"/>
      ${s.target > 0 ? `<line x1="${x - 1}" x2="${x + 7}" y1="${ty.toFixed(2)}" y2="${ty.toFixed(2)}" class="tick"/>` : ''}</g>`;
  }).join('');
  return `<svg class="spark" viewBox="0 0 ${slots * 10} ${H}" preserveAspectRatio="none" role="img" aria-label="Часы по неделям">${bars}</svg>`;
}

function completionChart(series) {
  const slots = Math.max(series.length, 8);
  const offset = slots - series.length;
  const H = 60;
  const top = 1.2; // chart ceiling = 120%
  const y100 = H - (1 / top) * H;
  const bars = series.map((s, i) => {
    const v = Math.min(s.value ?? 0, top);
    const h = (v / top) * H;
    const x = (offset + i) * 10 + 2;
    return `<g><title>Неделя ${m.weekNumber(s.weekId)}: ${st.pct(s.value)}</title>
      <rect x="${x}" y="${(H - h).toFixed(2)}" width="6" height="${Math.max(h, 0.5).toFixed(2)}" rx="1.5" class="${(s.value ?? 0) >= 0.95 ? 'ok' : 'low'}"/></g>`;
  }).join('');
  const labels = series.map((s, i) => `<span style="grid-column:${offset + i + 1}">${m.weekNumber(s.weekId)}</span>`).join('');
  return `<svg class="spark completion" viewBox="0 0 ${slots * 10} ${H}" preserveAspectRatio="none" role="img" aria-label="Выполнение целей по неделям">
      <line x1="0" x2="${slots * 10}" y1="${y100.toFixed(2)}" y2="${y100.toFixed(2)}" class="tick dashed"/>${bars}</svg>
    <div class="spark-labels" style="grid-template-columns:repeat(${slots},1fr)">${labels}</div>
    <p class="hint">Пунктир — 100% целей. Номера — недели года.</p>`;
}
