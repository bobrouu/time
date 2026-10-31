// Bottom sheet that edits one category across a whole week (plan, actual or template).

import * as m from '../model.js';
import { esc, dot, stepper, icon } from '../ui.js';

const TITLES = { plan: 'План', actual: 'Факт', template: 'Шаблон недели' };

export function renderSheet(ctx, sheet) {
  const { settings } = ctx;
  const c = settings.categories.find((x) => x.id === sheet.cat);
  if (!c) return '';
  const isTemplate = sheet.layer === 'template';
  const w = isTemplate ? null : ctx.getWeek(sheet.week);

  const value = (d) => {
    if (isTemplate) return settings.template[c.id][d];
    if (sheet.layer === 'actual') return m.effective(w, c.id, d);
    return w.plan[c.id][d];
  };
  const values = m.DAY_NAMES.map((_, d) => value(d));
  const total = m.sum(values);
  const target = isTemplate ? total : w.targets[c.id];

  const rows = m.DAY_NAMES.map((name, d) => {
    const date = w ? m.addDays(w.start, d) : null;
    const muted = sheet.layer === 'actual' && !m.isRecorded(w, d);
    const room = isTemplate ? m.templateRoom(settings, d) : m.dayRoom(w, sheet.layer, d);
    const attrs = isTemplate
      ? { layer: 'template', cat: c.id, day: d }
      : { layer: sheet.layer, week: w.id, cat: c.id, day: d };
    return `<div class="edit-row${sheet.focus === d ? ' focus' : ''}">
      <span>${name}${date ? ` <span class="muted">${m.parseDate(date).getDate()}</span>` : ''}${muted ? ' <span class="plan-note">не отмечен</span>' : ''}${room <= 0 ? ' <span class="plan-note">день заполнен</span>' : ''}</span>
      ${stepper(values[d], attrs, { muted, label: `${c.name}, ${name}`, full: room <= 0 })}
    </div>`;
  }).join('');

  let targetBlock = '';
  if (sheet.layer === 'plan') {
    targetBlock = `<div class="edit-row target-row">
      <span><b>Цель недели</b></span>
      ${stepper(target, { layer: 'target', week: w.id, cat: c.id }, { label: `Цель недели, ${c.name}` })}
    </div>`;
  }

  let balance;
  const diff = total - target;
  if (isTemplate) balance = `Цель новых недель: <b>${m.fmtH(total)} ч</b>`;
  else if (Math.abs(diff) < 0.001) balance = `<span class="good">${icon('check')} ${m.fmtH(total)} ч = цель</span>`;
  else if (diff < 0) balance = `${m.fmtH(total)} из ${m.fmtH(target)} ч · <span class="bad">не хватает ${m.fmtH(-diff)}</span>`;
  else balance = `${m.fmtH(total)} из ${m.fmtH(target)} ч · <span class="warn-text">+${m.fmtH(diff)} сверх цели</span>`;

  const sub = isTemplate ? 'основа для каждой новой недели' : `неделя ${m.weekNumber(w.id)}, ${m.fmtWeekRange(w.id)}`;

  return `<div class="sheet-backdrop" data-action="close-sheet"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(c.name)}">
    <div class="sheet-head">
      <div><h2>${dot(c.color)}${esc(c.name)}</h2><p class="muted">${TITLES[sheet.layer]} · ${sub}</p></div>
      <button class="icon-btn" data-action="close-sheet" aria-label="Закрыть">${icon('close')}</button>
    </div>
    <div class="sheet-body">
      ${targetBlock}
      ${rows}
    </div>
    <div class="sheet-foot">
      <span>${balance}</span>
      <button class="btn primary small" data-action="close-sheet">Готово</button>
    </div>
  </div>`;
}
