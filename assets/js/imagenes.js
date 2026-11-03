/* Imagen satelital del mapa: FIRMS (por día) o GOES-East de NASA GIBS (cada 10 min, color o calor).
   La hora de la imagen GOES sigue al día/hora/cuarto elegido y se ajusta con un deslizador de 10 min. */
window.CImagen = (() => {
  const $ = s => document.querySelector(s);
  const KEY = 'centinela.imagen';
  const STEP = 600;
  let src = 'firms', goes = null, goesAt = 0, timer = null, userT = null, lastCtx = '';

  try { const v = localStorage.getItem(KEY); if (['firms', 'color', 'calor'].includes(v)) src = v; } catch { /* sin almacenamiento */ }

  const fmt = t => new Date(t * 1000).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });

  async function loadGoes(force) {
    if (goes && !force && Date.now() - goesAt < 600000) return goes;
    try {
      const r = await fetch('api/goes.php', { cache: 'no-store' });
      if (r.ok) { goes = await r.json(); goesAt = Date.now(); }
    } catch { /* sin conexión: se usa lo último que haya */ }
    return goes;
  }

  /** Instante con imagen más cercano a t dentro de [a, b); null si no hay ninguno. */
  function snap(iv, t, a, b) {
    let best = null, bestD = Infinity;
    for (const [s, e] of iv) {
      if (e < a || s >= b) continue;
      const lo = Math.max(s, a), hi = Math.min(e, b - 1);
      let c = Math.min(Math.max(t, lo), hi);
      c = s + Math.round((c - s) / STEP) * STEP;
      if (c > hi) c -= STEP;
      if (c < lo) continue;
      const dd = Math.abs(c - t);
      if (dd < bestD) { best = c; bestD = dd; }
    }
    return best;
  }

  /**
   * Focos que GOES detectó en el escaneo del instante t (cada 10 min) dentro de los datos ya cargados.
   * Se dibujan sobre la imagen y se devuelve la frase para la nota del deslizador.
   */
  function showScan(t) {
    const d = CApp.state.data;
    if (!d || !d.points) { CMap.setScan([]); return ''; }
    const pts = d.points.filter(p => p[4].startsWith('GOES') && p[2] >= t - 300 && p[2] < t + 300);
    CMap.setScan(pts);
    return pts.length
      ? ` · GOES detectó ${pts.length} ${pts.length === 1 ? 'foco' : 'focos'} en Guerrero a esta hora`
      : ' · GOES no detectó focos en Guerrero a esta hora';
  }

  /** Rango de tiempo y hora sugerida según el modo (en vivo, fecha, día u hora del historial). */
  function context(latest) {
    const st = CApp.state;
    if (st.focus) {
      const [a, b] = CApp.focusBounds(st.focus);
      const [da, db] = CApp.focusBounds({ day: st.focus.day, hour: null });
      // con hora elegida se sugiere su inicio; con el día completo, las 14:00 (máxima actividad del fuego)
      return { a: da, b: db, t: st.focus.hour != null ? a : CApp.localToEpoch(st.focus.day, 14), key: `f${a}-${b}` };
    }
    if (st.date) {
      const start = CApp.plusDay(st.date, -(st.window / 24 - 1));
      return { a: CApp.localToEpoch(start), b: CApp.localToEpoch(CApp.plusDay(st.date, 1)), t: CApp.localToEpoch(st.date, 14), key: `d${st.date}${st.window}` };
    }
    const now = Math.floor(Date.now() / 1000);
    const end = latest || now;
    return { a: end - st.window * 3600, b: end + 1, t: end, key: `live${st.window}` };
  }

  /** Qué imagen se ve ahora, para el sello de tiempo. */
  let last = null;
  function shown() {
    const wmsOn = $('#wms-toggle') ? $('#wms-toggle').checked : true;
    if (!wmsOn) return { kind: 'off' };
    const st = CApp.state;
    if (src === 'firms') {
      if (st.view === 'calor') return { kind: 'none', label: 'ninguna, se ve el mapa de calor' };
      if (st.focus && st.focus.hour != null) return { kind: 'none', label: 'ninguna, se ven los píxeles detectados del periodo' };
      return { kind: 'daily', label: `detecciones diarias de FIRMS (${st.window} h)` };
    }
    return last || { kind: 'none', label: 'consultando…' };
  }

  async function apply() {
    const r = await applyInner();
    document.dispatchEvent(new Event('centinela:imagen'));
    return r;
  }

  async function applyInner() {
    const box = $('#goes-box');
    const on = $('#wms-toggle') ? $('#wms-toggle').checked : true;
    const day = dayOf();
    if (viewDay !== day) { viewProd = null; viewDay = day; } // al cambiar de fecha se olvida qué imagen guardada se estaba viendo
    document.querySelectorAll('[name="imgsrc"]').forEach(r => (r.checked = r.value === src));
    if (src === 'firms' || !on) {
      if (box) box.hidden = true;
      CMap.setGoes(null);
      CMap.setLocalImage(null);
      CMap.setScan([]);
      refreshSaved(day); // sin esperar: el aviso de imágenes guardadas se ve aunque la imagen sea la de FIRMS
      return false; // la app pinta la capa FIRMS
    }
    box.hidden = false;
    const g = await loadGoes(!CApp.state.date);
    const layer = g && g.layers[src];
    const ctx = context(layer && layer.latest);
    mode = 'nasa';
    if (ctx.key !== lastCtx) { userT = null; lastCtx = ctx.key; }
    const slider = $('#goes-time');
    const local = day ? await loadSaved(day) : null;
    renderDl(day, local);
    // si se pidió ver una imagen guardada (botón "Ver en el mapa" o recién descargada) se usa esa, no la de NASA
    const saved = viewProd ? localFrames(local, day) : [];
    const t = layer && !saved.length ? snap(layer.intervals, userT ?? ctx.t, ctx.a, ctx.b) : null;
    if (saved.length) { CMap.setGoes(null); return showLocal(saved); }
    if (t == null) {
      CMap.setGoes(null);
      CMap.setScan([]);
      last = { kind: 'none', label: 'sin imagen GOES para estas fechas' };
      // sin imagen en NASA: se usan las descargadas al servidor (GOES del mismo tipo o color real del día)
      const list = localFrames(local, day);
      if (list.length) return showLocal(list);
      CMap.setLocalImage(null);
      slider.disabled = true;
      $('#goes-label').textContent = 'Sin imagen GOES para estas fechas';
      $('#goes-note').textContent = day
        ? 'NASA ya no publica las imágenes de 10 min de esta fecha. Puedes descargarlas abajo, en «Imágenes guardadas».'
        : 'NASA solo guarda las imágenes de 10 min de las últimas semanas. Se muestra la capa diaria de FIRMS.';
      return false;
    }
    CMap.setLocalImage(null);
    slider.disabled = false;
    slider.min = ctx.a; slider.max = ctx.b - STEP; slider.step = STEP; slider.value = t;
    $('#goes-label').textContent = fmt(t) + ' h';
    $('#goes-note').textContent = (src === 'calor'
      ? 'GOES-East · zonas calientes en rojo, cada 10 min'
      : 'GOES-East · color real con humo y nubes, cada 10 min') + showScan(t);
    last = { kind: 'goes', label: src === 'calor' ? 'GOES-East calor' : 'GOES-East a color', t };
    // sin internet el mapa solo puede mostrar los mosaicos que ya se habían descargado al verlos con conexión
    if (!navigator.onLine) $('#goes-note').textContent += ' · Sin internet: solo se ven los mosaicos ya descargados';
    CMap.setGoes(layer.id, new Date(t * 1000).toISOString().replace('.000', ''), g.matrix, src);
    return true;
  }

  /* ---------- imágenes descargadas al servidor ---------- */
  let mode = 'nasa', frames = [], busy = false;
  let viewProd = null, viewDay = null; // 'goes_color' | 'goes_calor' | 'diario': imagen guardada que se pidió ver
  const savedCache = {};
  const DAILY = ['noaa20', 'noaa21', 'snpp', 'aqua', 'terra'];
  const fday = d => new Date(d + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const hhmm = t => new Date(t * 1000).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
  const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

  // día local que se está viendo: el del historial o la fecha elegida
  function dayOf() {
    const st = CApp.state;
    return st.focus ? st.focus.day : st.date || null;
  }

  async function loadSaved(day, force) {
    if (savedCache[day] && !force) return savedCache[day];
    try {
      const r = await fetch(`api/imagenes.php?action=status&date=${day}`, { cache: 'no-store' });
      if (r.ok) savedCache[day] = await r.json();
    } catch { /* sin conexión */ }
    return savedCache[day] || null;
  }

  async function refreshSaved(day) {
    const st = day ? await loadSaved(day) : null;
    if (dayOf() === day) renderDl(day, st);
  }

  /** Imágenes guardadas utilizables en el modo actual, ordenadas por hora. */
  function localFrames(st, day) {
    if (!st) return [];
    const P = st.products;
    const goesKey = src === 'calor' ? 'goes_calor' : 'goes_color';
    let out = [];
    if (viewProd === 'diario') {
      DAILY.forEach(k => (P[k].saved || []).forEach(t => out.push({ p: k, t, label: P[k].label })));
    } else {
      out = (P[goesKey].saved || []).map(t => ({ p: goesKey, t, label: P[goesKey].label }));
      if (!out.length && src === 'color') {
        DAILY.forEach(k => (P[k].saved || []).forEach(t => out.push({ p: k, t, label: P[k].label })));
      }
    }
    return out.sort((a, b) => a.t - b.t)
      .map(f => ({ ...f, url: `data/imagenes/${day}/${f.p}_${f.t}.webp` }));
  }

  function showLocal(list) {
    mode = 'local';
    frames = list;
    const slider = $('#goes-time');
    const want = userT ?? context().t;
    let i = 0;
    list.forEach((f, k) => { if (Math.abs(f.t - want) < Math.abs(list[i].t - want)) i = k; });
    slider.disabled = list.length < 2;
    slider.min = 0; slider.max = Math.max(0, list.length - 1); slider.step = 1; slider.value = i;
    drawLocal(i);
    return true;
  }

  function drawLocal(i) {
    const f = frames[i];
    if (!f) return;
    const daily = DAILY.includes(f.p);
    $('#goes-label').textContent = `${fmt(f.t)} h${daily ? ' aprox.' : ''}`;
    $('#goes-note').textContent = `${f.label} · imagen descargada (${i + 1} de ${frames.length})` + (daily ? '' : showScan(f.t));
    if (daily) CMap.setScan([]);
    last = { kind: 'goes', label: daily ? `${f.label} (aprox.)` : f.label, t: f.t };
    document.dispatchEvent(new Event('centinela:imagen'));
    CMap.setLocalImage(f.url, f.p === 'goes_calor' ? 0.9 : 0.85);
  }

  /** Lo guardado del día agrupado para mostrarlo: [{key, label, detail, ts}]. */
  function savedGroups(P) {
    const out = [];
    const range = ts => (ts.length === 1 ? `a las ${hhmm(ts[0])} h` : `${ts.length} imágenes, de ${hhmm(ts[0])} a ${hhmm(ts[ts.length - 1])} h`);
    ['goes_color', 'goes_calor'].forEach(k => {
      const ts = P[k].saved || [];
      if (ts.length) out.push({ key: k, label: P[k].label, detail: range(ts) });
    });
    const daily = [];
    DAILY.forEach(k => (P[k].saved || []).forEach(t => daily.push({ t, name: P[k].label.replace(/^(VIIRS|MODIS) /, '') })));
    daily.sort((a, b) => a.t - b.t);
    if (daily.length) out.push({ key: 'diario', label: 'Color real del día', detail: daily.map(d => `${d.name} ${hhmm(d.t)} h`).join(', ') });
    return out;
  }

  function isViewing(key) {
    if (src === 'firms') return false;
    if (key === 'diario') return viewProd === 'diario' || (src === 'color' && mode === 'local' && frames.length && DAILY.includes(frames[0].p));
    if (viewProd === 'diario') return false;
    return key === (src === 'calor' ? 'goes_calor' : 'goes_color');
  }

  let dlDay = null;
  /** Panel "Imágenes guardadas": qué hay en el servidor para la fecha y, solo si falta algo, qué se puede descargar. */
  function renderDl(day, st) {
    const box = $('#dl-box');
    if (!box) return;
    box.hidden = !day || !st;
    if (box.hidden || busy) return;
    if (dlDay !== day) { // otra fecha: se limpia el resultado de la descarga anterior
      dlDay = day;
      const m = $('#dl-status');
      m.textContent = ''; m.className = 'dlbox__status';
    }
    const P = st.products;
    const groups = savedGroups(P);
    const mb = st.bytes ? ` · ${st.bytes < 1048576 ? Math.max(1, Math.round(st.bytes / 1024)) + ' KB' : (st.bytes / 1048576).toFixed(1) + ' MB'}` : '';
    $('#dl-title').textContent = groups.length ? `Hay imágenes guardadas del ${fday(day)}${mb}` : `Sin imágenes guardadas del ${fday(day)}`;
    $('#dl-list').innerHTML = groups.map(g => {
      const v = isViewing(g.key);
      return `<li class="dlbox__item">
        <span class="dlbox__what"><b>${esc(g.label)}</b><small>${esc(g.detail)}</small></span>
        <button type="button" class="dlbox__view" data-view="${g.key}"${v ? ' disabled' : ''}>${v ? 'Se ve en el mapa' : 'Ver en el mapa'}</button>
      </li>`;
    }).join('');

    // solo se ofrece descargar lo que todavía no está en el servidor
    const dailySaved = DAILY.some(k => (P[k].saved || []).length);
    const opts = [];
    if (!dailySaved) opts.push('<option value="diario">Color real del día (10:30 y 13:30, ~0.25 MB)</option>');
    if (P.goes_color.available && !(P.goes_color.saved || []).length) opts.push('<option value="goes_color">GOES color (de noche, una por hora)</option>');
    if (P.goes_calor.available && !(P.goes_calor.saved || []).length) opts.push('<option value="goes_calor">GOES calor (solo de día)</option>');
    const sel = $('#dl-what');
    const prev = sel.value;
    sel.innerHTML = opts.join('');
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
    $('#dl-new').hidden = !opts.length || !!st.offline; // sin internet no hay nada que descargar
    $('#dl-step-wrap').hidden = !sel.value.startsWith('goes');
    $('#dl-hint').textContent = st.offline
      ? 'Sin internet: no se pueden descargar imágenes nuevas. Las que ya guardaste se ven igual.'
      : !groups.length
      ? 'Los puntos de calor del mapa vienen de las detecciones de FIRMS; las imágenes son aparte y aún no están en el servidor.'
      : opts.length ? 'Puedes descargar también:' : '';
    $('#dl-hint').hidden = !$('#dl-hint').textContent;
    $('#dl-del').hidden = !groups.length;
  }

  async function post(url) {
    const r = await fetch(url, { method: 'POST', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  }

  function setStatus(text, kind = '') {
    const m = $('#dl-status');
    m.textContent = text;
    m.className = 'dlbox__status' + (kind ? ' is-' + kind : '');
  }

  async function download() {
    const day = dayOf();
    if (!day || busy) return;
    const what = $('#dl-what').value;
    const step = $('#dl-step').value;
    const bar = $('#dl-bar'), btn = $('#dl-go');
    busy = true; btn.disabled = true; bar.hidden = false;
    const tally = { saved: 0, skipped: 0, empty: 0, failed: 0, bytes: 0 };
    const add = j => Object.keys(tally).forEach(k => (tally[k] += j[k] || 0));
    const progress = (done, total) => {
      bar.firstElementChild.style.width = `${Math.round((100 * done) / Math.max(1, total))}%`;
      setStatus(`Descargando… ${done} de ${total}`);
    };
    let ok = false, text;
    try {
      if (what === 'diario') {
        progress(0, 2);
        add(await post(`api/imagenes.php?action=download&date=${day}&product=diario`));
        progress(2, 2);
      } else {
        let from = 0;
        while (from !== null) {
          const j = await post(`api/imagenes.php?action=download&date=${day}&product=${what}&step=${step}&from=${from}&count=12`);
          add(j);
          from = j.next;
          progress(from === null ? j.total : from, j.total);
        }
      }
      ok = tally.saved > 0;
      const kb = tally.bytes ? ` (${tally.bytes < 1048576 ? Math.round(tally.bytes / 1024) + ' KB' : (tally.bytes / 1048576).toFixed(1) + ' MB'})` : '';
      text = ok
        ? `Listo: se guardaron ${tally.saved} ${tally.saved === 1 ? 'imagen nueva' : 'imágenes nuevas'}${kb}.${tally.empty ? ` ${tally.empty} sin datos en NASA.` : ''}${tally.failed ? ` ${tally.failed} con error.` : ''}`
        : `No se guardó ninguna imagen: ${tally.empty ? 'NASA no tiene imágenes de este día' : tally.failed ? 'NASA no respondió' : 'ya estaban guardadas'}.`;
    } catch (e) {
      text = 'No se pudo descargar: ' + e.message;
    }
    busy = false; btn.disabled = false;
    setTimeout(() => (bar.hidden = true), 800);
    await loadSaved(day, true);
    if (ok) {
      // se pasa a ver lo recién guardado: así el cambio se nota en el mapa
      viewProd = what;
      viewDay = day;
      src = what === 'goes_calor' ? 'calor' : 'color';
      try { localStorage.setItem(KEY, src); } catch { /* sin almacenamiento */ }
      userT = null;
    }
    await CApp.applyImagery();
    setStatus(text + (ok ? ' Ya se ve en el mapa.' : ''), ok ? 'done' : 'err');
    if (!ok) CAviso.err('No se descargaron imágenes', text.replace(/^No se guardó ninguna imagen: /, ''));
    if (ok) {
      const box = $('#dl-box');
      box.classList.remove('is-flash');
      void box.offsetWidth; // reinicia la animación
      box.classList.add('is-flash');
      const g = savedGroups(savedCache[day].products).find(x => x.key === what);
      $('#dl-status').scrollIntoView({ block: 'nearest' });
      CAviso.ok(`Imágenes del ${fday(day)} guardadas`, `${g ? g.detail + '. ' : ''}Ahora se ven en el mapa.`);
      CAviso.jump($('#dl-list .dlbox__view:disabled'));
    }
  }

  async function removeDay() {
    const day = dayOf();
    if (!day || busy || !confirm(`¿Borrar del servidor las imágenes guardadas del ${fday(day)}?`)) return;
    await post(`api/imagenes.php?action=delete&date=${day}`);
    viewProd = null;
    await loadSaved(day, true);
    setStatus('Imágenes borradas del servidor.', '');
    CAviso.ok('Imágenes borradas', `Se quitaron del servidor las del ${fday(day)}.`);
    CApp.applyImagery();
  }

  /** "Ver en el mapa" de una imagen ya guardada. */
  function viewSaved(key) {
    viewProd = key;
    viewDay = dayOf();
    src = key === 'goes_calor' ? 'calor' : 'color';
    try { localStorage.setItem(KEY, src); } catch { /* sin almacenamiento */ }
    userT = null;
    CApp.applyImagery();
  }

  function onSlide() {
    const s = $('#goes-time');
    clearTimeout(timer);
    if (mode === 'local') {
      const f = frames[Number(s.value)];
      if (!f) return;
      $('#goes-label').textContent = fmt(f.t) + ' h';
      timer = setTimeout(() => { userT = f.t; drawLocal(Number(s.value)); }, 120);
      return;
    }
    $('#goes-label').textContent = fmt(Number(s.value)) + ' h';
    timer = setTimeout(() => { userT = Number(s.value); CApp.applyImagery(); }, 250);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[name="imgsrc"]').forEach(r => r.addEventListener('change', () => {
      src = r.value;
      try { localStorage.setItem(KEY, src); } catch { /* sin almacenamiento */ }
      userT = null;
      viewProd = null; // el usuario eligió otra fuente: ya no se fuerza la imagen guardada
      CApp.applyImagery();
    }));
    $('#goes-time').addEventListener('input', onSlide);
    $('#dl-go').addEventListener('click', download);
    $('#dl-del').addEventListener('click', removeDay);
    $('#dl-list').addEventListener('click', e => {
      const b = e.target.closest('[data-view]');
      if (b && !b.disabled) viewSaved(b.dataset.view);
    });
    $('#dl-what').addEventListener('change', () => ($('#dl-step-wrap').hidden = !$('#dl-what').value.startsWith('goes')));
  });

  // al llegar datos nuevos (o cambiar de fecha) se vuelven a contar los focos del instante mostrado
  document.addEventListener('DOMContentLoaded', () => {
    if (window.CApp) CApp.on(s => {
      if (!s.data || src === 'firms') return;
      const tt = Number($('#goes-time').value);
      if (mode === 'nasa' && tt && !$('#goes-box').hidden && !$('#goes-time').disabled) {
        $('#goes-note').textContent = ($('#goes-note').textContent.split(' · GOES ')[0]) + showScan(tt);
      }
    });
  });

  return { apply, shown, src: () => src };
})();
