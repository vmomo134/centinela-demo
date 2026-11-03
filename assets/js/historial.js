/* Pestaña "Historial": días con detecciones de fuego y días con imagen satelital de un mes,
   con el desglose por hora (local) y satélite. Un clic abre ese día u hora en el mapa. */
window.CHistorial = (() => {
  const $ = s => document.querySelector(s);
  const cache = {};
  let month = null, req = 0, loaded = false;

  const curMonth = () => {
    const p = CApp.localParts(Date.now() / 1000);
    return p.day.slice(0, 7);
  };
  const shift = (m, n) => {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + n, 1));
    return d.toISOString().slice(0, 7);
  };
  const fMonth = m => new Date(m + '-15T12:00:00Z').toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const hh = h => String(h).padStart(2, '0') + ':00';
  const n = v => Number(v).toLocaleString('es-MX');
  const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

  // una sola consulta por mes (cada una gasta cuota de FIRMS), compartida con el calendario de fecha.js
  const pending = {};
  function fetchMonth(m, force = false) {
    if (!force && cache[m]) return Promise.resolve(cache[m]);
    if (!pending[m]) {
      pending[m] = fetch('api/calendar.php?month=' + m + (force ? '&refresh=1' : ''), { cache: 'no-store' })
        .then(async r => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
          cache[m] = j;
          return j;
        })
        .finally(() => { delete pending[m]; });
    }
    return pending[m];
  }

  async function load(m) {
    month = m;
    const inp = $('#hist-month');
    inp.value = m;
    $('#hist-next').disabled = m >= curMonth();
    $('#hist-prev').disabled = m <= '2001-01';
    const id = ++req;
    if (!cache[m]) {
      $('#hist-meta').textContent = 'Consultando FIRMS…';
      $('#hist-sum').innerHTML = '';
      $('#hist-days').innerHTML = '<li class="hempty">Buscando detecciones de ' + esc(fMonth(m)) + '… puede tardar unos segundos la primera vez.</li>';
      try {
        await fetchMonth(m);
      } catch (e) {
        if (id !== req) return;
        $('#hist-meta').textContent = '';
        $('#hist-days').innerHTML = `<li class="hempty">No se pudo consultar el historial: ${esc(e.message)}. Inténtalo de nuevo.</li>`;
        return;
      }
    }
    if (id === req) render();
  }

  function render() {
    const j = cache[month];
    if (!j) return;
    const onlyFire = $('#hist-only-fire').checked;
    const img = new Set(j.imagery || []);
    const img10 = new Set(j.imagery_goes || []);
    const fireDays = Object.keys(j.days);
    const total = fireDays.reduce((s, d) => s + j.days[d].count, 0);

    $('#hist-meta').textContent = j.offline ? 'Sin internet · datos guardados'
      : j.ok ? '' : 'Algunas consultas fallaron; datos parciales';
    $('#hist-sum').innerHTML = `
      <div><b>${fireDays.length}</b><span>días con incendios</span></div>
      <div><b>${n(total)}</b><span>detecciones</span></div>
      <div><b>${img.size}</b><span>días con imagen${img10.size ? ` · ${img10.size} cada 10 min` : ''}</span></div>`;

    // todos los días del mes que ya pasaron, del más reciente al más antiguo
    const all = new Set([...fireDays, ...img]);
    let days = [...all].filter(d => d.startsWith(month)).sort().reverse();
    if (onlyFire) days = days.filter(d => j.days[d]);

    const f = CApp.state.focus;
    if (!days.length) {
      $('#hist-days').innerHTML = `<li class="hempty">${onlyFire
        ? `Sin detecciones de fuego en ${esc(fMonth(month))}. Desmarca "Solo días con incendios" para ver los días con imagen satelital.`
        : `No hay datos satelitales publicados para ${esc(fMonth(month))}.`}</li>`;
      return;
    }

    $('#hist-days').innerHTML = days.map(d => {
      const info = j.days[d];
      const sel = f && f.day === d;
      const hours = info ? Object.entries(info.hours) : [];
      return `
      <li class="hday${sel ? ' is-selected' : ''}${info ? '' : ' hday--quiet'}">
        <button type="button" class="hday__head" data-day="${d}" aria-pressed="${sel && f.hour == null}">
          <span class="hday__date">${esc(fDay(d))}</span>
          <span class="hday__stats">${info
            ? `<b>${n(info.count)}</b> ${info.count === 1 ? 'detección' : 'detecciones'} · FRP máx. ${Math.round(info.frp_max)} MW`
            : 'Sin detecciones'}</span>
          <span class="hday__badges">
            ${img.has(d) ? '<span class="hday__img" title="Imagen de detecciones de FIRMS acumulada del día">Imagen diaria</span>' : ''}
            ${img10.has(d) ? '<span class="hday__img hday__img--goes" title="Imágenes de GOES-East cada 10 minutos en NASA GIBS">Cada 10 min</span>' : ''}
          </span>
        </button>
        ${hours.length ? `<div class="hhours" role="group" aria-label="Pasadas por hora del ${esc(fDay(d))}">${hours.map(([h, x]) => `
          <button type="button" class="hhour${sel && f.hour === Number(h) ? ' is-on' : ''}" data-day="${d}" data-hour="${h}"
            aria-pressed="${sel && f.hour === Number(h)}"
            title="${esc(Object.entries(x.sats).map(([s, c]) => `${s}: ${c}`).join(' · '))} · FRP máx. ${Math.round(x.frp_max)} MW">
            <span class="hhour__t">${hh(h)}</span>
            <span class="hhour__n">${n(x.count)}</span>
            <span class="hhour__s">${esc(satLabel(x.sats))}</span>
          </button>`).join('')}</div>` : ''}
        ${sel && f.hour != null && info && info.hours[f.hour] ? quarters(d, f, info.hours[f.hour]) : ''}
      </li>`;
    }).join('');
  }

  // satélites de una hora: los polares por nombre y GOES agrupado (lee cada 10 min)
  function satLabel(sats) {
    const names = Object.keys(sats);
    const polar = names.filter(s => !s.startsWith('GOES'));
    return [...polar, ...(polar.length < names.length ? ['GOES'] : [])].join(', ');
  }

  /** Cuartos de hora de la hora elegida, con su número de detecciones. */
  function quarters(d, f, x) {
    const qs = x.quarters || [0, 0, 0, 0];
    const h = String(f.hour).padStart(2, '0');
    return `<div class="hquarters" role="group" aria-label="Cuartos de hora de las ${h}:00">
      <button type="button" class="hq${f.q == null ? ' is-on' : ''}" data-day="${d}" data-hour="${f.hour}" aria-pressed="${f.q == null}">Toda la hora</button>
      ${qs.map((c, q) => `<button type="button" class="hq${f.q === q ? ' is-on' : ''}${c ? '' : ' hq--empty'}" data-day="${d}" data-hour="${f.hour}" data-q="${q}" aria-pressed="${f.q === q}">
        ${h}:${String(q * 15).padStart(2, '0')}<span>${c ? n(c) : '—'}</span></button>`).join('')}
    </div>`;
  }

  function onClick(e) {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    const h = b.dataset.hour;
    const q = b.dataset.q;
    CApp.setFocus(b.dataset.day, h == null ? null : Number(h), q == null ? null : Number(q));
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#hist-days').addEventListener('click', onClick);
    $('#hist-prev').addEventListener('click', () => load(shift(month, -1)));
    $('#hist-next').addEventListener('click', () => load(shift(month, 1)));
    $('#hist-month').addEventListener('change', e => {
      const v = e.target.value;
      if (/^\d{4}-\d{2}$/.test(v) && v <= curMonth()) load(v);
    });
    $('#hist-only-fire').addEventListener('change', render);
    $('#hist-month').max = curMonth();

    // se consulta al abrir la pestaña por primera vez (cada mes gasta cuota de FIRMS)
    const open = () => {
      if (loaded) return;
      loaded = true;
      // el mes de la fecha elegida (en el estado o, al arrancar, en la URL)
      const f = CApp.state.focus;
      const fecha = (f && f.day) || CApp.state.date || new URLSearchParams(location.search).get('fecha') || '';
      load(/^\d{4}-\d{2}/.test(fecha) && fecha.slice(0, 7) <= curMonth() ? fecha.slice(0, 7) : curMonth());
    };
    $('#tab-historial').addEventListener('click', open);
    if (location.hash === '#historial') open();
    // mantener resaltado el día/hora elegidos cuando cambian desde otro control
    CApp.on(() => { if (loaded) render(); });
  });

  /** Recarga del sistema: se descarta lo guardado en el navegador y se vuelve a consultar el mes (el de la fecha elegida o el actual). */
  async function refresh(m) {
    const target = m || month || curMonth();
    Object.keys(cache).forEach(k => delete cache[k]);
    try { await fetchMonth(target, true); } catch { return false; }
    window.dispatchEvent(new Event('centinela:calendario'));
    if (loaded && month === target) render();
    return true;
  }

  return { load, month: fetchMonth, refresh };
})();
