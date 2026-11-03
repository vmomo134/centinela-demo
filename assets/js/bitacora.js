/* Bitácora inferior + cajón de registro completo. */
window.CBitacora = (() => {
  const $ = s => document.querySelector(s);

  // hora sola si es de hoy; con fecha si es de otro día (así un aviso viejo no parece actual)
  function cuando(t) {
    const d = new Date(t * 1000), hoy = new Date();
    if (d.toDateString() === hoy.toDateString()) return CFmt.hora(t);
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ', ' + CFmt.hora(t);
  }

  function render(state) {
    const d = state.data;
    if (!d || !Array.isArray(d.log)) return;
    const log = d.log;

    if (log[0]) {
      $('#bitacora-latest').innerHTML = `<time>${cuando(log[0].t)}</time> · ${esc(log[0].src)} — ${esc(log[0].txt)}`;
    } else {
      $('#bitacora-latest').textContent = 'Sin eventos registrados.';
    }
    $('#log-count').textContent = log.length;
    $('#logdrawer-list').innerHTML = log.map(l =>
      `<div class="logline logline--${l.level || 'info'}"><time>${cuando(l.t)}</time> · <b>${esc(l.src)}</b> — ${esc(l.txt)}</div>`
    ).join('') || '<p class="empty">Sin eventos.</p>';
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.CApp) CApp.on(render);
    const t = $('#log-toggle'), dr = $('#logdrawer'), c = $('#log-close');
    if (t && dr) {
      t.addEventListener('click', () => {
        const open = dr.hidden;
        dr.hidden = !open;
        t.setAttribute('aria-expanded', String(open));
      });
    }
    if (c && dr) {
      c.addEventListener('click', () => {
        dr.hidden = true;
        t.setAttribute('aria-expanded', 'false');
      });
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && dr && !dr.hidden) {
        dr.hidden = true;
        t.setAttribute('aria-expanded', 'false');
      }
    });
  });

  return { render };
})();
