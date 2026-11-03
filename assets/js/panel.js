/* Panel lateral flotante: se puede ocultar para ver todo el mapa; la elección se recuerda. */
window.CPanel = (() => {
  const $ = s => document.querySelector(s);
  const KEY = 'centinela.panel';

  function set(open, save = true) {
    const app = $('.app'), hide = $('#panel-hide'), show = $('#panel-show');
    if (!app) return;
    app.classList.toggle('is-panel-closed', !open);
    if (hide) hide.setAttribute('aria-expanded', String(open));
    if (show) { show.hidden = open; show.setAttribute('aria-expanded', String(open)); }
    if (save) { try { localStorage.setItem(KEY, open ? 'abierto' : 'oculto'); } catch { /* sin almacenamiento */ } }
    // al volver a mostrar el panel, el foco regresa a su botón; al ocultarlo, al que lo reabre
    if (window.CMap && CMap.map) setTimeout(() => CMap.map.invalidateSize(), 50);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const hide = $('#panel-hide'), show = $('#panel-show');
    if (hide) hide.addEventListener('click', () => { set(false); if (show) show.focus(); });
    if (show) show.addEventListener('click', () => { set(true); if (hide) hide.focus(); });
    let pref = null;
    try { pref = localStorage.getItem(KEY); } catch { /* sin almacenamiento */ }
    if (pref === 'oculto') set(false, false);
  });

  return { open: () => set(true, false), close: () => set(false) };
})();


/* Los indicadores y el sello pueden crecer: la columna de capas se acomoda debajo. */
document.addEventListener('DOMContentLoaded', () => {
  const hud = document.querySelector('.hud');
  if (!hud || !window.ResizeObserver) return;
  const fit = () => document.documentElement.style.setProperty('--hud-h', hud.offsetHeight + 'px');
  new ResizeObserver(fit).observe(hud);
  fit();
});
