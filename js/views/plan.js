// Week grid: days × categories, for the plan or for recorded actuals.

import * as m from '../model.js';
import { esc, dot, navHeader, data } from '../ui.js';

export function renderPlan(ctx, weekId) {
  const { settings, today } = ctx;
  const layer = ctx.ui.planLayer;
  const w = ctx.getWeek(weekId);
  const cats = m.visibleCategories(w, settings);
  const sum = m.weekSummary(w, settings, today);

  const header = navHeader(
    `План · неделя ${m.weekNumber(weekId)}`,
    m.fmtWeekRange(weekId),
    `#/plan/${m.shiftWeek(weekId, -1)}`,
    `#/plan/${m.shiftWeek(weekId, 1)}`,
  );

  const cell = (c, d) => {
    let v;
    let cls = '';
    if (layer === 'actual') {
      const rec = m.isRecorded(w, d);
      v = rec ? w.actual[c.id][d] : w.plan[c.id][d];
      if (!rec) cls = 'ghost';
    } else {
      v = w.plan[c.id][d];
    }
    return `<td class="${cls}" ${data({ action: 'open-row', layer, week: w.id, cat: c.id, focus: d })}>${v ? m.fmtH(v) : '<span class="zero">·</span>'}</td>`;
  };

  const rowTotal = (c) => (layer === 'actual' ? m.sum(w.actual[c.id]) : m.sum(w.plan[c.id]));
  const dayHead = m.DAY_NAMES.map((n, d) => {
    const date = m.addDays(w.start, d);
    return `<th class="${date === today ? 'today' : ''}">${n}<small>${m.parseDate(date).getDate()}</small></th>`;
  }).join('');
  const dayTotals = m.DAY_NAMES.map((_, d) => {
    const t = layer === 'actual' ? m.dayTotal(w, 'effective', d, cats) : m.dayTotal(w, 'plan', d, cats);
    return `<td class="${t > m.DAY_HOURS ? 'over' : ''}">${m.fmtH(t)}</td>`;
  }).join('');
  const grand = layer === 'actual' ? m.weekTotal(w, 'actual', cats) : sum.planned;

  return `${header}
  <main class="content">
    <div class="segmented" role="tablist">
      <button class="${layer === 'plan' ? 'on' : ''}" data-action="plan-layer" data-layer="plan">План</button>
      <button class="${layer === 'actual' ? 'on' : ''}" data-action="plan-layer" data-layer="actual">Факт</button>
    </div>
    <div class="grid-wrap card">
      <table class="grid">
        <thead><tr><th class="corner"></th>${dayHead}<th class="tot">Σ</th></tr></thead>
        <tbody>
          ${cats.map((c) => {
            const t = rowTotal(c);
            const target = w.targets[c.id];
            const off = layer === 'plan' && Math.abs(t - target) > 0.001;
            return `<tr>
              <th class="cat" ${data({ action: 'open-row', layer, week: w.id, cat: c.id })}>${dot(c.color)}<span>${esc(c.name)}</span></th>
              ${m.DAY_NAMES.map((_, d) => cell(c, d)).join('')}
              <td class="tot${off ? ' off' : ''}">${m.fmtH(t)}<small>/${m.fmtH(target)}</small></td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot><tr><th class="cat">Итого</th>${dayTotals}<td class="tot">${m.fmtH(grand)}<small>/${m.fmtH(sum.target)}</small></td></tr></tfoot>
      </table>
    </div>
    ${layer === 'actual'
      ? '<p class="hint">Бледные значения — неотмеченные дни (показан план). Нажмите на ячейку, чтобы отметить.</p>'
      : '<p class="hint">Нажмите на ячейку или категорию, чтобы изменить часы и цель недели.</p>'}
    <section class="card">
      <div class="mini-row"><span>Свободно по плану</span><b class="${sum.freePlanned < 0 ? 'bad' : ''}">${m.fmtH(sum.freePlanned)} ч</b></div>
      <div class="mini-row"><span>Свободно по целям</span><b>${m.fmtH(sum.freeTarget)} ч</b></div>
      <p class="hint">${w.baseline
        ? 'Исходный план недели зафиксирован — дальнейшие правки сравниваются с ним.'
        : 'Исходный план зафиксируется автоматически в понедельник.'}</p>
    </section>
    ${layer === 'plan' ? `<div class="btn-row">
      <button class="btn ghost" data-action="apply-template" data-week="${w.id}">Заполнить из шаблона</button>
      <button class="btn ghost" data-action="copy-prev" data-week="${w.id}">Как прошлая неделя</button>
    </div>` : ''}
  </main>`;
}
