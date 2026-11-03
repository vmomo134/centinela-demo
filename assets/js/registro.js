/* Página de registro: radar con datos reales, pestañas de salud y registro guiado en 3 pasos. */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const BBOX = [-102.2, 16.3, -98.0, 18.9]; // mismo recuadro que usa el servidor
  const W = 420, H = 300;
  let zonas = [];

  const px = ([lon, lat]) => [
    ((lon - BBOX[0]) / (BBOX[2] - BBOX[0])) * W,
    H - ((lat - BBOX[1]) / (BBOX[3] - BBOX[1])) * H,
  ];
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

  /* ---------- radar ---------- */
  function rings(geom) {
    if (geom.type === 'Polygon') return geom.coordinates;
    if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
    return [];
  }

  async function radar() {
    const svg = $('#radar-map');
    const defs = el('defs', {}, svg);
    const g = el('radialGradient', { id: 'sweepGrad', cx: '50%', cy: '50%', r: '50%' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#83E5DC', 'stop-opacity': '.18' }, g);
    el('stop', { offset: '100%', 'stop-color': '#83E5DC', 'stop-opacity': '0' }, g);
    for (let x = 0; x <= W; x += 42) el('line', { class: 'grid', x1: x, y1: 0, x2: x, y2: H }, svg);
    for (let y = 0; y <= H; y += 42) el('line', { class: 'grid', x1: 0, y1: y, x2: W, y2: y }, svg);
    el('path', { class: 'sweep', d: `M210 150 L210 -60 A210 210 0 0 1 392 45 Z` }, svg);

    let data = null;
    try {
      const [geo, d, estado] = await Promise.all([
        fetch('assets/data/zonas-guerrero.geojson').then(r => r.json()),
        fetch('api/data.php', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('assets/data/guerrero-estado.geojson').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      zonas = geo.features.map(f => f.properties);
      renderZoneChoices();
      data = d;
      // silueta del estado debajo de las zonas
      if (estado) estado.features.forEach(f => {
        el('path', { class: 'coast', d: rings(f.geometry).map(r => 'M' + r.map(c => px(c).map(v => v.toFixed(1)).join(' ')).join('L') + 'Z').join('') }, svg);
      });
      const hot = new Set(d ? d.zone_state.filter(z => z.estado !== 'normal').map(z => z.id) : []);
      geo.features.forEach(f => {
        const dpath = rings(f.geometry).map(r => 'M' + r.map(c => px(c).map(v => v.toFixed(1)).join(' ')).join('L') + 'Z').join('');
        const p = el('path', { class: 'z' + (hot.has(f.properties.id) ? ' is-hot' : ''), d: dpath }, svg);
        el('title', {}, p).textContent = f.properties.nombre;
      });
    } catch {
      $('#r-focos').textContent = '—';
      return;
    }

    [['Acapulco', -99.88, 16.86], ['Chilpancingo', -99.5, 17.55], ['Zihuatanejo', -101.55, 17.64], ['Iguala', -99.54, 18.35], ['Tlapa', -98.58, 17.55]]
      .forEach(([n, lon, lat]) => {
        const [x, y] = px([lon, lat]);
        el('circle', { cx: x, cy: y, r: 2, fill: '#83E5DC' }, svg);
        el('text', { class: 'lbl', x: x + 5, y: y - 4 }, svg).textContent = n;
      });

    if (!data) { $('#r-focos').textContent = '—'; $('#r-pasada').textContent = 'sin conexión'; return; }
    data.events.forEach(e => {
      const [x, y] = px([e.lon, e.lat]);
      const c = el('circle', { class: 'f', cx: x, cy: y, r: Math.max(3, Math.min(9, 3 + Math.sqrt(e.frp_max))) }, svg);
      el('title', {}, c).textContent = `Foco · ${e.frp_max} MW`;
    });
    $('#r-focos').textContent = data.events.length;
    const last = Math.max(0, ...Object.values(data.meta.sources || {}).map(s => s.last_acq || 0));
    $('#r-pasada').textContent = last ? hace(last) : 'sin focos';
  }

  function hace(t) {
    const s = Date.now() / 1000 - t;
    if (s < 5400) return `hace ${Math.max(1, Math.round(s / 60))} min`;
    if (s < 172800) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} días`;
  }

  /* ---------- pestañas de salud (patrón APG) ---------- */
  function tabs() {
    const list = $$('.sit [role=tab]');
    const pick = (t, focus) => {
      list.forEach(b => {
        const on = b === t;
        b.setAttribute('aria-selected', String(on));
        b.tabIndex = on ? 0 : -1;
        document.getElementById(b.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) t.focus();
    };
    list.forEach((b, i) => {
      b.addEventListener('click', () => pick(b));
      b.addEventListener('keydown', e => {
        const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (e.key === 'Home') { e.preventDefault(); pick(list[0], true); }
        else if (e.key === 'End') { e.preventDefault(); pick(list[list.length - 1], true); }
        else if (d) { e.preventDefault(); pick(list[(i + d + list.length) % list.length], true); }
      });
    });
  }

  /* ---------- registro guiado ---------- */
  let step = 1;

  function renderZoneChoices() {
    const byRegion = {};
    zonas.forEach(z => (byRegion[z.region] = byRegion[z.region] || []).push(z));
    $('#zones').innerHTML = Object.entries(byRegion).map(([r, zs]) => `
      <div class="zgroup" role="group" aria-label="${esc(r)}">
        <h4>${esc(r)}</h4>
        <div class="zgroup__list">${zs.map(z => `
          <label class="zchip"><input type="checkbox" name="zones" value="${esc(z.id)}">${esc(z.nombre)}</label>`).join('')}
        </div>
      </div>`).join('');
    $$('#zones input').forEach(i => i.addEventListener('change', syncZones));
  }

  const chosen = () => $$('#zones input:checked').map(i => i.value);

  function syncZones() {
    const n = chosen().length;
    $('#f-all').checked = n === 0;
    $('#zones-count').textContent = n === 0
      ? 'Ninguna zona elegida: recibirás avisos de todo Guerrero.'
      : `${n} zona${n === 1 ? '' : 's'} elegida${n === 1 ? '' : 's'}.`;
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
  }

  function checkStep(n) {
    if (n === 1) {
      const inp = $('#f-email');
      const v = inp.value.trim();
      const msg = !v ? 'Escribe tu correo para poder avisarte.'
        : !validEmail(v) ? 'Revisa el correo: debe verse como nombre@dominio.com.' : '';
      inp.setAttribute('aria-invalid', String(!!msg));
      $('#e-email').textContent = msg;
      if (msg) inp.focus();
      return !msg;
    }
    if (n === 3) {
      const ok = $('#f-consent').checked;
      $('#e-consent').textContent = ok ? '' : 'Marca la casilla para aceptar los avisos.';
      if (!ok) $('#f-consent').focus();
      return ok;
    }
    return true;
  }

  function go(n) {
    step = n;
    $$('.wstep').forEach(f => (f.hidden = Number(f.dataset.step) !== n));
    $$('.steps li').forEach(li => {
      const s = Number(li.dataset.step);
      if (s === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      li.classList.toggle('is-done', s < n);
    });
    const bar = $('#steps-bar');
    if (bar) bar.style.width = ({ 1: '12%', 2: '50%', 3: '82%', 4: '100%' })[n];
    if (n === 3) {
      $('#s-email').textContent = $('#f-email').value.trim();
      $('#s-name').textContent = $('#f-name').value.trim() || 'Sin nombre';
      const ids = chosen();
      $('#s-zones').textContent = ids.length
        ? ids.map(id => (zonas.find(z => z.id === id) || {}).nombre || id).join(', ')
        : 'Todo Guerrero';
    }
    const cur = document.querySelector(`.wstep[data-step="${n}"]`);
    const first = n === 4 ? cur : cur.querySelector('input:not([tabindex="-1"]),button');
    if (first) first.focus({ preventScroll: true });
  }

  async function submit(e) {
    e.preventDefault();
    if (step !== 3) { if (checkStep(step)) go(step + 1); return; }
    if (!checkStep(3)) return;
    const btn = $('#f-submit');
    btn.disabled = true;
    btn.textContent = 'Registrando…';
    $('#e-form').textContent = '';
    try {
      const r = await fetch('api/subscribe.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: $('#f-email').value.trim(),
          name: $('#f-name').value.trim(),
          zones: chosen(),
          consent: true,
          website: document.querySelector('[name=website]').value,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo registrar el correo. Inténtalo de nuevo.');
      const zonasTxt = j.zones && j.zones.length ? j.zones.join(', ') : 'todo Guerrero';
      $('#done-title').textContent = j.status === 'nuevo' ? 'Correo registrado' : 'Registro actualizado';
      $('#done-text').textContent = (j.welcome_sent
        ? `Enviamos un correo de bienvenida a ${j.email}. `
        : `Guardamos ${j.email}, pero el correo de bienvenida no pudo salir ahora; los avisos se enviarán en cuanto el servidor de correo esté disponible. `)
        + `Te avisaremos de fuego alto o crítico en ${zonasTxt}.`;
      go(4);
      CAviso.ok($('#done-title').textContent, `Avisos de fuego alto o crítico en ${zonasTxt}.`);
    } catch (err) {
      $('#e-form').textContent = err.message === 'Failed to fetch'
        ? 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'
        : err.message;
      CAviso.err('No se pudo registrar el correo', $('#e-form').textContent);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Registrar mi correo';
    }
  }

  function wizard() {
    const form = $('#wizard');
    form.addEventListener('submit', submit);
    $$('[data-next]').forEach(b => b.addEventListener('click', () => { if (checkStep(step)) go(step + 1); }));
    $$('[data-back]').forEach(b => b.addEventListener('click', () => go(step - 1)));
    // Enter en el paso 1 avanza en lugar de enviar
    $('#f-email').addEventListener('input', () => {
      if ($('#f-email').getAttribute('aria-invalid') === 'true') checkStep(1);
    });
    $('#f-all').addEventListener('change', e => {
      if (e.target.checked) $$('#zones input').forEach(i => (i.checked = false));
      syncZones();
    });
    $('#f-consent').addEventListener('change', () => { if ($('#f-consent').checked) $('#e-consent').textContent = ''; });
    $('#again').addEventListener('click', () => {
      form.reset();
      syncZones();
      $('#f-email').removeAttribute('aria-invalid');
      go(1);
    });
    syncZones();
  }

  document.addEventListener('DOMContentLoaded', () => {
    tabs();
    wizard();
    radar();
  });
})();
