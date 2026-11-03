/* Sello de tiempo: dice, con fecha y hora de Guerrero, qué periodo de detecciones, qué lectura de satélite
   y qué imagen se están viendo ahora mismo. También gobierna el punto del botón "Más reciente":
   solo late si la última lectura de un satélite es de hace menos de 1 hora. */
window.CSello = (() => {
  const $ = s => document.querySelector(s);
  const TZ = 'America/Mexico_City';
  const FRESH = 3600, STALE = 21600; // 1 h: al día · 6 h: con retraso · más: sin lecturas recientes

  const dm = t => new Date(t * 1000).toLocaleDateString('es-MX', { timeZone: TZ, day: 'numeric', month: 'short' });
  const hm = t => new Date(t * 1000).toLocaleTimeString('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  const dayKey = t => new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: TZ });
  const full = t => `${dm(t)} ${hm(t)} h`;
  /** "14:00 h" si es el mismo día que ref; si no, con fecha. */
  const near = (t, ref) => (dayKey(t) === dayKey(ref) ? `${hm(t)} h` : full(t));
  const dur = s => {
    const m = Math.round(s / 60);
    if (m < 2) return 'unos instantes';
    if (m < 90) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r && h < 6 ? `${h} h ${r} min` : `${Math.round(m / 60)} h`;
  };
  const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
  const now = () => Date.now() / 1000;

  /** Periodo de detecciones que muestra el mapa: [inicio, fin] en epoch y su descripción corta. */
  function period(st) {
    const d = st.data;
    if (st.focus) {
      const [a, b] = CApp.focusBounds(st.focus);
      const f = st.focus;
      const what = f.hour == null ? 'día completo' : f.q == null ? 'hora elegida' : 'cuarto de hora elegido';
      return { a, b: b - 1, what };
    }
    if (!d) return null;
    return { a: d.meta.now - st.window * 3600, b: d.meta.now, what: st.date ? `${st.window} h hasta el cierre del día (UTC)` : `últimas ${st.window} h` };
  }

  /** Última lectura de satélite: en vivo, la más reciente de cualquier satélite (api/live.php); en fechas, la última del periodo. */
  function lastReading(st) {
    if (!st.date) {
      const l = window.CVivo && CVivo.latest();
      return l ? { t: l.t, who: l.name, live: true } : null;
    }
    const pts = st.data ? CApp.visiblePoints(st.data) : [];
    let t = 0;
    pts.forEach(p => { if (p[2] > t) t = p[2]; });
    return { t: t || null, who: null, live: false };
  }

  function freshness(st) {
    if (st.date) return null;
    const l = lastReading(st);
    if (!l) return '';
    const age = now() - l.t;
    return age <= FRESH ? 'ok' : age <= STALE ? 'warn' : 'old';
  }

  function render() {
    const st = CApp.state, box = $('#stamp');
    if (!box) return;
    const level = freshness(st);
    const btn = $('#live-btn');
    if (btn) btn.dataset.fresh = level || '';

    const p = period(st);
    const l = lastReading(st);
    // el botón "En vivo" dice de hace cuánto es la última lectura de un satélite
    const age = $('#live-age');
    if (age) age.textContent = !st.date && l && l.t ? `hace ${dur(now() - l.t)}` : '';
    if (btn && !st.date && l && l.t) btn.title = `Última lectura de satélite: ${near(l.t, now())}${l.who ? ' (' + l.who + ')' : ''}. Pulsa para volver a lo último publicado.`;
    const img = window.CImagen && CImagen.shown ? CImagen.shown() : null;
    const items = [];

    items.push(['Detecciones', p
      ? `${full(p.a)} → ${full(p.b)} <i>${esc(p.what)}</i>`
      : (st.loading ? 'Consultando FIRMS…' : '—')]);

    if (!st.date) {
      items.push(['Última lectura de satélite', l && l.t
        ? `${esc(near(l.t, now()))} <i>hace ${esc(dur(now() - l.t))}${l.who ? ' · ' + esc(l.who) : ''}</i>`
        : 'Consultando a NASA…']);
    } else {
      items.push(['Última detección del periodo', l && l.t ? esc(full(l.t)) : 'sin detecciones']);
    }

    items.push(['Imagen del mapa', imageText(img, st)]);
    box.innerHTML = items.map(([k, v]) => `<div class="stamp__item"><span class="stamp__k">${k}</span><span class="stamp__v">${v}</span></div>`).join('');

    // avisos que explican por qué las horas no coinciden
    const notes = [];
    if (!st.date) {
      if (st.data && st.data.meta.offline) notes.push('Sin internet: se muestran las últimas lecturas descargadas; puede haber otras más recientes.');
      else if (level === 'old') notes.push(`Ningún satélite ha publicado lecturas en ${dur(now() - l.t)}: lo que ves puede no reflejar el momento actual.`);
      if (img && img.t && l && l.t && l.t - img.t > 3600) notes.push(`La imagen de NASA llega con unas ${dur(l.t - img.t)} de retraso respecto a las detecciones.`);
    } else if (st.focus === null && !st.loading) {
      notes.push('Consulta histórica: no son datos del momento actual.');
    }
    const n = $('#stamp-note');
    n.hidden = !notes.length;
    n.textContent = notes.join(' ');
    const wrap = $('#stamp-wrap');
    wrap.classList.toggle('is-history', !!st.date);
    wrap.classList.toggle('is-old', level === 'old');
  }

  function imageText(img, st) {
    if (!img || img.kind === 'off') return 'apagada';
    if (img.kind === 'none') return `${esc(img.label)}`;
    if (img.kind === 'daily') return `${esc(img.label)}`;
    const when = st.date || !img.t ? '' : ` <i>${esc(dur(now() - img.t))} antes de ahora</i>`;
    return `${esc(img.label)} · ${esc(full(img.t))}${when}`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.CApp) CApp.on(render);
    document.addEventListener('centinela:imagen', render);
    document.addEventListener('centinela:vivo', render);
    setInterval(render, 30000); // los "hace X" avanzan solos
    render();
  });

  return { render };
})();
