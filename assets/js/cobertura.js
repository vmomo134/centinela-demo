/* Cobertura de lecturas: dice qué días tienen datos y desde cuándo lee cada satélite. Los rangos vienen de
   api/coverage.php (FIRMS + GIBS). El calendario de fecha.js la usa para deshabilitar los días sin lecturas
   y para mostrar la lista de satélites. */
window.CCobertura = (() => {
  let cov = null;       // respuesta de api/coverage.php

  const fDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dayNum = d => Date.parse(d + 'T00:00:00Z') / 86400000;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  /** Satélites con al menos una lectura el día d. */
  function on(d) {
    if (!cov) return [];
    return cov.satellites.filter(s => s.ranges.some(([a, b]) => d >= a && d <= b)).map(s => s.name);
  }
  /** ¿Hay lecturas ese día? Sin datos de cobertura no se bloquea nada. */
  const covered = d => !cov || on(d).length > 0;

  /** Satélites con lecturas en cualquier día de [start, end]; "A, B y C". */
  function label(start, end) {
    if (!cov) return '';
    const names = new Set();
    for (let t = dayNum(start); t <= dayNum(end); t++) {
      on(new Date(t * 86400000).toISOString().slice(0, 10)).forEach(n => names.add(n));
    }
    const l = [...names];
    if (l.length < 2) return l.join('');
    return l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1];
  }

  function rangeText(s) {
    const from = fDay(s.ranges[0][0]);
    const last = s.ranges[s.ranges.length - 1][1];
    if (s.ranges.length === 1 && last >= cov.max) return 'desde ' + from;
    return s.ranges.map(([a, b]) => `${fDay(a)} – ${fDay(b)}`).join(' y ');
  }

  /** Dibuja en `box` la lista de satélites con su rango de fechas y, si hay una fecha elegida, su marca. */
  function render(box, selected) {
    if (!cov) { box.replaceChildren(el('p', 'cov__lead', 'No se pudo consultar desde cuándo lee cada satélite.')); return; }
    const span = Math.max(1, dayNum(cov.max) - dayNum(cov.min));
    const pct = d => Math.min(100, Math.max(0, ((dayNum(d) - dayNum(cov.min)) / span) * 100));
    const root = el('div', 'cov');
    root.appendChild(el('p', 'cov__lead',
      `Hay datos de ${fDay(cov.min)} a ${fDay(cov.max)}, un día tras otro. Cada satélite empezó en una fecha distinta.`));

    const list = el('ul', 'cov__list');
    cov.satellites.forEach(s => {
      const li = el('li', 'cov__row');
      const head = el('div', 'cov__head');
      head.appendChild(el('span', 'cov__name', s.name));
      head.appendChild(el('span', 'cov__range', rangeText(s)));
      const track = el('div', 'cov__track');
      track.setAttribute('aria-hidden', 'true');
      s.ranges.forEach(([a, b]) => {
        const seg = el('i', 'cov__seg');
        seg.style.left = pct(a) + '%';
        seg.style.width = Math.max(1.2, pct(b) - pct(a)) + '%';
        track.appendChild(seg);
      });
      if (selected) {
        const tick = el('b', 'cov__tick');
        tick.style.left = pct(selected) + '%';
        track.appendChild(tick);
      }
      li.append(head, track, el('span', 'cov__note', s.note));
      list.appendChild(li);
    });
    root.appendChild(list);

    if (cov.imagery_goes) {
      root.appendChild(el('p', 'cov__img',
        `Imagen GOES cada 10 min: ${fDay(cov.imagery_goes.from)} – ${fDay(cov.imagery_goes.to)}. Antes de esa fecha el mapa muestra la imagen diaria de FIRMS.`));
    }
    box.replaceChildren(root);
  }

  /** Pide de nuevo la cobertura (al recargar el sistema). Si falla se conserva la anterior. */
  async function load() {
    try {
      const r = await fetch('api/coverage.php', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      cov = j;
    } catch {
      return false; // sin cobertura el calendario sigue funcionando con su rango general
    }
    document.dispatchEvent(new Event('centinela:cobertura'));
    if (window.CApp && CApp.render) CApp.render();
    return true;
  }

  document.addEventListener('DOMContentLoaded', load);
  return { covered, on, label, render, data: () => cov, reload: load };
})();
