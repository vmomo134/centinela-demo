/* Tabla de las 16 zonas de riesgo con su estado real, ordenable por columna. */
window.CZonas = (() => {
  const $ = s => document.querySelector(s);
  let geo = null;
  let sort = { k: 'estado', dir: -1 };
  const ORD = { normal: 0, vigilancia: 1, activo: 2, critico: 3 };
  const KEY = { nombre: 'nombre', estado: 'estado', ev: 'ev', frp: 'frp' };

  async function render(state) {
    const d = state.data;
    if (!d) return;
    if (!geo) geo = await fetch('assets/data/zonas-guerrero.geojson').then(r => r.json());

    const est = {};
    d.zone_state.forEach(z => (est[z.id] = z));

    const rows = geo.features.map(f => {
      const z = est[f.properties.id] || {};
      const ring = f.geometry.coordinates[0];
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
      const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      return {
        id: f.properties.id, nombre: f.properties.nombre, region: f.properties.region,
        estado: z.estado || 'normal', ev: z.events_24h || 0, frp: z.frp_max || 0, cx, cy,
      };
    });

    rows.sort((a, b) => {
      const k = sort.k;
      const va = k === 'estado' ? ORD[a.estado] : a[k];
      const vb = k === 'estado' ? ORD[b.estado] : b[k];
      if (typeof va === 'string') return sort.dir * va.localeCompare(vb);
      return sort.dir * (va - vb);
    });

    const activas = rows.filter(r => r.estado !== 'normal').length;
    $('#zonas-meta').textContent = activas === 0 ? 'Ninguna en alerta' : `${activas} en alerta de ${rows.length}`;
    $('#count-zonas').textContent = rows.length;

    $('#zone-tbody').innerHTML = rows.map(r => `
      <tr data-lat="${r.cy}" data-lon="${r.cx}" data-id="${r.id}" tabindex="0" role="button">
        <td>${r.nombre}<span class="region">${r.region}</span></td>
        <td><span class="pill pill--${r.estado}">${CFmt.SEV_ICON[{normal:'info',vigilancia:'medio',activo:'alto',critico:'critico'}[r.estado]] || ''}<span>${CFmt.est(r.estado)}</span></span></td>
        <td class="num">${r.ev}</td>
        <td class="num">${r.frp ? r.frp.toFixed(0) : '—'}</td>
      </tr>`).join('');

    $('#zone-tbody').querySelectorAll('tr').forEach(tr => {
      const go = () => CMap.selectZone(tr.dataset.id);
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });

    document.querySelectorAll('#zone-table .th').forEach(th =>
      th.setAttribute('aria-sort', KEY[th.dataset.key] === sort.k ? (sort.dir < 0 ? 'descending' : 'ascending') : 'none'));
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.CApp) CApp.on(render);
    document.querySelectorAll('#zone-table .th').forEach(th => {
      const go = () => {
        const k = KEY[th.dataset.key] || 'estado';
        sort = { k, dir: sort.k === k ? -sort.dir : (k === 'nombre' ? 1 : -1) };
        if (window.CApp && CApp.state.data) render(CApp.state);
      };
      th.addEventListener('click', go); // el <button> interno aporta teclado y foco
    });
  });

  return { render };
})();
