// Home screen: how the week is going against its targets.

import * as m from '../model.js';
import { esc, dot, icon, navHeader, data } from '../ui.js';

export function renderWeek(ctx, weekId) {
  const { settings, today } = ctx;
  const w = ctx.getWeek(weekId);
  const cats = m.visibleCategories(w, settings);
  const sum = m.weekSummary(w, settings, today);
  const idx = m.dayIndexInWeek(weekId, today);
  const isCurrent = idx >= 0 && idx <= 6;
  const isPast = idx > 6;

  const header = navHeader(
    `Неделя ${m.weekNumber(weekId)}`,
    `${m.fmtWeekRange(weekId)}${isCurrent ? ' · текущая' : isPast ? ' · прошедшая' : ' · будущая'}`,
    `#/week/${m.shiftWeek(weekId, -1)}`,
    `#/week/${m.shiftWeek(weekId, 1)}`,
  );

  return `${header}
  <main class="content">
    ${ctx.sync.status === 'error' ? `<a class="sync-banner" href="#/settings">Синхронизация не удалась: ${esc(ctx.sync.message)}</a>` : ''}
    ${isCurrent ? '' : `<a class="back-link" href="#/week">${icon('left')} К текущей неделе</a>`}
    ${summaryCard(sum, isPast)}
    <section class="stack">
      ${cats.map((c) => categoryCard(w, c, today, isPast)).join('')}
    </section>
    ${dayStrip(w, cats, today)}
  </main>`;
}

function summaryCard(sum, isPast) {
  const free = sum.freeForecast;
  const warnings = [];
  if (sum.freePlanned < 0) warnings.push(`План превышает 168 ч на ${m.fmtH(-sum.freePlanned)} ч`);
  if (sum.overloadedDays.length) {
    warnings.push(`Больше 24 ч: ${sum.overloadedDays.map((d) => m.DAY_NAMES[d]).join(', ')}`);
  }
  return `<section class="card summary">
    <div class="stat">
      <span class="stat-label">Свободно${isPast ? '' : ' (прогноз)'}</span>
      <span class="stat-value${free < 0 ? ' bad' : ''}">${m.fmtH(free)}<small> ч</small></span>
      <span class="stat-sub">по плану ${m.fmtH(sum.freePlanned)} · по целям ${m.fmtH(sum.freeTarget)}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Отмечено</span>
      <span class="stat-value">${sum.recordedDays}<small> / 7</small></span>
      <span class="stat-sub">дней</span>
    </div>
    ${warnings.length ? `<p class="warn">${warnings.map(esc).join('<br>')}</p>` : ''}
  </section>`;
}

function categoryCard(w, c, today, isPast) {
  const p = m.categoryProgress(w, c.id, today);
  const scale = Math.max(p.target, p.forecast, 0.01);
  const pct = (v) => `${Math.min(100, (v / scale) * 100).toFixed(2)}%`;

  let status;
  let tone = '';
  if (isPast || p.daysLeft === 0) {
    const diff = p.actual - p.target;
    if (diff >= 0) {
      status = `цель выполнена${diff > 0 ? ` · +${m.fmtH(diff)} ч` : ''}`;
      tone = 'good';
    } else {
      status = `не хватило ${m.fmtH(-diff)} ч`;
      tone = 'bad';
    }
  } else if (p.remaining === 0) {
    status = `цель выполнена${p.surplus > 0 ? ` · по плану +${m.fmtH(p.surplus)} ч` : ''}`;
    tone = 'good';
  } else {
    status = `осталось ${m.fmtH(p.remaining)} ч · ≈${m.fmtH(p.perDay)} ч/день`;
    if (p.shortfall > 0) {
      status += ` · <span class="bad">в плане не хватает ${m.fmtH(p.shortfall)} ч</span>`;
    }
  }

  return `<button class="card cat-card" ${data({ action: 'open-row', layer: 'plan', week: w.id, cat: c.id })}>
    <div class="cat-head">
      <span class="cat-name">${dot(c.color)}${esc(c.name)}</span>
      <span class="cat-nums"><b>${m.fmtH(p.actual)}</b> / ${m.fmtH(p.target)} ч</span>
    </div>
    <div class="bar" style="--c:${esc(c.color)}">
      <span class="bar-fill">
        <span class="bar-actual" style="width:${pct(p.actual)}"></span>
        <span class="bar-plan" style="width:${pct(p.forecast - p.actual)}"></span>
      </span>
      ${p.target > 0 ? `<span class="bar-target" style="left:${pct(p.target)}"></span>` : ''}
    </div>
    <div class="cat-status ${tone}">${status}</div>
  </button>`;
}

function dayStrip(w, cats, today) {
  const tiles = m.DAY_NAMES.map((name, d) => {
    const date = m.addDays(w.start, d);
    const rec = m.isRecorded(w, d);
    const total = m.dayTotal(w, 'effective', d, cats);
    const cls = ['day-tile', date === today ? 'today' : '', rec ? 'rec' : '', total > m.DAY_HOURS ? 'over' : '']
      .filter(Boolean)
      .join(' ');
    return `<a class="${cls}" href="#/day/${date}">
      <span class="dt-name">${name}</span>
      <span class="dt-num">${m.parseDate(date).getDate()}</span>
      <span class="dt-mark">${rec ? icon('check') : `${m.fmtH(total)}`}</span>
    </a>`;
  }).join('');
  return `<section class="day-strip" aria-label="Дни недели">${tiles}</section>`;
}
