// Small HTML helpers shared by the views. Views render strings; app.js handles
// clicks through data-action attributes (event delegation).

import { fmtH } from './model.js';

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// data-* attributes from an object
export function data(attrs) {
  return Object.entries(attrs)
    .map(([k, v]) => `data-${k}="${esc(v)}"`)
    .join(' ');
}

export function dot(color) {
  return `<span class="dot" style="background:${esc(color)}"></span>`;
}

// − value + control. `attrs` identify the cell for the action handler.
export function stepper(value, attrs, { muted = false, label = '', full = false } = {}) {
  const a = data(attrs);
  return `<div class="stepper">
    <button class="step" data-action="step" data-delta="-1" ${a} aria-label="Уменьшить ${esc(label)}">−</button>
    <input class="step-val${muted ? ' muted' : ''}" inputmode="decimal" enterkeyhint="done" value="${fmtH(value)}"
      data-action="set" ${a} aria-label="${esc(label)}">
    <button class="step" data-action="step" data-delta="1" ${a} ${full ? 'disabled' : ''} aria-label="Увеличить ${esc(label)}">+</button>
  </div>`;
}

const ICONS = {
  week: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6 6"/>',
  stats: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>',
  day: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  plan: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 4v17M3 15h18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
};

export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

// Prev / title / next header used by week and day screens.
export function navHeader(title, subtitle, prevHref, nextHref, extra = '') {
  return `<header class="topbar">
    <a class="icon-btn" href="${prevHref}" aria-label="Назад">${icon('left')}</a>
    <div class="topbar-title"><h1>${title}</h1><p>${subtitle}</p></div>
    <a class="icon-btn" href="${nextHref}" aria-label="Вперёд">${icon('right')}</a>
    ${extra}
  </header>`;
}
