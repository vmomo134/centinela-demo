/* Tabla "Última lectura por satélite": hora de la última lectura que NASA publicó de cada satélite (api/live.php)
   y cuánto tiempo hace de eso, que se actualiza sola. Solo se muestra en modo En vivo. */
window.CVivo = (() => {
  const $ = s => document.querySelector(s);
  const REFRESH = 60000, TICK = 20000;
  // hasta cuándo se considera al día cada tipo de fuente y cuándo el retraso ya es notable (segundos)
  const FRESH = { geo: [2400, 10800], polar: [43200, 108000], imagen: [10800, 43200] };
  let doc = null, failed = false;

  const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
  const TZ = 'America/Mexico_City';
  const hhmm = t => new Date(t * 1000).toLocaleTimeString('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  const dayKey = t => new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: TZ });
  const when = t => (dayKey(t) === dayKey(Date.now() / 1000)
    ? hhmm(t)
    : new Date(t * 1000).toLocaleDateString('es-MX', { timeZone: TZ, day: 'numeric', month: 'short' }) + ' ' + hhmm(t));

  function level(r) {
    if (!r.last_at) return 'err';
    if (r.error) return 'baja';
    const age = Date.now() / 1000 - r.last_at, [ok, warn] = FRESH[r.kind] || FRESH.polar;
    return age <= ok ? 'ok' : age <= warn ? 'baja' : 'err';
  }
  const LEVEL_TXT = { ok: 'al día', baja: 'con retraso', err: 'sin lecturas recientes' };

  function render() {
    const body = $('#live-tbody'), foot = $('#live-foot');
    if (!body) return;
    if (!doc) {
      body.innerHTML = `<tr><td colspan="3">${failed ? 'No se pudo consultar a NASA. Reintentando…' : 'Consultando a NASA…'}</td></tr>`;
      foot.textContent = '';
      return;
    }
    body.innerHTML = doc.rows.map(r => {
      const lv = level(r);
      const tip = r.error ? `${doc.offline ? 'Sin internet' : 'NASA no respondió: ' + r.error}. Se muestra la última lectura guardada.` : LEVEL_TXT[lv];
      return `<tr title="${esc(tip)}">
        <td><span class="sdot sdot--${lv}" aria-hidden="true"></span>${esc(r.name)}<span class="sr-only"> (${esc(LEVEL_TXT[lv])})</span></td>
        <td>${r.last_at ? esc(when(r.last_at)) + ' h' : '—'}</td>
        <td>${r.last_at ? esc(CFmt.hace(r.last_at)) : 'sin lecturas'}</td>
      </tr>`;
    }).join('');
    document.dispatchEvent(new Event('centinela:vivo'));
    foot.textContent = doc.offline
      ? `Sin internet · última consulta a NASA ${CFmt.hace(doc.checked_at)}. Se muestran las últimas lecturas guardadas.`
      : `NASA FIRMS y GIBS, México y alrededores · consultado ${CFmt.hace(doc.checked_at)}.`;
    const hd = $('#live-toggle');
    if (hd) hd.title = foot.textContent;
  }

  async function load() {
    try {
      const r = await fetch('api/live.php', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      doc = await r.json();
      failed = false;
    } catch {
      failed = true; // se conserva lo último que se tenía
    }
    render();
  }

  function show(on) {
    const card = $('#live-card');
    if (!card) return;
    const was = !card.hidden;
    card.hidden = !on;
    if (on && !was) load();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const card = $('#live-card'), btn = $('#live-toggle');
    if (!card) return;
    let pref = null;
    try { pref = localStorage.getItem('centinela.vivo'); } catch { /* sin almacenamiento */ }
    const apply = open => {
      card.classList.toggle('is-collapsed', !open);
      btn.setAttribute('aria-expanded', String(open));
    };
    apply(pref ? pref === 'abierta' : window.innerWidth > 640 && window.innerHeight >= 820);
    btn.addEventListener('click', () => {
      const open = card.classList.contains('is-collapsed');
      apply(open);
      try { localStorage.setItem('centinela.vivo', open ? 'abierta' : 'plegada'); } catch { /* sin almacenamiento */ }
    });
    if (window.CApp) CApp.on(s => show(!s.date));
    // los "hace X min" avanzan solos; los datos se piden cada minuto (el servidor los guarda 5 min)
    setInterval(() => { if (!card.hidden && doc) render(); }, TICK);
    setInterval(() => { if (!card.hidden && !document.hidden) load(); }, REFRESH);
  });

  /** Lectura más reciente de cualquier satélite (sin contar la imagen), o null si aún no hay datos. */
  function latest() {
    if (!doc) return null;
    let best = null;
    doc.rows.forEach(r => { if (r.kind !== 'imagen' && r.last_at && (!best || r.last_at > best.t)) best = { t: r.last_at, name: r.name }; });
    return best;
  }

  return { load, latest };
})();
