/* Recorrido guiado (botón «Ayuda»).
   Una «cámara» desplaza y acerca toda la consola (.app) hacia la sección que se explica, mientras un velo gris
   con recorte redondeado deja iluminada solo esa zona. Cámara, recorte, anillo y tarjeta se animan en el mismo
   bucle (requestAnimationFrame) para que el movimiento sea una sola transición fluida.
   Pantallas angostas (≤ 980 px): sin zoom; la página se desplaza hasta la sección y la tarjeta queda abajo. */
window.CTutorial = (() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = window.matchMedia('(max-width: 980px)');

  const ICON_INFO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const ICON_X = svg('<path d="M6 6l12 12M18 6L6 18"/>');
  const CHEV_L = svg('<path d="M15 5l-7 7 7 7"/>');
  const CHEV_R = svg('<path d="M9 5l7 7-7 7"/>');
  const GLYPH = {
    gauge: '<path d="M4.5 17a8 8 0 1115 0"/><path d="M12 16.5l3.6-5"/><circle cx="12" cy="16.5" r="1.1"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    bell: '<path d="M6 16.5V11a6 6 0 1112 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
    bars: '<path d="M5.5 19V11M12 19V5M18.5 19v-6"/>',
    map: '<path d="M9 5L3.5 7v12L9 17l6 2 5.5-2V5L15 7z"/><path d="M9 5v12M15 7v12"/>',
    layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/><path d="M3.5 16.5L12 21l8.5-4.5"/>',
    alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17.2h.01"/>',
    signal: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M5 5a10 10 0 000 14M19 5a10 10 0 010 14"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1"/><circle cx="4.8" cy="12" r="1"/><circle cx="4.8" cy="17.5" r="1"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    log: '<path d="M6.5 4.5h11a1 1 0 011 1v13a1 1 0 01-1 1h-11a1 1 0 01-1-1v-13a1 1 0 011-1z"/><path d="M9 9h6M9 12.5h6M9 16h3.5"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="M4.5 8.2l7.5 5.3 7.5-5.3"/>',
  };

  /* ---------- guion del recorrido ---------- */
  const tab = name => () => { if (window.CPanel) CPanel.open(); if (window.CApp) CApp.setTab(name, false); };

  const STEPS = [
    {
      kind: 'center', welcome: true,
      title: 'Te damos la bienvenida a Centinela',
      body: 'Aquí ves, casi en tiempo real, dónde los satélites de la NASA detectan calor que podría ser un incendio en Guerrero. Te mostramos cada parte de la pantalla y qué te dice.',
    },
    {
      icon: 'gauge', target: '.regional', side: 'bottom', zoom: 2.6,
      title: 'Peligro regional',
      body: 'Una sola palabra para saber cómo está todo Guerrero: Bajo, Moderado, Alto o Extremo. Sube cuando hay más alertas graves al mismo tiempo.',
    },
    {
      icon: 'clock', target: ['.simctl .seg', '.datectl'], side: 'bottom', zoom: 2.2,
      title: 'Elige qué periodo ver',
      body: '24, 48 y 72 h deciden cuántas horas hacia atrás se muestran las detecciones. «En vivo» muestra lo último que publicó la NASA y te dice de hace cuánto es; con el calendario consultas un día pasado y ves cuáles tuvieron incendios.',
    },
    {
      icon: 'bell', target: ['.simctl a.btn', '#refresh', '#updated'], side: 'bottom', zoom: 2,
      title: 'Avisos y datos al día',
      body: '«Avisos por correo» te escribe cuando se detecta fuego cerca de ti. «Actualizar datos» pide lo más nuevo a los satélites, aunque la página también se actualiza sola. A la derecha ves la hora de la última actualización.',
    },
    {
      icon: 'bars', target: '#kpis', side: 'bottom',
      title: 'Lo esencial, en seis números',
      body: 'Cuántos focos de calor vieron los satélites, cuántas de las 16 zonas de riesgo están en alerta, qué tan reciente es el último dato y el índice de peligro, de 0 a 100.',
      tip: 'Un foco es calor visto desde el espacio. No está verificado en campo: puede ser una quema agrícola.',
    },
    {
      icon: 'map', target: '.map-wrap', side: 'right',
      title: 'El mapa de Guerrero',
      body: 'Muestra dónde hay fuego. En el mapa de calor, mientras más intenso el color, más energía de fuego detectaron los satélites. Cada zona de riesgo marca con un número su valor máximo.',
      tip: 'Arrastra el mapa para moverte y usa + y − para acercar.',
    },
    {
      icon: 'layers', target: '.legend', side: 'right', zoom: 1.9, before: 'legend',
      title: 'Capas y leyenda',
      body: 'Cambia entre «Mapa de calor» y «Detecciones», elige la imagen de satélite que va debajo y consulta qué significa cada color. Si estorba, pliégala con la flecha.',
    },
    {
      icon: 'alert', target: '.sidebar', side: 'left', zoom: 1.5, before: tab('alertas'),
      title: 'Alertas por zona',
      body: 'Cada tarjeta es una zona con actividad, con su nivel: Información, Medio, Alto o Crítico. Toca una para verla en el mapa.',
      tip: 'Si no hay tarjetas, ninguna zona tiene alertas activas ahora.',
    },
    {
      icon: 'signal', target: '.sidebar', side: 'left', zoom: 1.5, before: tab('fuentes'),
      title: 'Satélites y cuota de datos',
      body: 'Comprueba si cada satélite está enviando datos. La información llega unas 3 horas después de que pasa el satélite, así que un retraso corto es normal.',
    },
    {
      icon: 'list', target: '.sidebar', side: 'left', zoom: 1.5, before: tab('zonas'),
      title: 'Las 16 zonas de riesgo',
      body: 'Todas las zonas vigiladas en una tabla. Toca el título de una columna para ordenarla, por ejemplo por número de focos, y toca una fila para verla en el mapa.',
    },
    {
      icon: 'calendar', target: '.sidebar', side: 'left', zoom: 1.5, before: tab('historial'),
      title: 'Historial por fecha',
      body: 'Elige un mes y toca un día para verlo en el mapa con su imagen de satélite. Si tocas una hora, verás solo las detecciones de esa pasada.',
    },
    {
      icon: 'log', target: '.bitacora', side: 'top', zoom: 1.7,
      title: 'Bitácora de eventos',
      body: 'Aquí aparece lo último que pasó en el sistema, como una alerta nueva. «Ver registro» abre la lista completa con sus horas.',
    },
    {
      kind: 'center', finale: true,
      title: 'Ya conoces Centinela',
      body: 'Si algo no queda claro, vuelve a abrir este recorrido con el botón «Ayuda» de la barra superior. Y si quieres enterarte sin abrir la página, registra tu correo.',
    },
  ];
  const TOTAL = STEPS.filter(s => s.kind !== 'center').length;

  /* ---------- estado ---------- */
  let isOpen = false, closing = false, camMode = true;
  let idx = -1;
  let tour, dim, ring, card, content, ghost, live, appEl;
  let cur = null;      // estado actual de la animación: { cx, cy, s, hole, pad, card }
  let anim = null, raf = 0;
  let saved = null;    // lo que se restaura al salir

  const TP = 8;        // holgura (px de pantalla) entre la sección y el borde iluminado
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* ---------- DOM ---------- */
  function build() {
    if (tour) return;
    tour = document.createElement('div');
    tour.className = 'tour';
    tour.hidden = true;
    tour.innerHTML =
      '<div class="tour__dim"></div>' +
      '<div class="tour__ring"></div>' +
      '<section class="tour__card" id="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">' +
        '<div class="tour__content"></div>' +
      '</section>' +
      '<div class="tour__card tour__ghost" aria-hidden="true"></div>' +
      '<p class="tour-live" role="status" aria-live="polite"></p>';
    document.body.appendChild(tour);
    dim = $('.tour__dim', tour); ring = $('.tour__ring', tour); card = $('.tour__card', tour);
    content = $('.tour__content', tour); ghost = $('.tour__ghost', tour); live = $('.tour-live', tour);
    tour.addEventListener('click', onClick);
    tour.addEventListener('wheel', e => e.preventDefault(), { passive: false });
    tour.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  }

  const btnBack = `<button type="button" class="btn tour__back" data-act="prev">${CHEV_L}<span>Volver</span></button>`;
  const btnNext = `<button type="button" class="btn btn--primary tour__next" data-act="next" data-primary><span>Siguiente</span>${CHEV_R}</button>`;

  function cardHTML(step, i) {
    if (step.kind === 'center') {
      const mark = $('.brand__mark');
      const logo = mark ? mark.outerHTML.replace('class="brand__mark"', 'class="brand__mark tour__mark"') : '';
      if (step.welcome) {
        return '<div class="tour__hero">' + logo + '</div>' +
          `<h2 class="tour__title" id="tour-title">${step.title}</h2>` +
          `<p class="tour__body" id="tour-body">${step.body}</p>` +
          `<ul class="tour__facts"><li>${TOTAL} pasos</li><li>Unos 2 minutos</li><li>Sal con Esc</li></ul>` +
          '<div class="tour__nav"><button type="button" class="tour__link" data-act="close">Ahora no</button><span class="tour__spacer"></span>' +
          '<button type="button" class="btn btn--primary tour__next" data-act="next" data-primary><span>Empezar recorrido</span>' + CHEV_R + '</button></div>';
      }
      return '<div class="tour__hero">' + logo + '</div>' +
        `<h2 class="tour__title" id="tour-title">${step.title}</h2>` +
        `<p class="tour__body" id="tour-body">${step.body}</p>` +
        `<a class="tour__cta" href="registro.html"><span class="tour__badge">${svg(GLYPH.mail)}</span>` +
          '<span class="tour__cta-text"><b>Avisos por correo</b>Te escribimos cuando haya fuego cerca de ti.</span>' + CHEV_R + '</a>' +
        '<div class="tour__nav">' + btnBack + '<span class="tour__spacer"></span>' +
        '<button type="button" class="btn btn--primary tour__done" data-act="close" data-primary>Terminar</button></div>';
    }
    const n = STEPS.slice(0, i + 1).filter(s => s.kind !== 'center').length;
    let bar = '';
    for (let k = 1; k <= TOTAL; k++) bar += `<i class="${k < n ? 'is-done' : k === n ? 'is-now' : ''}"></i>`;
    return `<div class="tour__top"><span class="tour__badge">${svg(GLYPH[step.icon] || GLYPH.map)}</span>` +
        `<span class="tour__count">Paso ${n} de ${TOTAL}</span>` +
        `<button type="button" class="tour__x" data-act="close" aria-label="Salir del recorrido" title="Salir (Esc)">${ICON_X}</button></div>` +
      `<div class="tour__bar" aria-hidden="true">${bar}</div>` +
      `<h2 class="tour__title" id="tour-title">${step.title}</h2>` +
      `<p class="tour__body" id="tour-body">${step.body}</p>` +
      (step.tip ? `<p class="tour__tip">${ICON_INFO}<span>${step.tip}</span></p>` : '') +
      `<div class="tour__nav">${btnBack}<span class="tour__spacer"></span>${btnNext}</div>`;
  }

  /* tamaño real de la tarjeta para un contenido dado (se mide en una copia oculta) */
  function measureCard(step, html) {
    const W = innerWidth, center = step.kind === 'center';
    const pad = narrow.matches ? 12 : 24;
    const w = Math.min(center ? 440 : 360, W - 2 * pad);
    ghost.className = 'tour__card tour__ghost' + (center ? ' tour__card--center' : '');
    ghost.style.width = w + 'px';
    ghost.innerHTML = '<div class="tour__content">' + html.replace(/ id="[^"]+"/g, '') + '</div>';
    return { w, h: ghost.offsetHeight };
  }

  /* ---------- geometría ---------- */
  function world() {
    return camMode
      ? { w: appEl.offsetWidth, h: appEl.offsetHeight }
      : { w: innerWidth, h: document.documentElement.scrollHeight };
  }

  /** Pasa de coordenadas de pantalla a coordenadas «base» (sin cámara), invirtiendo la cámara actual. */
  function toBase(l, t, w, h) {
    const s = cur.s, c = camOf(cur);
    return { x: (l - c.tx) / s, y: (t - c.ty) / s, w: w / s, h: h / s };
  }

  /** Cámara (tx, ty, s) a partir de su centro, ajustada para no mostrar nada fuera de la página. */
  function camOf(st) {
    const W = innerWidth, H = innerHeight, wd = world();
    const s = Math.max(1, st.s);
    return {
      s,
      tx: clamp(W / 2 - s * st.cx, Math.min(0, W - s * wd.w), 0),
      ty: clamp(H / 2 - s * st.cy, Math.min(0, H - s * wd.h), 0),
    };
  }

  function targetBase(step) {
    const els = [].concat(step.target).flatMap(sel => [...document.querySelectorAll(sel)]).filter(e => e.getClientRects().length);
    if (!els.length) return null;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    els.forEach(e => {
      const q = e.getBoundingClientRect();
      l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    });
    if (!camMode) cur.ty = -window.scrollY; // en pantallas angostas la cámara es el propio desplazamiento
    const base = toBase(l, t, r - l, b - t);
    const css = parseFloat(getComputedStyle(els[0]).borderTopLeftRadius) || 0;
    base.r = Math.min(Math.max(els.length > 1 ? 18 : css, 14), base.w / 2, base.h / 2 + 4);
    return base;
  }

  /** Estado final de un paso: cámara, recorte, tarjeta. */
  function makePlan(step, base, size) {
    const W = innerWidth, H = innerHeight, wd = world();
    const mobile = !camMode;
    const P = mobile ? 12 : 24, M = mobile ? 14 : 20;
    const cw = size.w, ch = size.h;

    if (!base) { // tarjeta centrada, sin recorte, cámara en reposo
      const c = camMode ? { s: 1, tx: 0, ty: 0 } : { s: 1, tx: 0, ty: -window.scrollY };
      return {
        cx: (W / 2 - c.tx) / c.s, cy: (H / 2 - c.ty) / c.s, s: 1,
        hole: { x: (W / 2 - c.tx) / c.s, y: (H / 2 - c.ty) / c.s, w: 0, h: 0, r: 0 }, pad: 0,
        card: { x: Math.round((W - cw) / 2), y: Math.round((H - ch) / 2 - 8), w: cw, h: ch },
      };
    }

    const side = mobile ? 'bottom' : step.side || 'bottom';
    let fx0 = P, fy0 = P, fx1 = W - P, fy1 = H - P;
    if (side === 'bottom') fy1 = H - ch - M - P;
    else if (side === 'top') fy0 = ch + M + P;
    else if (side === 'right') fx1 = W - cw - M - P;
    else fx0 = cw + M + P;
    const fw = Math.max(80, fx1 - fx0), fh = Math.max(80, fy1 - fy0);
    const fcx = (fx0 + fx1) / 2, fcy = (fy0 + fy1) / 2;
    const bcx = base.x + base.w / 2, bcy = base.y + base.h / 2;

    let s = 1, tx = 0, ty = 0;
    if (camMode) {
      const sMax = reduce.matches ? 1 : step.zoom || 2.2;
      s = clamp(Math.min((fw - 2 * TP) / base.w, (fh - 2 * TP) / base.h), 1, sMax);
      tx = fcx - s * bcx;
      ty = fcy - s * bcy;
    } else {
      // desplazamiento: si la sección es más alta que el hueco, se alinea su borde superior
      ty = base.h + 2 * TP > fh ? -(base.y - TP - fy0) : fcy - bcy;
    }
    tx = clamp(tx, Math.min(0, W - s * wd.w), 0);
    ty = clamp(ty, Math.min(0, H - s * wd.h), 0);

    // tarjeta pegada al lado elegido de la sección, ya con la cámara final
    const sr = { l: tx + s * base.x - TP, t: ty + s * base.y - TP, r: tx + s * (base.x + base.w) + TP, b: ty + s * (base.y + base.h) + TP };
    let x, y;
    if (mobile) { x = P; y = H - ch - P; }
    else if (side === 'bottom' || side === 'top') {
      x = clamp((sr.l + sr.r) / 2 - cw / 2, P, W - cw - P);
      y = side === 'bottom' ? Math.min(sr.b + M, H - ch - P) : Math.max(sr.t - M - ch, P);
    } else {
      y = clamp((sr.t + sr.b) / 2 - ch / 2, P, H - ch - P);
      x = side === 'right' ? Math.min(sr.r + M, W - cw - P) : Math.max(sr.l - M - cw, P);
    }
    return {
      cx: (W / 2 - tx) / s, cy: (H / 2 - ty) / s, s,
      hole: { x: base.x, y: base.y, w: base.w, h: base.h, r: base.r }, pad: 1,
      card: { x: Math.round(x), y: Math.round(y), w: cw, h: ch },
    };
  }

  /* ---------- pintado ---------- */
  const f1 = n => Math.round(n * 10) / 10;
  function roundedRect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    return `M${f1(x + r)} ${f1(y)}H${f1(x + w - r)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(x + w)} ${f1(y + r)}V${f1(y + h - r)}` +
      `A${f1(r)} ${f1(r)} 0 0 1 ${f1(x + w - r)} ${f1(y + h)}H${f1(x + r)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(x)} ${f1(y + h - r)}` +
      `V${f1(y + r)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(x + r)} ${f1(y)}Z`;
  }

  function render() {
    const W = innerWidth, H = innerHeight, c = camOf(cur), s = c.s;
    if (camMode) appEl.style.transform = (c.tx || c.ty || s !== 1) ? `translate3d(${f1(c.tx)}px,${f1(c.ty)}px,0) scale(${s})` : '';
    else window.scrollTo(0, Math.round(-c.ty));

    const h = cur.hole, pad = cur.pad * TP;
    const hw = s * h.w + 2 * pad, hh = s * h.h + 2 * pad;
    if (hw > 2 && hh > 2) {
      const hx = c.tx + s * h.x - pad, hy = c.ty + s * h.y - pad, hr = s * h.r + pad;
      dim.style.clipPath = `path(evenodd,"M-10 -10H${W + 10}V${H + 10}H-10Z${roundedRect(hx, hy, hw, hh, hr)}")`;
      ring.style.transform = `translate(${f1(hx)}px,${f1(hy)}px)`;
      ring.style.width = f1(hw) + 'px'; ring.style.height = f1(hh) + 'px';
      ring.style.borderRadius = f1(Math.min(hr, hw / 2, hh / 2)) + 'px';
    } else {
      dim.style.clipPath = 'none';
    }
    const k = cur.card;
    card.style.transform = `translate(${f1(k.x)}px,${f1(k.y)}px)`;
    card.style.width = f1(k.w) + 'px';
    card.style.height = f1(k.h) + 'px';
  }

  /* ---------- animación ---------- */
  function snapshot(st) {
    return { cx: st.cx, cy: st.cy, s: st.s, pad: st.pad, hole: { ...st.hole }, card: { ...st.card } };
  }

  function swapContent(html, step) {
    content.innerHTML = html;
    card.classList.toggle('tour__card--center', step.kind === 'center');
    const t = $('.tour__title', content), b = $('.tour__body', content);
    const n = STEPS.slice(0, idx + 1).filter(x => x.kind !== 'center').length;
    live.textContent = (step.kind === 'center' ? '' : `Paso ${n} de ${TOTAL}. `) + (t ? t.textContent : '') + '. ' + (b ? b.textContent : '');
  }

  function run(to, o = {}) {
    cancelAnimationFrame(raf);
    const from = snapshot(cur);
    const W = innerWidth, H = innerHeight;
    const dist = Math.hypot(to.cx - from.cx, to.cy - from.cy) / Math.max(W, H) + Math.abs(Math.log(to.s / from.s)) * .35;
    const dur = o.instant || reduce.matches ? 0 : o.dur || clamp(780 + dist * 620, 780, 1300);
    anim = {
      from, to, t0: performance.now(), dur, html: o.html, step: o.step, swapped: false, faded: false,
      dip: camMode ? clamp(dist * .1, 0, .11) : 0, onEnd: o.onEnd,
    };
    ring.classList.remove('is-pulse');
    ring.classList.toggle('is-shown', to.pad > 0);
    // durante el movimiento la capa se compone en la GPU (fluido); al terminar se rasteriza nítida a la escala final
    if (camMode && dur) appEl.style.willChange = 'transform';
    if (o.html != null && !o.fresh && dur) content.classList.add('is-out');
    if (!dur) { finish(); return; }
    raf = requestAnimationFrame(tick);
  }

  function tick() {
    const a = anim;
    if (!a) return;
    const now = performance.now(); // mismo reloj que t0 (la marca de requestAnimationFrame puede venir atrasada)
    const t = clamp((now - a.t0) / a.dur, 0, 1), e = ease(t), f = a.from, g = a.to;
    if (a.html != null && !a.swapped && now - a.t0 >= Math.min(150, a.dur * .3)) {
      a.swapped = true;
      swapContent(a.html, a.step);
    }
    if (a.swapped && !a.faded && e >= .5) {
      a.faded = true;
      content.classList.remove('is-out');
      content.classList.add('is-in');
    }
    const s = Math.max(1, Math.exp(lerp(Math.log(f.s), Math.log(g.s), e)) * (1 - a.dip * Math.sin(Math.PI * e)));
    cur = {
      s, cx: lerp(f.cx, g.cx, e), cy: lerp(f.cy, g.cy, e), pad: lerp(f.pad, g.pad, e),
      hole: { x: lerp(f.hole.x, g.hole.x, e), y: lerp(f.hole.y, g.hole.y, e), w: lerp(f.hole.w, g.hole.w, e), h: lerp(f.hole.h, g.hole.h, e), r: lerp(f.hole.r, g.hole.r, e) },
      card: { x: lerp(f.card.x, g.card.x, e), y: lerp(f.card.y, g.card.y, e), w: lerp(f.card.w, g.card.w, e), h: lerp(f.card.h, g.card.h, e) },
    };
    render();
    if (t < 1) raf = requestAnimationFrame(tick); else finish();
  }

  function finish() {
    const a = anim;
    if (!a) return;
    anim = null;
    cur = snapshot(a.to);
    if (a.html != null && !a.swapped) { a.swapped = true; swapContent(a.html, a.step); }
    content.classList.remove('is-out');
    if (a.html != null && !a.faded) { a.faded = true; content.classList.add('is-in'); }
    render();
    appEl.style.willChange = '';
    card.style.height = ''; // vuelve a altura automática
    if (a.to.pad > 0 && !reduce.matches) { void ring.offsetWidth; ring.classList.add('is-pulse'); }
    if (a.onEnd) a.onEnd();
    else if (isOpen && !closing) {
      const b = $('[data-primary]', content);
      if (b) b.focus({ preventScroll: true });
    }
  }

  /* ---------- navegación ---------- */
  const legendHooks = {
    legend() {
      const lg = $('.legend'), btn = $('#legend-toggle');
      if (lg && lg.classList.contains('is-collapsed')) {
        saved.legendWasCollapsed = true;
        lg.classList.remove('is-collapsed');
        if (btn) btn.setAttribute('aria-expanded', 'true');
      }
    },
  };

  function go(i, dir = 1, fresh = false) {
    while (i >= 0 && i < STEPS.length) {
      const step = STEPS[i];
      let before = step.before;
      if (typeof before === 'string') before = legendHooks[before];
      if (before) before();
      const center = step.kind === 'center';
      const base = center ? null : targetBase(step);
      if (!center && !base) { i += dir; continue; } // la sección no existe en esta pantalla: se omite
      idx = i;
      const html = cardHTML(step, i);
      const plan = makePlan(step, base, measureCard(step, html));
      if (fresh) { // primera aparición: la tarjeta nace en su sitio
        swapContent(html, step);
        card.classList.add('is-shown', 'is-pop');
        content.classList.add('is-in');
        cur = snapshot(plan);
        render();
        run(plan, { instant: true, fresh: true });
      } else {
        run(plan, { html, step });
      }
      return;
    }
    if (dir > 0) close();
  }

  const next = () => { if (idx >= STEPS.length - 1) close(); else go(idx + 1, 1); };
  const prev = () => { if (idx > 0) go(idx - 1, -1); };

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'next') next(); else if (act === 'prev') prev(); else if (act === 'close') close();
  }

  function onKey(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    else if (e.key === 'Tab') { // el foco se queda dentro de la tarjeta
      const f = [...card.querySelectorAll('button:not([disabled]), a[href]')].filter(x => x.getClientRects().length);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1], at = document.activeElement;
      if (!card.contains(at)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    }
  }

  let resizeRaf = 0;
  function onResize() {
    if (!isOpen || closing) return;
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (camMode === narrow.matches) { close(true); return; } // cambió el modo (giro, ventana): se cierra
      cancelAnimationFrame(raf);
      anim = null;
      const step = STEPS[idx];
      const base = step.kind === 'center' ? null : targetBase(step);
      cur = snapshot(makePlan(step, base, measureCard(step, cardHTML(step, idx))));
      render();
      card.style.height = '';
    });
  }

  /* ---------- abrir y cerrar ---------- */
  function open() {
    if (isOpen) return;
    build();
    appEl = $('.app');
    isOpen = true; closing = false;
    camMode = !narrow.matches;
    saved = { scrollY: window.scrollY, tab: ($('.tab[aria-selected="true"]') || {}).id, focus: document.activeElement, legendWasCollapsed: false };
    if (camMode) window.scrollTo(0, 0);
    document.documentElement.classList.add('tour-lock');
    appEl.classList.add('is-touring');
    appEl.inert = true;
    tour.hidden = false;
    card.className = 'tour__card';
    ring.className = 'tour__ring';
    cur = camMode
      ? { cx: innerWidth / 2, cy: innerHeight / 2, s: 1, pad: 0, hole: { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0, r: 0 }, card: { x: 0, y: 0, w: 360, h: 200 } }
      : { cx: innerWidth / 2, cy: innerHeight / 2 + window.scrollY, s: 1, pad: 0, hole: { x: innerWidth / 2, y: innerHeight / 2 + window.scrollY, w: 0, h: 0, r: 0 }, card: { x: 0, y: 0, w: 360, h: 200 } };
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    go(0, 1, true);
    requestAnimationFrame(() => tour.classList.add('is-on'));
    setTimeout(() => { const b = $('[data-primary]', content); if (b && isOpen) b.focus({ preventScroll: true }); }, 60);
  }

  function close(instant = false) {
    if (!isOpen || closing) return;
    closing = true;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    tour.classList.remove('is-on');
    card.classList.remove('is-pop');
    card.classList.add('is-closing');
    const W = innerWidth, H = innerHeight;
    const c = camMode ? { tx: 0, ty: 0 } : { tx: 0, ty: -window.scrollY };
    const out = {
      cx: (W / 2 - c.tx), cy: (H / 2 - c.ty), s: 1, pad: 0,
      hole: { x: W / 2 - c.tx, y: H / 2 - c.ty, w: 0, h: 0, r: 0 },
      card: { ...cur.card },
    };
    run(out, { dur: 650, instant, onEnd: cleanup });
  }

  function cleanup() {
    cancelAnimationFrame(raf);
    anim = null;
    appEl.style.transform = '';
    appEl.classList.remove('is-touring');
    appEl.inert = false;
    document.documentElement.classList.remove('tour-lock');
    tour.hidden = true;
    tour.classList.remove('is-on');
    card.classList.remove('is-shown', 'is-pop', 'is-closing');
    content.innerHTML = '';
    if (saved) {
      if (saved.tab && window.CApp) CApp.setTab(saved.tab.replace('tab-', ''), false);
      if (saved.legendWasCollapsed) {
        const lg = $('.legend'), btn = $('#legend-toggle');
        if (lg) lg.classList.add('is-collapsed');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
      window.scrollTo(0, saved.scrollY);
      const f = saved.focus && document.contains(saved.focus) ? saved.focus : $('#help-btn');
      if (f && f.focus) f.focus({ preventScroll: true });
    }
    saved = null; isOpen = false; closing = false; idx = -1;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = $('#help-btn');
    if (btn) btn.addEventListener('click', open);
    if (new URLSearchParams(location.search).has('recorrido')) setTimeout(open, 700);
  });

  return { open, close, isOpen: () => isOpen };
})();
