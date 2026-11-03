/* Tema claro/oscuro: respeta la preferencia del sistema y recuerda la elección de la persona.
   Se carga en <head> y sin defer para fijar data-theme antes del primer pintado (sin parpadeo). */
(() => {
  const KEY = 'centinela.tema';
  const root = document.documentElement;
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function guardado() {
    try { const v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; } catch { return null; }
  }
  function aplicar(tema) {
    root.setAttribute('data-theme', tema);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tema === 'dark' ? '#072A33' : '#0A3C48');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.setAttribute('aria-pressed', String(tema === 'dark'));
    document.dispatchEvent(new CustomEvent('centinela:tema', { detail: { tema } }));
  }

  root.setAttribute('data-theme', guardado() || (mq && mq.matches ? 'dark' : 'light'));

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(root.getAttribute('data-theme') === 'dark'));
      btn.addEventListener('click', () => {
        const siguiente = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(KEY, siguiente); } catch { /* almacenamiento no disponible */ }
        aplicar(siguiente);
      });
    }
    // si la persona nunca eligió, seguimos los cambios del sistema
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', e => { if (!guardado()) aplicar(e.matches ? 'dark' : 'light'); });
    }
  });
})();
