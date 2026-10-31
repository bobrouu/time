// Evening screen: record what actually happened today and adjust tomorrow's plan.

import * as m from '../model.js';
import { esc, dot, stepper, navHeader, icon } from '../ui.js';

export function renderDay(ctx, date) {
  const { settings, today } = ctx;
  const w = ctx.getWeek(m.isoWeekId(date));
  const d = m.weekdayIndex(date);
  const cats = m.visibleCategories(w, settings);
  const isFuture = date > today;

  const rel = { [today]: 'сегодня', [m.addDays(today, -1)]: 'вчера', [m.addDays(today, 1)]: 'завтра' }[date];
  const header = navHeader(
    m.DAY_NAMES_FULL[d],
    `${m.fmtDayMonth(date)}${rel ? ` · ${rel}` : ''}`,
    `#/day/${m.addDays(date, -1)}`,
    `#/day/${m.addDays(date, 1)}`,
  );

  const body = isFuture
    ? planCard(ctx, date, 'План на день')
    : `${factCard(w, d, cats)}${planCard(ctx, m.addDays(date, 1), 'План на завтра')}`;

  return `${header}
  <main class="content">
    ${date === today ? '' : `<a class="back-link" href="#/day">${icon('left')} К сегодняшнему дню</a>`}
    ${body}
    ${remainingCard(ctx, w, cats)}
  </main>`;
}

function factCard(w, d, cats) {
  const rec = m.isRecorded(w, d);
  const total = m.dayTotal(w, 'effective', d, cats);
  const full = m.dayRoom(w, 'actual', d) <= 0;
  const rows = cats.map((c) => {
    const value = m.effective(w, c.id, d);
    const planned = w.plan[c.id][d];
    const note = rec && planned !== value ? `<span class="plan-note">план ${m.fmtH(planned)}</span>` : '';
    return `<div class="edit-row">
      <span class="cat-name">${dot(c.color)}${esc(c.name)}${note}</span>
      ${stepper(value, { layer: 'actual', week: w.id, cat: c.id, day: d }, { muted: !rec, label: c.name, full })}
    </div>`;
  }).join('');

  return `<section class="card">
    <div class="card-head">
      <h2>Факт</h2>
      ${rec
        ? `<span class="badge good">${icon('check')} отмечен</span>`
        : '<span class="badge">не отмечен</span>'}
    </div>
    <p class="hint">${rec
      ? 'Можно поправить значения в любой момент.'
      : 'Показан план. Исправьте то, что пошло иначе, или подтвердите как есть.'}</p>
    ${rows}
    ${totalRow(total)}
    ${rec
      ? `<button class="btn ghost" data-action="clear-day" data-week="${w.id}" data-day="${d}">Сбросить отметку</button>`
      : `<button class="btn primary" data-action="confirm-day" data-week="${w.id}" data-day="${d}">${icon('check')} Подтвердить день</button>`}
  </section>`;
}

function planCard(ctx, date, title) {
  const w = ctx.getWeek(m.isoWeekId(date));
  const d = m.weekdayIndex(date);
  const cats = m.visibleCategories(w, ctx.settings);
  const total = m.dayTotal(w, 'plan', d, cats);
  const full = m.dayRoom(w, 'plan', d) <= 0;
  const rows = cats.map((c) => `<div class="edit-row">
      <span class="cat-name">${dot(c.color)}${esc(c.name)}</span>
      ${stepper(w.plan[c.id][d], { layer: 'plan', week: w.id, cat: c.id, day: d }, { label: c.name, full })}
    </div>`).join('');
  return `<section class="card">
    <div class="card-head"><h2>${title}</h2><span class="muted">${m.DAY_NAMES[d]}, ${m.fmtDayMonth(date)}</span></div>
    ${rows}
    ${totalRow(total)}
  </section>`;
}

function remainingCard(ctx, w, cats) {
  const rows = cats.map((c) => {
    const p = m.categoryProgress(w, c.id, ctx.today);
    if (p.target === 0) return '';
    const right = p.remaining === 0
      ? '<span class="good">✓</span>'
      : p.daysLeft > 0
        ? `${m.fmtH(p.remaining)} ч <span class="muted">≈${m.fmtH(p.perDay)}/день</span>`
        : `<span class="bad">−${m.fmtH(p.remaining)} ч</span>`;
    return `<div class="mini-row"><span class="cat-name">${dot(c.color)}${esc(c.name)}</span><span>${right}</span></div>`;
  }).join('');
  return `<section class="card">
    <div class="card-head"><h2>Осталось до целей недели</h2><a class="muted" href="#/week/${w.id}">неделя ${m.weekNumber(w.id)}</a></div>
    ${rows}
  </section>`;
}

function totalRow(total) {
  const room = m.DAY_HOURS - total;
  return `<div class="total-row${room < 0 ? ' bad' : ''}">
    <span>Итого <span class="muted">${room > 0 ? `· свободно ${m.fmtH(room)} ч` : room === 0 ? '· день заполнен' : ''}</span></span>
    <b>${m.fmtH(total)} / 24 ч</b>
  </div>`;
}
