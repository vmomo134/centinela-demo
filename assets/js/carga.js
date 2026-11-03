/* Velo de carga del mapa: cuando se elige una fecha (o se vuelve a "En vivo") y los datos aún no llegan,
   aparece una tarjeta con un símbolo animado (satélite en órbita alrededor de una llama) que dice qué se está
   consultando. Desaparece solo en cuanto llegan los datos. Una recarga manual no lo usa: su progreso vive en el botón.
   El botón de fecha muestra además una rueda pequeña mientras dura la consulta. */
window.CCarga = (() => {
  const $ = s => document.querySelector(s);
  let on = false;

  const fLong = d => new Date(d + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  function sync() {
    const st = window.CApp && CApp.state;
    const veil = $('#loadveil');
    if (!st || !veil) return;
    const show = !!st.loading && !st.reloading;
    const btn = $('#date-btn');
    if (btn) btn.classList.toggle('is-loading', !!st.loading);
    if (show === on) { if (show) text(st); return; }
    on = show;
    if (show) text(st);
    veil.classList.toggle('is-on', show);
    veil.setAttribute('aria-hidden', String(!show));
    const map = $('.map-wrap');
    if (map) map.setAttribute('aria-busy', String(show));
  }

  function text(st) {
    const t = $('#loadveil-title'), s = $('#loadveil-sub');
    if (!t || !s) return;
    if (st.date) {
      const f = st.focus;
      t.textContent = f && f.hour != null ? `Cargando las ${String(f.hour).padStart(2, '0')}:00 del ${fLong(f.day)}` : `Cargando ${fLong(st.date)}`;
      s.textContent = 'Descargando las detecciones de NASA FIRMS';
    } else {
      t.textContent = 'Cargando lo más reciente';
      s.textContent = 'Leyendo lo último que publicaron los satélites';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.CApp) CApp.on(sync);
    document.addEventListener('centinela:fecha', sync);
    sync();
  });

  return { sync };
})();
