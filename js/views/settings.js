// Categories, weekly template and data export/import.

import * as m from '../model.js';
import { esc, dot, icon, data } from '../ui.js';

export function renderSettings(ctx) {
  const { settings } = ctx;
  const active = settings.categories.filter((c) => !c.archived);
  const archived = settings.categories.filter((c) => c.archived);
  const templateTotal = m.sum(active.map((c) => m.templateTarget(settings, c.id)));

  const catRow = (c, i) => `<div class="cat-edit">
    <label class="swatch" style="background:${esc(c.color)}" aria-label="Цвет">
      <input type="color" value="${esc(c.color)}" ${data({ action: 'cat-color', cat: c.id })}>
    </label>
    <input class="name-input" value="${esc(c.name)}" maxlength="40" ${data({ action: 'cat-name', cat: c.id })} aria-label="Название">
    <button class="icon-btn small" ${data({ action: 'cat-move', cat: c.id, dir: -1 })} ${i === 0 ? 'disabled' : ''} aria-label="Выше">${icon('up')}</button>
    <button class="icon-btn small" ${data({ action: 'cat-move', cat: c.id, dir: 1 })} ${i === active.length - 1 ? 'disabled' : ''} aria-label="Ниже">${icon('down')}</button>
    <button class="text-btn" ${data({ action: 'cat-archive', cat: c.id })}>В архив</button>
  </div>`;

  const archivedRow = (c) => `<div class="cat-edit archived">
    ${dot(c.color)}<span class="name-static">${esc(c.name)}</span>
    <button class="text-btn" ${data({ action: 'cat-restore', cat: c.id })}>Вернуть</button>
    ${ctx.categoryUsed(c.id) ? '' : `<button class="text-btn bad" ${data({ action: 'cat-delete', cat: c.id })}>Удалить</button>`}
  </div>`;

  const templateRow = (c) => `<button class="tpl-row" ${data({ action: 'open-row', layer: 'template', cat: c.id })}>
    <span class="cat-name">${dot(c.color)}${esc(c.name)}</span>
    <span class="tpl-days">${settings.template[c.id].map((v) => `<i>${v ? m.fmtH(v) : '·'}</i>`).join('')}</span>
    <b>${m.fmtH(m.templateTarget(settings, c.id))}</b>
  </button>`;

  return `<header class="topbar"><div class="topbar-title"><h1>Настройки</h1></div></header>
  <main class="content">
    <section class="card">
      <div class="card-head"><h2>Категории</h2></div>
      ${active.map(catRow).join('')}
      <form class="add-cat" data-action="add-cat">
        <input name="name" placeholder="Новая категория" maxlength="40" autocomplete="off" required>
        <button class="btn primary small">Добавить</button>
      </form>
      ${archived.length ? `<h3 class="sub-head">Архив</h3>${archived.map(archivedRow).join('')}` : ''}
      <p class="hint">Категория в архиве не попадает в новые недели, но остаётся в истории.</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>Шаблон недели</h2><span class="muted">${m.fmtH(templateTotal)} ч · свободно ${m.fmtH(m.WEEK_HOURS - templateTotal)}</span></div>
      <div class="tpl-row tpl-head"><span></span><span class="tpl-days">${m.DAY_NAMES.map((n) => `<i>${n}</i>`).join('')}</span><b>Σ</b></div>
      ${active.map(templateRow).join('')}
      <p class="hint">Каждая новая неделя начинается с этой раскладки. Сумма по строке — цель недели.</p>
    </section>

    ${syncCard(ctx.sync)}

    <section class="card">
      <div class="card-head"><h2>Резервная копия</h2></div>
      <p class="hint">Полная копия всех данных в одном файле. Пригодится, если что-то пойдёт не так.</p>
      <div class="btn-row">
        <button class="btn ghost" data-action="export">Экспорт в файл</button>
        <label class="btn ghost">Импорт из файла<input type="file" accept="application/json,.json" data-action="import" hidden></label>
      </div>
      <p class="hint">${ctx.storageNote}</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>Установка</h2></div>
      <p class="hint"><b>iPhone:</b> откройте сайт в Safari → «Поделиться» → «На экран „Домой“».<br>
      <b>Mac:</b> Safari → «Файл» → «Добавить в Dock», или иконка установки в адресной строке Chrome.</p>
      <p class="hint">Версия ${ctx.version}</p>
    </section>
  </main>`;
}

const STATUS = {
  syncing: 'Синхронизация…',
  ok: 'Синхронизировано',
  offline: 'Нет интернета',
  error: 'Ошибка',
  off: 'Ожидает',
};

function syncCard(sync) {
  if (!sync.config) {
    return `<section class="card">
      <div class="card-head"><h2>Синхронизация</h2><span class="badge">выключена</span></div>
      <p class="hint">Телефон и компьютер обмениваются данными через ваш <b>приватный</b> репозиторий на GitHub.
      Бесплатно; данные всегда остаются и на устройстве. Инструкция — в файле SETUP.md проекта.</p>
      <form class="sync-form" data-action="sync-connect" autocomplete="off">
        <label>Репозиторий<input name="repo" placeholder="имя-пользователя/time-data" autocapitalize="off" spellcheck="false" required></label>
        <label>Токен доступа<input name="token" type="password" placeholder="github_pat_…" autocapitalize="off" spellcheck="false" required></label>
        <button class="btn primary">Подключить</button>
      </form>
    </section>`;
  }
  const c = sync.config;
  const when = sync.at ? new Date(sync.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
  const tone = { ok: 'good', error: 'bad' }[sync.status] ?? '';
  return `<section class="card">
    <div class="card-head"><h2>Синхронизация</h2><span class="badge ${tone}">${STATUS[sync.status]}${sync.status === 'ok' && when ? ` в ${when}` : ''}</span></div>
    <p class="hint">Репозиторий <b>${esc(c.owner)}/${esc(c.repo)}</b>. Изменения отправляются через несколько секунд после правки
    и забираются при открытии приложения.</p>
    ${sync.message ? `<p class="${sync.status === 'error' ? 'warn' : 'hint'}">${esc(sync.message)}</p>` : ''}
    <div class="btn-row">
      <button class="btn ghost" data-action="sync-now" ${sync.status === 'syncing' ? 'disabled' : ''}>Синхронизировать сейчас</button>
      <button class="btn ghost" data-action="sync-disconnect">Отключить</button>
    </div>
  </section>`;
}
