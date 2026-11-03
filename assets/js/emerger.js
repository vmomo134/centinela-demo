/* Registro: la información emerge desde los costados al llegar a la vista.
   Lo que queda a la izquierda entra desde la izquierda, lo de la derecha desde la derecha y lo del centro sube.
   Si el navegador pide poco movimiento o no hay IntersectionObserver, la página se ve completa sin efecto
   (la clase js-reveal solo la pone el script del <head> cuando el efecto es posible). */
(() => {
  const root = document.documentElement;
  if (!root.classList.contains('js-reveal')) return;

  const SEL = [
    '.hero__copy', '.hero__side',
    '#como-title', '.flow li', '.how__note',
    '#gains-title', '.gains__list > div',
    '.health__head', '#salud .sit', '#salud .sitpanel',
    '.signup__intro', '.wizard',
  ].join(',');
  const els = [...document.querySelectorAll(SEL)];
  const W = root.clientWidth;
  const narrow = W < 760;

  // dirección y retraso: por posición en la pantalla; los elementos de una misma fila entran escalonados
  const info = els.map(el => ({ el, r: el.getBoundingClientRect() }));
  const rows = new Map();
  info.forEach(o => {
    if (!o.r.width) return;
    const key = Math.round((o.r.top + scrollY) / 60);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(o);
  });
  rows.forEach(list => list.sort((a, b) => a.r.left - b.r.left).forEach((o, i) => { o.delay = i * 0.12; }));

  let alt = 0;
  info.forEach(o => {
    const { el, r } = o;
    let dir;
    if (!r.width) { dir = 'der'; o.delay = 0.1; }                       // paneles ocultos de las pestañas
    else if (narrow) dir = alt++ % 2 ? 'der' : 'izq';                   // en columna se alternan los lados
    else if (r.width > W * 0.62) dir = 'izq';                           // bloques anchos
    else {
      const cx = (r.left + r.width / 2) / W;
      dir = cx < 0.4 ? 'izq' : cx > 0.6 ? 'der' : 'abajo';
    }
    el.style.transition = 'none';
    el.style.setProperty('--rv-delay', (o.delay || 0) + 's');
    el.classList.add('rv', 'rv--' + dir);
  });

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      io.unobserve(el);
      el.classList.add('is-in');
      if (el.matches('.sitpanel')) document.querySelectorAll('#salud .sitpanel').forEach(p => p.classList.add('is-in'));
      if (el.matches('.flow li')) el.parentElement.classList.add('is-live');   // el punto viajero arranca con las tarjetas
    });
  }, { threshold: 0.16, rootMargin: '0px 0px -6% 0px' });

  void document.body.offsetWidth;                                        // fija el estado inicial sin animarlo
  requestAnimationFrame(() => {
    info.forEach(o => { o.el.style.transition = ''; io.observe(o.el); });
    root.classList.add('rv-ready');
  });
})();
