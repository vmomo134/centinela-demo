/* Orquestador: bucle de sondeo, store en memoria, KPIs y distribución a los módulos. */
window.CApp = (() => {
  const $ = s => document.querySelector(s);
  const state = { data: null, window: 24, error: null, seen: loadSeen(), lastTrigger: 0, date: null, loading: false, view: loadView() };

  function loadView() {
    try { return localStorage.getItem('centinela.vista') === 'detecciones' ? 'detecciones' : 'calor'; } catch { return 'calor'; }
  }

  /** Vista del mapa: "calor" (superficie de gravedad, limpia) o "detecciones" (focos y píxeles). */
  function setView(v) {
    state.view = v === 'detecciones' ? 'detecciones' : 'calor';
    try { localStorage.setItem('centinela.vista', state.view); } catch { /* sin almacenamiento */ }
    document.querySelectorAll('[name="vista"]').forEach(r => (r.checked = r.value === state.view));
    const cb = $('#calor-box'), db = $('#det-box');
    if (cb) cb.hidden = state.view !== 'calor';
    if (db) db.hidden = state.view !== 'detecciones';
    document.querySelectorAll('.legend__row--det').forEach(r => (r.hidden = state.view !== 'detecciones'));
    if (window.CCalor) CCalor.setOn(state.view === 'calor');
    if (window.CMap) {
      CMap.setEventsVisible(state.view === 'detecciones');
      CMap.setPoints(state.view === 'detecciones' && (!$('#pts-toggle') || $('#pts-toggle').checked));
    }
    applyWms();
  }
  const subs = [];

  function loadSeen() {
    try { return JSON.parse(localStorage.getItem('centinela.seen') || '{}'); } catch { return {}; }
  }
  function saveSeen() {
    try { localStorage.setItem('centinela.seen', JSON.stringify(state.seen)); } catch { /* almacenamiento no disponible */ }
  }

  let timer, delay = 90000;

  // La conexión se avisa una sola vez al cambiar (no en cada sondeo): se cayó o volvió.
  let linkWasOff = null;
  function announceLink(off, fetchedAt) {
    if (linkWasOff === off) return;
    const first = linkWasOff === null;
    linkWasOff = off;
    if (off) CAviso.info('Sin conexión a internet', fetchedAt ? `Se muestran los datos descargados el ${CFmt.fecha(fetchedAt)}.` : 'Aún no hay datos descargados.');
    else if (!first) CAviso.ok('Conexión restablecida', 'Los datos vuelven a actualizarse solos.');
  }

  // Al volver la red del equipo no se espera al siguiente sondeo: se pide una descarga de inmediato.
  window.addEventListener('online', () => {
    if (state.date) return;
    setTimeout(async () => {
      try {
        const r = await fetch('api/trigger.php?manual=1', { cache: 'no-store' });
        if (r.ok && !state.date) { state.data = await r.json(); state.error = null; render(); } else poll();
      } catch { poll(); }
    }, 1500);
  });
  window.addEventListener('offline', () => applyWms());

  // Modo histórico: date = 'YYYY-MM-DD' y la ventana 24/48/72 h se vuelve 1/2/3 días hasta esa fecha.
  let histReq = 0;
  /** force = "Recargar fecha": se vuelve a descargar de FIRMS en lugar de usar lo guardado. @returns {Promise<boolean>} true si cargó */
  async function loadHistory(force = false) {
    const id = ++histReq;
    state.loading = true;
    state.reloading = force; // una recarga manual muestra su progreso en el botón, no en el velo del mapa
    render();
    let ok = false;
    try {
      // un día local (focus) abarca dos días UTC: se pide el día siguiente con 2 días hacia atrás
      const q = (state.focus ? `date=${plusDay(state.focus.day, 1)}&days=2` : `date=${state.date}&days=${state.window / 24}`) + (force ? '&refresh=1' : '');
      const r = await fetch(`api/history.php?${q}`, { cache: 'no-store' });
      const j = await r.json();
      if (id !== histReq || !state.date) return false; // respuesta vieja: el usuario ya cambió de fecha
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      state.data = j;
      state.error = null;
      // sin internet el servidor devuelve lo ya descargado de esa fecha: se ve igual, pero no cuenta como «actualizada»
      const off = !!(j.meta && j.meta.offline);
      ok = !(force && off);
      if (state.announce) {
        state.announce = false;
        if (off) CAviso.info(force ? 'Sin internet: no se pudo recargar' : 'Sin internet · datos guardados', `${histRange()} · ${CFmt.num(visiblePoints(j).length)} detecciones ya descargadas`);
        else CAviso.ok(force ? 'Fecha actualizada' : 'Consulta lista', `${histRange()} · ${CFmt.num(visiblePoints(j).length)} detecciones`);
      }
    } catch (e) {
      if (id === histReq) {
        state.error = e.message || String(e);
        if (state.announce) { state.announce = false; CAviso.err('No se pudo consultar la fecha', state.error); }
      }
    } finally {
      if (id === histReq) { state.loading = false; state.reloading = false; render(); }
    }
    return ok;
  }

  const fDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const plusDay = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const hh = h => String(h).padStart(2, '0') + ':00';

  function histRange() {
    if (state.focus) {
      const f = state.focus;
      if (f.hour == null) return fDay(f.day);
      const m0 = f.q == null ? 0 : f.q * 15, m1 = f.q == null ? 59 : m0 + 14;
      const t = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      return `${fDay(f.day)} · ${t(f.hour, m0)}–${t(f.hour, m1)} h`;
    }
    const h = state.data && state.data.meta.history;
    if (!h) return '';
    return h.start === h.date ? fDay(h.date) : `${fDay(h.start)} – ${fDay(h.date)}`;
  }

  // fecha y hora locales (centro de México) de un instante epoch
  const LOCAL = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  function localParts(t) {
    const p = Object.fromEntries(LOCAL.formatToParts(new Date(t * 1000)).map(x => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
  }

  /** Epoch UTC de una hora local del centro de México (respeta el horario de verano de años anteriores). */
  function localToEpoch(day, hour = 0, minute = 0) {
    const [y, m, d] = day.split('-').map(Number);
    let t = Date.UTC(y, m - 1, d, hour, minute) / 1000 + 6 * 3600; // UTC-6 de partida
    for (let i = 0; i < 2; i++) {
      const p = localParts(t);
      const diff = ((p.day === day ? 0 : p.day > day ? 24 : -24) + p.hour - hour) * 3600 + (p.minute - minute) * 60;
      if (!diff) break;
      t -= diff;
    }
    return t;
  }

  /** [inicio, fin) en epoch del día, hora o cuarto de hora elegido en el historial. */
  function focusBounds(f) {
    if (f.hour == null) return [localToEpoch(f.day), localToEpoch(plusDay(f.day, 1))];
    const a = localToEpoch(f.day, f.hour, f.q == null ? 0 : f.q * 15);
    return [a, a + (f.q == null ? 3600 : 900)];
  }

  /** Eventos visibles: los del día/hora elegidos en el historial, o los de la ventana 24/48/72 h. */
  function visibleEvents(d) {
    if (!d) return [];
    if (state.focus) {
      const f = state.focus;
      const [a, b] = focusBounds(f);
      // un evento se ve si alguna lectura del satélite cae en el periodo (GOES lee cada 10 min)
      return d.events.filter(e => (e.scans && e.scans.length ? e.scans : [e.last_seen]).some(s => s >= a && s < b));
    }
    return d.events.filter(e => d.meta.now - e.last_seen <= state.window * 3600);
  }

  /** Detecciones crudas visibles (cada píxel que marcó un satélite): mismo filtro que los eventos. */
  function visiblePoints(d) {
    if (!d || !d.points) return [];
    if (state.focus) {
      const [a, b] = focusBounds(state.focus);
      return d.points.filter(p => p[2] >= a && p[2] < b);
    }
    return d.points.filter(p => d.meta.now - p[2] <= state.window * 3600);
  }

  /** Abre un día local del historial (y opcionalmente una hora) en el mapa. */
  function setFocus(day, hour = null, q = null) {
    setDate(day, { day, hour, q: hour == null ? null : q });
  }

  function syncUrl() {
    const u = new URL(location.href);
    ['fecha', 'ventana', 'hora', 'cuarto'].forEach(k => u.searchParams.delete(k));
    if (state.date) {
      u.searchParams.set('fecha', state.date);
      if (!state.focus) u.searchParams.set('ventana', state.window);
      else if (state.focus.hour != null) {
        u.searchParams.set('hora', state.focus.hour);
        if (state.focus.q != null) u.searchParams.set('cuarto', state.focus.q);
      }
      else u.searchParams.set('ventana', 'dia');
    }
    history.replaceState(history.state, '', u);
  }

  function setDate(d, focus = null) {
    const today = new Date().toISOString().slice(0, 10);
    const same = focus && state.focus && state.focus.day === focus.day && state.data;
    state.date = d && d <= today ? d : null;
    state.focus = state.date ? focus : null;
    // después del arranque, cada cambio de fecha lo pide la persona: se confirma con un aviso
    if (state.booted) {
      state.announce = !!state.date;
      if (!state.date) CAviso.info('Datos más recientes', 'Mostrando lo último que NASA tiene publicado.');
    }
    // misma fecha, otra hora: los datos ya están cargados, solo cambia el filtro
    if (same) { syncUrl(); applyWms(); render(); return; }
    const live = $('#live-btn');
    if (live) live.setAttribute('aria-pressed', String(!state.date));
    const ctl = document.querySelector('.datectl');
    if (ctl) ctl.classList.toggle('is-history', !!state.date);
    document.dispatchEvent(new Event('centinela:fecha')); // el calendario actualiza su botón al instante
    syncUrl();
    applyWms();
    clearTimeout(timer);
    state.data = null;
    state.error = null;
    if (state.date) loadHistory();
    else {
      // volver a "En vivo" también tarda: el velo del mapa avisa hasta que llegan los datos
      state.loading = true;
      state.reloading = false;
      delay = 90000;
      render();
      poll();
    }
  }

  // imagen del mapa: GOES (cada 10 min) si está elegida y existe; si no, la capa diaria de FIRMS
  let imgReq = 0;
  async function applyWms() {
    const wt = $('#wms-toggle');
    if (!window.CMap) return;
    const id = ++imgReq;
    const goesOn = !!(window.CImagen && await CImagen.apply());
    if (window.CCalor) CCalor.setImageryUnder(goesOn);
    if (goesOn) {
      if (id === imgReq) CMap.setWms(false, state.window);
      return;
    }
    if (id !== imgReq) return;
    // en la vista de calor la capa diaria de FIRMS sobra: esas detecciones ya forman la superficie
    if (state.view === 'calor') { CMap.setWms(false, state.window); return; }
    // con una hora o cuarto elegido la imagen diaria de FIRMS mezclaría otras horas:
    // la realidad de ese periodo son los píxeles detectados que ya dibuja el mapa
    if (state.focus && state.focus.hour != null) {
      CMap.setWms(false, state.window);
      const note = $('#goes-note');
      const dl = $('#dl-box');
      if (note && window.CImagen && CImagen.src() !== 'firms' && (!dl || dl.hidden)) {
        note.textContent = 'NASA solo guarda las imágenes de 10 min de las últimas semanas. El mapa muestra los píxeles detectados en ese periodo.';
      }
      return;
    }
    let time = null;
    if (state.focus) {
      time = `${state.focus.day}/${plusDay(state.focus.day, 1)}`;
    } else if (state.date) {
      const start = new Date(state.date + 'T00:00:00Z');
      start.setUTCDate(start.getUTCDate() - (state.window / 24 - 1));
      time = `${start.toISOString().slice(0, 10)}/${state.date}`;
    }
    CMap.setWms(wt ? wt.checked : true, state.window, time);
  }

  async function poll() {
    if (state.date) return; // en modo histórico no se sondea
    try {
      const r = await fetch('api/data.php', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (state.date) return;
      state.data = j;
      state.error = null;
      state.loading = false;
      delay = (state.data.meta.poll_seconds || 90) * 1000;
      render();
      // en vivo, la imagen GOES avanza a la más reciente (cada 10 min)
      if (window.CImagen && CImagen.src() !== 'firms') applyWms();
      maybeTrigger();
    } catch (e) {
      state.error = e.message || String(e);
      state.loading = false;
      delay = Math.min(delay * 2, 300000);
      render();
    } finally {
      clearTimeout(timer);
      if (!state.date) timer = setTimeout(poll, delay);
    }
  }

  async function maybeTrigger() {
    if (state.date || !state.data || !state.data.meta.needs_refresh) return;
    if (Date.now() - state.lastTrigger < 60000) return;
    state.lastTrigger = Date.now();
    try {
      const r = await fetch('api/trigger.php', { cache: 'no-store' });
      if (r.ok) { state.data = await r.json(); render(); }
    } catch { /* el próximo sondeo lo reintenta */ }
  }

  // ---------- botón "Actualizar datos" / "Recargar fecha" ----------
  // Estados: idle → loading (la rueda gira mientras la descarga ocurre de verdad) → done / error (se ve el resultado) → idle.
  const idleLabel = () => (state.date ? 'Recargar fecha' : 'Actualizar datos');
  let refreshing = false;

  function setRefresh(kind, label) {
    const btn = $('#refresh');
    if (!btn) return;
    ['loading', 'done', 'error'].forEach(k => btn.classList.toggle('is-' + k, k === kind));
    btn.setAttribute('aria-busy', String(kind === 'loading'));
    const txt = btn.querySelector('.rbtn__txt');
    if (txt) txt.textContent = label || idleLabel();
    const st = $('#refresh-status');
    if (st) st.textContent = kind === 'idle' ? '' : (label || '');
  }

  /** Lo que no depende del servidor de alertas: satélites en vivo, cobertura y el calendario del mes. Nunca bloquea más de 20 s. */
  async function refreshRest() {
    const jobs = [];
    if (window.CVivo && CVivo.load) jobs.push(CVivo.load());
    if (window.CCobertura && CCobertura.reload) jobs.push(CCobertura.reload());
    if (window.CHistorial && CHistorial.refresh) jobs.push(CHistorial.refresh(state.date ? state.date.slice(0, 7) : null));
    await Promise.race([Promise.allSettled(jobs), new Promise(r => setTimeout(r, 20000))]);
  }

  async function refreshNow() {
    if (refreshing) return;
    refreshing = true;
    const history = !!state.date;
    setRefresh('loading', 'Actualizando…');
    state.lastTrigger = Date.now();
    let ok = false;
    try {
      if (history) {
        state.announce = true;
        ok = await loadHistory(true); // vuelve a descargar la fecha de FIRMS
      } else {
        const r = await fetch('api/trigger.php?manual=1', { cache: 'no-store' });
        const j = await r.json();
        if (state.date) { refreshing = false; setRefresh('idle'); return; } // cambió de fecha mientras tanto
        const tr = r.ok && j.meta && j.meta.trigger_result;
        if (tr && tr.ok === false && !j.meta.refreshing) {
          // el servidor respondió, pero NASA no: se siguen viendo los últimos datos descargados
          state.data = j; state.error = null; render();
          const cuando = j.meta.fetched_at ? `Se muestran los datos descargados el ${CFmt.fecha(j.meta.fetched_at)}.` : 'Aún no hay datos descargados.';
          if (tr.offline || j.meta.offline) CAviso.err('Sin conexión a internet', `No se pueden bajar datos nuevos. ${cuando}`);
          else CAviso.err('NASA no respondió', cuando);
        } else if (r.ok) {
          state.data = j; state.error = null; render();
          ok = true;
          CAviso.ok('Datos actualizados', j.meta.fetched_at ? `Última descarga de NASA a las ${CFmt.hora(j.meta.fetched_at)}.` : '');
        } else if (r.status === 429) {
          // se actualizó hace menos de 30 s: se trae lo último que ya se descargó
          await poll();
          ok = !state.error && !(state.data && state.data.meta.offline);
          if (state.data && state.data.meta.offline) CAviso.err('Sin conexión a internet', `No se pueden bajar datos nuevos. Se muestran los datos descargados el ${CFmt.fecha(state.data.meta.fetched_at)}.`);
          else if (ok) CAviso.info('Ya está al día', `Se actualizó hace unos segundos (límite de ${j.retry_after || 30} s entre descargas).`);
          else CAviso.err('No se pudo actualizar', state.error);
        } else CAviso.err('No se pudo actualizar', j.error || 'HTTP ' + r.status);
      }
      if (ok) await refreshRest();
    } catch (e) {
      state.error = String(e);
      render();
      CAviso.err('No se pudo actualizar', 'Sin conexión con el servidor.');
    }
    setRefresh(ok ? 'done' : 'error', ok ? (history ? 'Fecha actualizada' : 'Actualizado') : 'No se pudo');
    if (ok) {
      // la barra de indicadores destella para mostrar que las cifras ya son las nuevas
      const k = $('#kpis');
      if (k) { k.classList.remove('is-fresh'); void k.offsetWidth; k.classList.add('is-fresh'); }
    }
    setTimeout(() => { refreshing = false; setRefresh('idle'); }, ok ? 2200 : 3200);
  }

  function setWindow(h) {
    state.window = h;
    state.focus = null;
    document.querySelectorAll('.seg [data-win]').forEach(b =>
      b.setAttribute('aria-pressed', String(Number(b.dataset.win) === h)));
    applyWms();
    if (state.date) { syncUrl(); loadHistory(); } else render();
  }

  function set(sel, html) { const el = $(sel); if (el) el.innerHTML = html; }

  function render() {
    const d = state.data;
    const chip = $('#src-chip');

    if (d) {
      const now = d.meta.now;
      const evs = visibleEvents(d);
      const activas = d.alerts.filter(a => ['nueva', 'activa'].includes(a.status));
      const crit = activas.filter(a => a.severity === 'critico').length;
      const has = d.meta.fetched_at > 0;
      const dash = has ? '0' : '—';

      set('#kpi-focos', has ? evs.length : '—');
      const nPts = visiblePoints(d).length;
      set('#kpi-focos-sub', `${CFmt.num(nPts)} detecciones de satélite · ${crit} crítica(s)`);
      set('#kpi-zonas', has ? new Set(activas.map(a => a.zone_id)).size : '—');
      set('#kpi-frp', `${has ? CFmt.num(evs.reduce((s, e) => s + e.frp_max, 0)) : dash}<b> MW</b>`);

      const okSrc = Object.values(d.meta.sources || {}).filter(s => s.ok).length;
      const nSrc = Object.keys(d.meta.sources || {}).length || 5;
      set('#kpi-fuentes', `${has ? okSrc : '—'}<b> / ${nSrc}</b>`);
      const badSrc = Object.entries(d.meta.sources || {}).filter(([, s]) => !s.ok).map(([k]) => k.replace(/_NRT$/, ''));
      set('#kpi-fuentes-sub', badSrc.length ? `Sin datos: ${badSrc.join(', ')}` : 'VIIRS S-NPP / NOAA-20 / NOAA-21 · MODIS · GOES');

      // última adquisición satelital real (no la hora de la consulta)
      const lastAcq = state.focus
        ? Math.max(0, ...visiblePoints(d).map(p => p[2]))
        : Math.max(0, ...Object.values(d.meta.sources || {}).map(s => s.last_acq || 0));
      if (state.date) {
        set('#kpi-latencia', lastAcq ? CFmt.hora(lastAcq) : '—');
        set('#kpi-latencia-sub', lastAcq
          ? 'última pasada · ' + new Date(lastAcq * 1000).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
          : 'sin pasadas con detecciones');
      } else {
        set('#kpi-latencia', lastAcq ? CFmt.hace(lastAcq) : '—');
        set('#kpi-latencia-sub', lastAcq ? 'desde que pasó el satélite' : 'sin detecciones en los últimos 3 días');
      }

      const peligro = Math.min(100, Math.round(
        activas.reduce((s, a) => s + ({ info: 5, medio: 15, alto: 30, critico: 50 }[a.severity] || 0), 0)
      ));
      set('#kpi-peligro', `${has ? peligro : '—'}<b> / 100</b>`);
      const bar = $('#kpi-peligro-bar');
      let lab = 'Bajo', col = 'var(--risk-low)';
      if (peligro >= 75) { lab = 'Extremo'; col = 'var(--risk-critical)'; }
      else if (peligro >= 45) { lab = 'Alto'; col = 'var(--risk-high)'; }
      else if (peligro >= 20) { lab = 'Moderado'; col = 'var(--risk-moderate)'; }
      if (bar) { bar.style.transform = `scaleX(${peligro / 100})`; bar.style.background = col; }
      set('#regional-level', has ? lab : '—');
      const rd = $('#regional-dot');
      if (rd) { rd.style.background = col; rd.style.boxShadow = `0 0 0 4px color-mix(in srgb, ${col} 22%, transparent)`; }

      const upd = $('#updated');
      if (upd) upd.textContent = d.meta.fetched_at ? CFmt.hora(d.meta.fetched_at) : '—';
      const badge = $('#stale-badge');
      const off = !!d.meta.offline;
      if (badge) {
        badge.hidden = !(d.meta.stale || off);
        badge.textContent = off ? 'Sin internet' : 'Datos con retraso';
        badge.title = off ? 'No hay conexión a internet: se muestran los últimos datos que se descargaron con conexión.' : '';
      }
      if (chip) chip.textContent = d.meta.refreshing ? 'Actualizando datos…'
        : off && d.meta.fetched_at ? `Sin internet · datos del ${CFmt.fecha(d.meta.fetched_at)}`
        : (d.meta.fetched_at ? `NASA FIRMS · descargado a las ${CFmt.hora(d.meta.fetched_at)}` : 'NASA FIRMS');
      document.body.classList.toggle('is-offline', off);
      if (!state.date) announceLink(off, d.meta.fetched_at);
    }

    // con un día/hora del historial la ventana 24/48/72 h no aplica
    document.querySelectorAll('.seg [data-win]').forEach(b =>
      b.setAttribute('aria-pressed', String(!state.focus && Number(b.dataset.win) === state.window)));
    if (chip) {
      chip.classList.toggle('is-history', !!state.date);
      if (state.date) {
        const h = state.data && state.data.meta.history;
        const sats = window.CCobertura ? CCobertura.label(h ? h.start : state.date, h ? h.date : state.date) : '';
        const guardado = state.data && state.data.meta && state.data.meta.offline ? ' · guardado, sin internet' : '';
        chip.textContent = state.loading ? 'Consultando FIRMS…' : `Histórico · ${histRange()}${sats ? ' · ' + sats : ''}${guardado}`;
        chip.title = sats ? `Satélites con lecturas en esta fecha: ${sats}` : '';
      }
    }
    const rbtn = $('#refresh');
    if (rbtn && !refreshing) { const t = rbtn.querySelector('.rbtn__txt'); if (t) t.textContent = idleLabel(); }

    if (state.error && chip) chip.textContent = state.date ? 'Error: ' + state.error : 'Sin conexión con el servidor';

    // los subtítulos de los indicadores no caben en la barra compacta: quedan como ayuda al pasar el cursor
    document.querySelectorAll('.kpi').forEach(k => {
      const sub = k.querySelector('.kpi__sub');
      if (sub && sub.textContent.trim()) k.title = sub.textContent.trim();
    });

    subs.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
  }

  let wmsInit = false;

  const TABS = ['alertas', 'fuentes', 'zonas', 'historial'];

  function setTab(name, push = true) {
    if (!TABS.includes(name)) name = 'alertas';
    TABS.forEach(n => {
      const tab = document.getElementById('tab-' + n);
      const panel = document.getElementById('panel-' + n);
      if (tab) {
        tab.setAttribute('aria-selected', String(n === name));
        tab.tabIndex = n === name ? 0 : -1; // tabindex móvil (patrón APG)
      }
      if (panel) panel.classList.toggle('is-active', n === name);
    });
    // la URL refleja el estado: se puede compartir y el botón atrás funciona
    if (push && location.hash.slice(1) !== name) history.pushState({ tab: name }, '', '#' + name);
  }

  function boot() {
    if (window.CMap) CMap.init();

    document.querySelectorAll('.tabs .tab').forEach(t =>
      t.addEventListener('click', () => setTab(t.id.replace('tab-', ''))));
    // flechas izquierda/derecha entre pestañas (patrón APG de tablist)
    document.querySelector('.tabs').addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const cur = TABS.findIndex(n => document.getElementById('tab-' + n).getAttribute('aria-selected') === 'true');
      const next = (cur + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
      e.preventDefault();
      setTab(TABS[next]);
      document.getElementById('tab-' + TABS[next]).focus();
    });
    setTab(location.hash.slice(1) || 'alertas', false);
    window.addEventListener('popstate', () => setTab(location.hash.slice(1) || 'alertas', false));

    document.querySelectorAll('.seg [data-win]').forEach(b =>
      b.addEventListener('click', () => setWindow(Number(b.dataset.win))));

    const rb = $('#refresh');
    if (rb) rb.addEventListener('click', refreshNow);

    const wt = $('#wms-toggle');
    if (wt) wt.addEventListener('change', applyWms);

    const pt = $('#pts-toggle');
    if (pt && window.CMap) pt.addEventListener('change', () => CMap.setPoints(pt.checked));
    setView(state.view);
    const live = $('#live-btn');
    if (live) live.addEventListener('click', () => setDate(null));

    // fija la capa WMS según la configuración del servidor en la primera carga de datos
    subs.push(s => {
      if (wmsInit || !s.data || !wt || !window.CMap) return;
      wmsInit = true;
      wt.checked = !!s.data.meta.wms_default_on;
      applyWms();
    });

    const q = new URLSearchParams(location.search);
    const qw = Number(q.get('ventana'));
    if ([24, 48, 72].includes(qw)) {
      state.window = qw;
      document.querySelectorAll('.seg [data-win]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.win) === qw)));
    }
    const qh = q.get('hora');
    if (q.get('fecha') && (q.get('ventana') === 'dia' || qh !== null)) {
      const qq = q.get('cuarto');
      setFocus(q.get('fecha'), qh !== null && /^\d{1,2}$/.test(qh) && Number(qh) < 24 ? Number(qh) : null,
        qq !== null && /^[0-3]$/.test(qq) ? Number(qq) : null);
    } else if (q.get('fecha')) setDate(q.get('fecha'));
    else { applyWms(); poll(); }
    state.booted = true;
  }

  document.addEventListener('DOMContentLoaded', boot);

  return {
    state,
    on: fn => subs.push(fn),
    refreshNow,
    setWindow,
    setDate,
    setFocus,
    applyImagery: () => applyWms(),
    setView,
    visibleEvents,
    visiblePoints,
    localParts,
    localToEpoch,
    focusBounds,
    plusDay,
    setTab,
    render,
    markSeen: (id, sev) => { state.seen[id] = sev; saveSeen(); },
  };
})();
