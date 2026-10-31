// Analytics over saved weeks. Pure functions, unit-tested like model.js.

import * as m from './model.js';

// Share of the weekly targets that was met, capping each category at its target so a
// surplus in one area cannot hide a shortfall in another.
function completion(rows) {
  let target = 0;
  let met = 0;
  for (const r of rows) {
    if (r.target <= 0) continue;
    target += r.target;
    met += Math.min(r.actual, r.target);
  }
  return target > 0 ? met / target : null;
}

export function weekReport(week, settings) {
  const cats = m.visibleCategories(week, settings);
  const recorded = m.DAY_NAMES.map((_, d) => d).filter((d) => m.isRecorded(week, d));
  const base = week.baseline ?? week.plan;

  let deviation = 0; // Σ |actual − baseline| over recorded days
  let baselineRecorded = 0;
  const rows = cats.map((c) => {
    let devC = 0;
    for (const d of recorded) {
      devC += Math.abs(week.actual[c.id][d] - base[c.id][d]);
      baselineRecorded += base[c.id][d];
    }
    deviation += devC;
    const target = week.targets[c.id] ?? 0;
    const actual = m.sum(week.actual[c.id]);
    return {
      cat: c,
      target,
      baseline: m.sum(base[c.id]),
      plan: m.sum(week.plan[c.id]),
      actual,
      diff: actual - target,
      completion: target > 0 ? actual / target : null,
      deviation: devC,
    };
  });

  const actualTotal = m.sum(rows.map((r) => r.actual));
  return {
    rows,
    recordedDays: recorded.length,
    completion: completion(rows),
    deviation,
    // How closely the recorded days followed the plan frozen on Monday (1 = exactly).
    accuracy: recorded.length && baselineRecorded > 0 ? Math.max(0, 1 - deviation / baselineRecorded) : null,
    freeActual: recorded.length ? recorded.length * m.DAY_HOURS - actualTotal : null,
    hasBaseline: !!week.baseline,
  };
}

// Finished weeks with at least one recorded day, newest first.
export function finishedWeeks(weeks, today) {
  return weeks
    .filter((w) => m.dayIndexInWeek(w.id, today) > 6 && m.recordedCount(w) > 0)
    .sort((a, b) => b.id.localeCompare(a.id));
}

// Per-category trend over the last `limit` finished weeks (oldest → newest in series).
export function trends(weeks, settings, today, limit) {
  const list = finishedWeeks(weeks, today).slice(0, limit ?? Infinity).reverse();
  const reports = list.map((w) => ({ week: w, report: weekReport(w, settings) }));

  const cats = settings.categories.filter((c) => reports.some(({ week }) => c.id in week.targets && m.hasData(week, c.id)));
  const categories = cats.map((c) => {
    const series = reports.map(({ week }) => ({
      weekId: week.id,
      present: c.id in week.targets,
      actual: m.sum(week.actual[c.id] ?? []),
      target: week.targets[c.id] ?? 0,
    }));
    const present = series.filter((s) => s.present);
    const withTarget = present.filter((s) => s.target > 0);
    return {
      cat: c,
      series,
      avgActual: present.length ? m.sum(present.map((s) => s.actual)) / present.length : 0,
      avgTarget: present.length ? m.sum(present.map((s) => s.target)) / present.length : 0,
      metWeeks: withTarget.filter((s) => s.actual >= s.target - 1e-9).length,
      targetWeeks: withTarget.length,
    };
  });

  const avg = (xs) => (xs.length ? m.sum(xs) / xs.length : null);
  return {
    weeks: reports.length,
    categories,
    avgCompletion: avg(reports.map((r) => r.report.completion).filter((v) => v != null)),
    avgAccuracy: avg(reports.map((r) => r.report.accuracy).filter((v) => v != null)),
    completionSeries: reports.map((r) => ({ weekId: r.week.id, value: r.report.completion })),
  };
}

export function pct(v) {
  return v == null ? '–' : `${Math.round(v * 100)}%`;
}
