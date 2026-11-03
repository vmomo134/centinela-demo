/* Pestaña "Satélites": estado por satélite, cuota de MAP_KEY y antigüedad de los datos.
   En vivo se usan las fuentes casi en tiempo real (*_NRT); en fechas antiguas NASA entrega el
   archivo estándar (*_SP) del mismo sensor: cada fila acepta cualquiera de las dos. */
window.CFuentes = (() => {
  const $ = s => document.querySelector(s);
  const SENSORS = [
    ['VIIRS Suomi-NPP', ['VIIRS_SNPP_NRT', 'VIIRS_SNPP_SP']],
    ['VIIRS NOAA-20', ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA20_SP']],
    ['VIIRS NOAA-21', ['VIIRS_NOAA21_NRT', 'VIIRS_NOAA21_SP']],
    ['MODIS Terra/Aqua', ['MODIS_NRT', 'MODIS_SP']],
    ['GOES-19/18 (cada 10 min)', ['GOES_NRT']],
  ];
  const fdate = t => new Date(t * 1000).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function periodSources(d) {
    const out = {};
    Object.entries(d.meta.sources || {}).forEach(([k, s]) => (out[k] = { ...s, count: 0, last_acq: null }));
    CApp.visiblePoints(d).forEach(p => {
      const s = out[p[4]] || (out[p[4]] = { ok: true, count: 0, last_acq: null });
      s.count++;
      if (!s.last_acq || p[2] > s.last_acq) s.last_acq = p[2];
    });
    return out;
  }

  function render(state) {
    const d = state.data;
    if (!d) return;
    const hist = !!state.date;
    // en una fecha, conteo y última pasada salen de las detecciones del periodo elegido (no de todo lo descargado)
    const src = hist ? periodSources(d) : (d.meta.sources || {});

    $('#fuentes-status').textContent = hist ? 'Fecha consultada' : (d.meta.offline ? 'Sin internet' : d.meta.stale ? 'Datos con retraso' : 'En línea');
    $('#count-fuentes').textContent = Object.values(src).filter(s => s.ok).length || SENSORS.length;

    $('#fuentes-tbody').innerHTML = SENSORS.map(([name, keys]) => {
      const key = keys.find(k => src[k]);
      const s = key ? src[key] : null;
      const archivo = key && key.endsWith('_SP');
      let estado, dot;
      if (!s) { estado = hist ? 'Sin datos para esta fecha' : 'Sin datos'; dot = 'sdot--err'; }
      else if (!s.ok) { estado = s.error || 'Sin respuesta'; dot = 'sdot--err'; }
      else if (!s.count) { estado = 'Sin detecciones'; dot = 'sdot--ok'; }
      else { estado = archivo ? 'Archivo de NASA' : (hist ? 'Con datos' : 'En línea'); dot = 'sdot--ok'; }
      const ultima = s && s.last_acq ? (hist ? fdate(s.last_acq) : CFmt.hace(s.last_acq)) : '—';
      return `<tr>
        <td><span class="sdot ${dot}"></span>${name}</td>
        <td class="num">${s ? CFmt.num(s.count || 0) : 0}</td>
        <td class="num">${ultima}</td>
        <td>${estado}</td>
      </tr>`;
    }).join('');

    if (hist) {
      const h = d.meta.history || {};
      const f = x => new Date(x + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      const rango = state.focus ? f(state.focus.day) : (h.start && h.start !== h.date ? `${f(h.start)} – ${f(h.date)}` : f(h.date || state.date));
      $('#tele-grid').innerHTML = `
        <div class="tele">
          <div class="tele__head"><span class="tele__name">Fecha consultada</span></div>
          <div class="tele__val">${rango}</div>
          <div class="tele__foot">${d.meta.from_cache ? 'leída del historial guardado, sin consultar a NASA' : 'descargada de NASA FIRMS'}</div>
        </div>
        <div class="tele">
          <div class="tele__head"><span class="tele__name">Detecciones del periodo</span></div>
          <div class="tele__val">${CFmt.num(CApp.visiblePoints(d).length)}</div>
          <div class="tele__foot">de ${Object.keys(src).length} fuente(s); las antiguas vienen del archivo de NASA</div>
        </div>`;
      return;
    }

    const q = d.mapkey || {};
    const lim = q.transaction_limit || 5000;
    const cur = q.current_transactions;
    const pct = cur != null ? Math.min(100, Math.round((100 * cur) / lim)) : 0;
    $('#tele-grid').innerHTML = `
      <div class="tele">
        <div class="tele__head"><span class="tele__name">Cuota de la API de FIRMS</span></div>
        <div class="tele__val">${cur ?? '—'}<i> / ${lim}</i></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="tele__foot">consultas usadas en los últimos 10 min</div>
      </div>
      <div class="tele">
        <div class="tele__head"><span class="tele__name">Último dato recibido</span></div>
        <div class="tele__val">${d.meta.fetched_at ? CFmt.hace(d.meta.fetched_at) : '—'}</div>
        <div class="tele__foot">normalmente llega unas 3 h después de la pasada</div>
      </div>`;
  }

  document.addEventListener('DOMContentLoaded', () => { if (window.CApp) CApp.on(render); });
  return { render };
})();
