/* Selector de fecha: un calendario que muestra, día por día, cuántas detecciones hubo (api/calendar.php) y
   deshabilita los días sin lecturas de satélite (api/coverage.php). Atajos para los casos más comunes y,
   al pie, desde cuándo lee cada satélite. Teclado: flechas mueven el día, AvPág/RePág el mes, Esc cierra. */
window.CFecha = (() => {
  const $ = s => document.querySelector(s);
  const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const DOW_FULL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MIN_DEFAULT = '2000-11-01';
  const HOT_MIN = 20;    // un día necesita al menos esto para llevar la flamita roja…
  const INFERNO = 1000;  // …y a partir de aquí la flama es más grande y se mueve
  // flamita roja de los días con muchos focos (la misma llama de la marca)
  const FLAME = '<svg class="cal__flame" viewBox="13 4 14 19" aria-hidden="true" focusable="false"><path d="M20 5c2 3.6 5.4 5.6 5.4 9.9 0 3.3-2.4 5.6-5.4 5.6s-5.4-2.3-5.4-5.6c0-2.7 2-4.3 3-6.9.4 1.8 1.3 2.8 2.4 3.6.6-2.2-.4-4.4 0-6.6z"/><path class="cal__flame-core" d="M20 20.2c-1.5 0-2.6-1-2.6-2.5 0-1.2.9-1.9 1.4-3.1.5.9 1 1.4 1.5 1.8.4-1 .1-2 .5-3 .9 1.1 1.8 2.1 1.8 3.7 0 1.5-1.1 3.1-2.6 3.1z"/></svg>';

  let pop, btn, grid, status, title, prev, next, chips, sats;
  let view = null;        // mes que se muestra, 'AAAA-MM'
  let cursor = null;      // día con el foco del teclado
  let monthData = null;   // respuesta de api/calendar.php del mes mostrado
  let loadErr = '';
  let req = 0;

  const utcToday = () => new Date().toISOString().slice(0, 10);
  /** Hoy en el centro de México: es el que la persona ve en su reloj (la API cuenta los días en UTC). */
  const localToday = () => (window.CApp ? CApp.localParts(Date.now() / 1000).day : utcToday());
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const pad = n => String(n).padStart(2, '0');
  const num = v => Number(v).toLocaleString('es-MX');
  const plus = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const shiftMonth = (m, n) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
  const fMonth = m => new Date(m + '-15T12:00:00Z').toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fLong = d => new Date(d + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const parts = (d, o) => Object.fromEntries(new Intl.DateTimeFormat('es-MX', { ...o, timeZone: 'UTC' })
    .formatToParts(new Date(d + 'T12:00:00Z')).map(p => [p.type, p.value.replace(/\./g, '')]));
  /** "sáb 3 oct 2026" */
  const fShort = d => { const p = parts(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); return `${p.weekday} ${p.day} ${p.month} ${p.year}`; };
  /** "3 oct 2026" */
  const fDate = d => { const p = parts(d, { day: 'numeric', month: 'short', year: 'numeric' }); return `${p.day} ${p.month} ${p.year}`; };
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /** Primer y último día que se pueden consultar: los de la cobertura, sin pasar de hoy. */
  function bounds() {
    const cov = window.CCobertura && CCobertura.data();
    const t = utcToday();
    return { min: cov ? cov.min : MIN_DEFAULT, max: cov && cov.max < t ? cov.max : t };
  }
  function selectable(d) {
    const b = bounds();
    return d >= b.min && d <= b.max && (!window.CCobertura || CCobertura.covered(d));
  }
  /** 0 = sin detecciones · 1 a 4 según cuántas hubo ese día. */
  function level(count) {
    if (!count) return 0;
    return count < 10 ? 1 : count < 50 ? 2 : count < 300 ? 3 : 4;
  }

  // ---------- botón de la barra ----------
  function syncButton() {
    const d = window.CApp && CApp.state.date;
    const lbl = $('#date-label');
    if (lbl) lbl.textContent = d ? fShort(d) : 'Elegir fecha';
    if (btn) btn.setAttribute('aria-label', d ? `Fecha elegida: ${fLong(d)}. Cambiar fecha` : 'Elegir una fecha pasada');
  }

  // ---------- armado del calendario ----------
  function build() {
    pop = el('div', 'calpop');
    pop.id = 'cal-pop';
    pop.hidden = true;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Elegir fecha');

    const head = el('div', 'cal__head');
    prev = el('button', 'cal__nav');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Mes anterior');
    prev.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"/></svg>';
    next = el('button', 'cal__nav');
    next.type = 'button';
    next.setAttribute('aria-label', 'Mes siguiente');
    next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7"/></svg>';
    title = el('h2', 'cal__title');
    title.setAttribute('aria-live', 'polite');
    head.append(prev, title, next);

    const dow = el('div', 'cal__dows');
    dow.setAttribute('aria-hidden', 'true');
    DOW.forEach(d => dow.appendChild(el('span', '', d)));

    grid = el('div', 'cal__grid');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Días del mes');

    const legend = el('div', 'cal__legend');
    legend.setAttribute('aria-hidden', 'true');
    legend.append(el('span', '', 'Detecciones del día'), el('i', 'cal__bar lv1'), el('i', 'cal__bar lv2'), el('i', 'cal__bar lv3'), el('i', 'cal__bar lv4'), el('span', '', 'más'));
    const hotKey = el('span', 'cal__hotkey');
    hotKey.innerHTML = FLAME + '<span>Muchos focos (los más altos del mes)</span>';
    legend.appendChild(hotKey);

    chips = el('div', 'cal__chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Atajos');

    status = el('p', 'cal__status');
    status.setAttribute('role', 'status');

    const det = el('details', 'cal__sats');
    det.appendChild(el('summary', '', 'Desde cuándo lee cada satélite'));
    sats = el('div', 'cal__satsbody');
    det.appendChild(sats);

    pop.append(head, dow, grid, legend, chips, status, det);
    document.body.appendChild(pop);

    prev.addEventListener('click', () => go(shiftMonth(view, -1)));
    next.addEventListener('click', () => go(shiftMonth(view, 1)));
    grid.addEventListener('click', e => {
      const b = e.target.closest('[data-day]');
      if (b) choose(b.dataset.day);
    });
    grid.addEventListener('keydown', onKey);
    chips.addEventListener('click', e => {
      const b = e.target.closest('[data-day]');
      if (b) choose(b.dataset.day);
    });
    pop.addEventListener('toggle', place, true);
  }

  /** Muestra otro mes y pide sus detecciones (una consulta por mes; se guarda para no repetirla). */
  function go(m, focusDay) {
    const b = bounds();
    if (m > b.max.slice(0, 7)) m = b.max.slice(0, 7);
    if (m < b.min.slice(0, 7)) m = b.min.slice(0, 7);
    view = m;
    if (focusDay) cursor = focusDay;
    monthData = null;
    loadErr = '';
    renderAll();
    const id = ++req;
    if (!window.CHistorial) return;
    CHistorial.month(m).then(j => {
      if (id !== req) return;
      monthData = j;
      renderAll();
    }).catch(e => {
      if (id !== req) return;
      loadErr = e.message || String(e);
      renderAll();
    });
  }

  function renderAll() {
    if (!pop || view == null) return;
    const b = bounds();
    title.textContent = fMonth(view);
    prev.disabled = view <= b.min.slice(0, 7);
    next.disabled = view >= b.max.slice(0, 7);
    renderGrid();
    renderChips();
    renderStatus();
  }

  function renderGrid() {
    const sel = window.CApp && CApp.state.date;
    const today = localToday();
    const [y, m] = view.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (!cursor || cursor.slice(0, 7) !== view) {
      // día con el foco: el elegido, si está en este mes; si no, el último con lecturas
      cursor = sel && sel.slice(0, 7) === view ? sel : lastSelectable(view);
    }
    const days = (monthData && monthData.days) || {};
    const counts = Object.values(days).map(x => x.count).sort((a, b) => a - b);
    const hotFrom = counts.length ? counts[Math.floor(0.75 * (counts.length - 1))] : Infinity; // percentil 75 del mes
    const hadFocus = grid.contains(document.activeElement);
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<span class="cal__gap" aria-hidden="true"></span>');
    for (let n = 1; n <= total; n++) {
      const d = `${view}-${pad(n)}`;
      const ok = selectable(d);
      const info = monthData ? days[d] : null;
      const lv = ok && monthData ? level(info ? info.count : 0) : -1;
      const wd = DOW_FULL[(first + n - 1) % 7];
      const what = !ok ? 'sin lecturas de satélite'
        : !monthData ? ''
        : info ? `${num(info.count)} ${info.count === 1 ? 'detección' : 'detecciones'}` : 'sin detecciones';
      // muchos focos: de los días del mes con datos descargados, el cuarto con más detecciones (y 20 o más) lleva la flamita roja;
      // con 1 000 o más la flama es mayor y se mueve
      const hot = !!info && ok && info.count >= HOT_MIN && info.count >= hotFrom;
      const cls = ['cal__day', d === sel ? 'is-sel' : '', d === today ? 'is-today' : '', !ok ? 'is-off' : '', hot ? 'is-hot' : '', info && info.count >= INFERNO ? 'is-inferno' : ''].filter(Boolean).join(' ');
      cells.push(`<button type="button" class="${cls}" data-day="${d}" tabindex="${d === cursor ? 0 : -1}"
        ${ok ? '' : 'aria-disabled="true"'} aria-pressed="${d === sel}"
        aria-label="${wd} ${n} de ${fMonth(view).split(' ')[0]}${d === today ? ', hoy' : ''}${what ? ': ' + what : ''}"
        title="${what ? what.charAt(0).toUpperCase() + what.slice(1) + (hot ? ' · muchos focos de calor' : '') : ''}"><span class="cal__n">${n}</span>${hot ? FLAME : ''}<i class="cal__bar${lv > 0 ? ' lv' + lv : lv === 0 ? ' lv0' : ''}"></i></button>`);
    }
    grid.innerHTML = cells.join('');
    if (hadFocus) focusCursor();
  }

  function lastSelectable(m) {
    const [y, mo] = m.split('-').map(Number);
    for (let n = new Date(Date.UTC(y, mo, 0)).getUTCDate(); n >= 1; n--) {
      const d = `${m}-${pad(n)}`;
      if (selectable(d)) return d;
    }
    return `${m}-01`;
  }
  function focusCursor() {
    const b = grid.querySelector(`[data-day="${cursor}"]`);
    if (b) b.focus();
  }

  /** Atajos: ayer, hace 3 días, hace una semana y el día con más detecciones del mes que se ve. */
  function renderChips() {
    const t = localToday();
    const list = [['Ayer', plus(t, -1)], ['Hace 3 días', plus(t, -3)], ['Hace 1 semana', plus(t, -7)]];
    if (monthData) {
      const best = Object.entries(monthData.days || {}).sort((a, b) => b[1].count - a[1].count)[0];
      if (best) list.push([`Más focos: ${Number(best[0].slice(8))} ${fMonth(view).split(' ')[0].slice(0, 3)} · ${num(best[1].count)}`, best[0]]);
    }
    const sel = window.CApp && CApp.state.date;
    chips.replaceChildren(...list.map(([label, d]) => {
      const b = el('button', 'cal__chip' + (d === sel ? ' is-on' : ''), label);
      b.type = 'button';
      b.dataset.day = d;
      if (!selectable(d)) b.setAttribute('aria-disabled', 'true');
      b.title = fLong(d);
      return b;
    }));
  }

  function renderStatus(msg) {
    status.classList.toggle('is-warn', !!msg);
    if (msg) { status.textContent = msg; return; }
    if (loadErr) { status.textContent = `No se pudo consultar las detecciones: ${loadErr}`; status.classList.add('is-warn'); return; }
    if (!monthData) { status.textContent = 'Consultando FIRMS… los días ya se pueden elegir.'; return; }
    const days = Object.values(monthData.days || {});
    const n = days.reduce((s, d) => s + d.count, 0);
    const guardado = monthData.offline ? ' Sin internet: datos guardados.' : '';
    status.textContent = (days.length
      ? `${cap(fMonth(view))}: ${days.length} ${days.length === 1 ? 'día' : 'días'} con incendios · ${num(n)} detecciones.`
      : `Sin detecciones en ${fMonth(view)}. Los días con lecturas igual se pueden ver.`) + guardado;
  }

  function renderSats() {
    const sel = window.CApp && CApp.state.date;
    if (window.CCobertura && sats) CCobertura.render(sats, sel || null);
  }

  // ---------- acciones ----------
  function choose(d) {
    if (!selectable(d)) {
      const b = bounds();
      renderStatus(`No hay lecturas de satélite el ${fLong(d)}. Elige un día entre el ${fDate(b.min)} y el ${fDate(b.max)}.`);
      return;
    }
    close();
    if (window.CApp) CApp.setDate(d);
    if (btn) btn.focus();
  }

  function onKey(e) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step != null || e.key === 'PageUp' || e.key === 'PageDown' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const b = bounds();
      let d = cursor || b.max;
      if (step != null) d = plus(d, step);
      else if (e.key === 'PageUp') d = shiftMonth(d.slice(0, 7), -1) + '-' + d.slice(8);
      else if (e.key === 'PageDown') d = shiftMonth(d.slice(0, 7), 1) + '-' + d.slice(8);
      else if (e.key === 'Home') d = view + '-01';
      else d = lastSelectable(view);
      // un día que no existe en el mes (31 → 30) se acomoda al último
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) d = lastSelectable(shiftMonth(cursor.slice(0, 7), e.key === 'PageUp' ? -1 : 1));
      if (d < b.min) d = b.min;
      if (d > b.max) d = b.max;
      cursor = d;
      if (d.slice(0, 7) !== view) { go(d.slice(0, 7), d); focusCursor(); } else { renderGrid(); focusCursor(); }
    }
  }

  function place() {
    if (!pop || pop.hidden || !btn) return;
    const r = btn.getBoundingClientRect();
    const w = Math.min(348, window.innerWidth - 24);
    pop.style.width = w + 'px';
    pop.style.top = Math.round(r.bottom + 8) + 'px';
    pop.style.left = Math.round(Math.min(Math.max(12, r.left), window.innerWidth - w - 12)) + 'px';
    pop.style.maxHeight = Math.max(260, window.innerHeight - r.bottom - 20) + 'px';
  }

  function open() {
    if (!pop) build();
    const sel = window.CApp && CApp.state.date;
    const b = bounds();
    const start = (sel && sel >= b.min && sel <= b.max) ? sel : b.max;
    cursor = null;
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    place();
    go(start.slice(0, 7), selectable(start) ? start : null);
    renderSats();
    focusCursor();
  }
  function close() {
    if (pop) pop.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  const isOpen = () => pop && !pop.hidden;

  document.addEventListener('DOMContentLoaded', () => {
    btn = $('#date-btn');
    if (!btn) return;
    btn.addEventListener('click', () => (isOpen() ? close() : open()));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { close(); btn.focus(); } });
    document.addEventListener('click', e => { if (isOpen() && !pop.contains(e.target) && !btn.contains(e.target)) close(); });
    window.addEventListener('resize', place);
    document.addEventListener('centinela:fecha', syncButton);
    // tras recargar el sistema, el mes abierto se vuelve a leer (ya con lo recién descargado)
    window.addEventListener('centinela:calendario', () => { if (isOpen() && view) go(view); });
    document.addEventListener('centinela:cobertura', () => { if (isOpen()) { renderAll(); renderSats(); } });
    if (window.CApp) CApp.on(() => { syncButton(); if (isOpen()) { renderGrid(); renderChips(); renderSats(); } });
    syncButton();
  });

  return { open, close };
})();
