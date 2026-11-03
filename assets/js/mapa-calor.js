/* Centinela · portada.
   El cursor calienta la silueta blanca del país: el calor y los puntos rojos se recortan a su forma exacta.
   Todo va en un <canvas>; si algo falla, queda la portada estática. */
(() => {
  'use strict';
  const root = document.querySelector('.banner');
  const cv = root && root.querySelector('.banner__brasa');
  const shapeEl = root && root.querySelector('.stage__map');
  if (!cv || !cv.getContext || !shapeEl) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;

  const rm = matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- estado ----------
  let W = 0, H = 0, dpr = 1, gw = 0, gh = 0, cell = 6, R = 60, gs = 6;
  let imgMapa = null, shapeMask = null;    // imagen del país y su silueta a resolución del canvas
  let heat, noise, land, himg, hctx;
  const hc = document.createElement('canvas');
  const dets = [], rings = [], trail = [];
  let activity = 0, raf = 0, last = 0, clock = 0, visible = true;
  const ptr = { x: 0, y: 0, fx: 0, fy: 0, on: false, fresh: false, touch: false };

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;

  // calor 0..1 -> RGBA. Sobre la silueta clara se pinta con "multiply": tiñe el relieve como papel que se quema.
  const LUT = (() => {
    const stops = [[0, 255, 235, 150, 0], [.06, 255, 232, 150, .3], [.22, 255, 196, 84, .72], [.42, 255, 126, 44, .92],
                   [.68, 236, 52, 30, 1], [.9, 190, 22, 26, 1], [1, 150, 12, 22, 1]];
    const out = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) {
      const t = i / 255; let k = 1;
      while (k < stops.length - 1 && t > stops[k][0]) k++;
      const a = stops[k - 1], b = stops[k], u = (t - a[0]) / (b[0] - a[0] || 1);
      for (let c = 0; c < 4; c++) out[i * 4 + c] = (a[c + 1] + (b[c + 1] - a[c + 1]) * u) * (c === 3 ? 255 : 1);
    }
    return out;
  })();
  const GLOW = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(214,24,28,.85)'); r.addColorStop(.25, 'rgba(230,60,30,.45)'); r.addColorStop(1, 'rgba(255,30,20,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return c;
  })();
  const COLS = ['#d8101a', '#ec4a1a', '#f08a1e'];

  function valueNoise(w, h) {
    // ruido de valor en dos octavas: da forma irregular de mancha al calor
    const out = new Float32Array(w * h);
    for (const [f, amp] of [[7, .62], [17, .38]]) {
      const lw = Math.ceil(w / f) + 2, lh = Math.ceil(h / f) + 2, g = new Float32Array(lw * lh);
      for (let i = 0; i < g.length; i++) g[i] = Math.random();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const fx = x / f, fy = y / f, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const a = g[y0 * lw + x0], b = g[y0 * lw + x0 + 1], c = g[(y0 + 1) * lw + x0], d = g[(y0 + 1) * lw + x0 + 1];
        out[y * w + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    return out;
  }

  // ---------- geometría ----------
  function layout() {
    const r = root.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    R = clamp(W * .058, 42, 86); gs = clamp(Math.round(W / 150), 5, 9);
    cell = Math.max(5, W / 190); gw = Math.ceil(W / cell); gh = Math.ceil(H / cell);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    heat = new Float32Array(gw * gh); noise = valueNoise(gw, gh);
    hc.width = gw; hc.height = gh; hctx = hc.getContext('2d'); himg = hctx.createImageData(gw, gh);
    dets.length = rings.length = trail.length = 0;
    buildShape();
  }

  let maskG = null;
  function paintMask() {
    // silueta del país: el canal alfa de la imagen, con la misma transformación que el SVG en pantalla
    // (se repinta en cada cuadro porque el mapa flota)
    if (!maskG) return;
    const m = shapeEl.getScreenCTM(), r = root.getBoundingClientRect();
    if (!m) return;
    maskG.setTransform(1, 0, 0, 1, 0, 0); maskG.clearRect(0, 0, shapeMask.width, shapeMask.height);
    maskG.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * (m.e - r.left), dpr * (m.f - r.top));
    maskG.drawImage(imgMapa, +shapeEl.getAttribute('x'), +shapeEl.getAttribute('y'), +shapeEl.getAttribute('width'), +shapeEl.getAttribute('height'));
  }

  function buildShape() {
    shapeMask = null; maskG = null; land = new Uint8Array(gw * gh).fill(1);
    const mk = document.createElement('canvas'); mk.width = Math.round(W * dpr); mk.height = Math.round(H * dpr);
    shapeMask = mk; maskG = mk.getContext('2d');
    paintMask();
    try {                                   // dónde hay país, para que los puntos nazcan solo sobre él
      const c = document.createElement('canvas'); c.width = gw; c.height = gh;
      const gg = c.getContext('2d', { willReadFrequently: true });
      gg.drawImage(mk, 0, 0, gw, gh);
      const d = gg.getImageData(0, 0, gw, gh).data;
      for (let i = 0; i < gw * gh; i++) land[i] = d[i * 4 + 3] > 110 ? 1 : 0;
    } catch (e) { /* queda todo como país */ }
  }

  // ---------- calor ----------
  function stamp(x, y, amount, rad) {
    const cx = x / cell, cy = y / cell, rr = rad / cell, sig2 = 2 * (rr * .46) * (rr * .46);
    const x0 = Math.max(0, Math.floor(cx - rr * 1.5)), x1 = Math.min(gw - 1, Math.ceil(cx + rr * 1.5));
    const y0 = Math.max(0, Math.floor(cy - rr * 1.5)), y1 = Math.min(gh - 1, Math.ceil(cy + rr * 1.5));
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const dx = i + .5 - cx, dy = j + .5 - cy, w = Math.exp(-(dx * dx + dy * dy) / sig2);
      if (w < .01) continue;
      const k = j * gw + i, v = heat[k] + amount * w * (.5 + .95 * noise[k]);
      heat[k] = v > 1.35 ? 1.35 : v;
    }
  }

  function decay(dt) {
    const k = Math.exp(-dt / 1.55); let alive = false;
    for (let i = 0; i < heat.length; i++) {
      const v = heat[i] * k;
      if (v < .012) heat[i] = 0; else { heat[i] = v; alive = true; }
    }
    return alive;
  }

  function paint(t) {
    const d = himg.data;
    for (let i = 0, p = 0; i < heat.length; i++, p += 4) {
      let v = heat[i];
      if (v <= 0) { d[p + 3] = 0; continue; }
      v *= 1 + .07 * Math.sin(t * 3.1 + noise[i] * 14);               // parpadeo de brasa
      const q = (clamp(v / 1.3, 0, 1) * 255 | 0) * 4;
      d[p] = LUT[q]; d[p + 1] = LUT[q + 1]; d[p + 2] = LUT[q + 2]; d[p + 3] = LUT[q + 3];
    }
    hctx.putImageData(himg, 0, 0);
  }

  // ---------- detecciones ----------
  const cellAt = (x, y) => clamp(y / cell | 0, 0, gh - 1) * gw + clamp(x / cell | 0, 0, gw - 1);
  const isLand = (x, y) => land[cellAt(x, y)] === 1;

  function cluster(x, y, born, ring) {
    if (!isLand(x, y)) return;
    const n = 2 + (Math.random() * 4 | 0);
    for (let k = 0; k < n && dets.length < 460; k++) {
      const dx = gauss() * gs * 1.5, dy = gauss() * gs * 1.5;
      if (k && !isLand(x + dx, y + dy)) continue;
      const pick = Math.random();
      dets.push({ x: x + dx, y: y + dy, r: gs * rnd(.32, .78) + .8, born: born + k * .035, life: rnd(3, 6.2),
                  col: pick < .82 ? 0 : pick < .95 ? 1 : 2, ph: Math.random() * 6.28 });
    }
    if (ring && rings.length < 12) rings.push({ x, y, born, life: 1.3 });
  }

  function fromTrail(dt, t) {
    if (!trail.length) return;
    activity = Math.max(0, activity - dt * .8);
    let budget = 34 * Math.min(1, activity) * dt;
    while (budget > 0 && (budget >= 1 || Math.random() < budget)) {
      budget -= 1;
      const p = trail[Math.min(trail.length - 1, (Math.random() * Math.random() * trail.length) | 0)];
      const a = Math.random() * 6.283, d = Math.abs(gauss()) * R * .55;
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (heat[cellAt(x, y)] > .2) cluster(x, y, t, Math.random() < .22);
    }
  }

  // ---------- dibujo ----------
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(hc, 0, 0, gw, gh, 0, 0, gw * cell, gh * cell);

    for (let i = dets.length - 1; i >= 0; i--) {
      const d = dets[i], age = t - d.born;
      if (age > d.life) { dets.splice(i, 1); continue; }
      if (age < 0) continue;
      const fin = Math.min(1, age / .25), fout = Math.min(1, (d.life - age) / 1.5);
      const a = fin * fout * (.86 + .14 * Math.sin(t * 6 + d.ph)), pop = 1 + .9 * (1 - fin), gsz = d.r * 7 * pop;
      ctx.globalAlpha = a * .5; ctx.drawImage(GLOW, d.x - gsz / 2, d.y - gsz / 2, gsz, gsz);
      ctx.globalAlpha = a; ctx.fillStyle = COLS[d.col];
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * pop, 0, 6.283); ctx.fill();
    }
    ctx.lineWidth = 1.4;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i], u = (t - r.born) / r.life;
      if (u >= 1) { rings.splice(i, 1); continue; }
      if (u < 0) continue;
      const e = 1 - Math.pow(1 - u, 3);
      ctx.globalAlpha = (1 - u) * .7; ctx.strokeStyle = '#d8341c';
      ctx.beginPath(); ctx.arc(r.x, r.y, gs * .6 + e * gs * 8, 0, 6.283); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (shapeMask) {                         // recorte a la silueta del país
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(shapeMask, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------- bucle ----------
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now; clock += dt;

    if (ptr.on) {                            // el pincel persigue al cursor con inercia y deja estela continua
      if (ptr.fresh) { ptr.fx = ptr.x; ptr.fy = ptr.y; ptr.fresh = false; trail.length = 0; }
      const k = 1 - Math.exp(-dt * 22), nx = ptr.fx + (ptr.x - ptr.fx) * k, ny = ptr.fy + (ptr.y - ptr.fy) * k;
      const dx = nx - ptr.fx, dy = ny - ptr.fy, dist = Math.hypot(dx, dy), step = Math.max(6, R * .28);
      const n = Math.max(1, Math.ceil(dist / step));
      for (let i = 1; i <= n; i++) stamp(ptr.fx + dx * i / n, ptr.fy + dy * i / n, .1, R);
      stamp(nx, ny, dt * (rm.matches ? .6 : .85), R * .8);        // al quedarse quieto el fuego crece
      ptr.fx = nx; ptr.fy = ny;
      trail.unshift({ x: nx, y: ny }); if (trail.length > 40) trail.pop();
      activity = Math.min(1.2, activity + dist * .006 + dt * .5);
    }

    if (!rm.matches) paintMask();
    const alive = decay(dt); fromTrail(dt, clock); paint(clock); draw(clock);
    if (ptr.on || alive || dets.length || rings.length) raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (imgMapa && !raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  // ---------- entrada ----------
  const local = e => { const r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  root.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && !ptr.touch) return;
    const p = local(e);
    if (!ptr.on) ptr.fresh = true;
    ptr.x = p.x; ptr.y = p.y; ptr.on = true; wake();
  }, { passive: true });
  root.addEventListener('pointerdown', e => {
    const p = local(e);
    ptr.touch = e.pointerType === 'touch';
    ptr.x = p.x; ptr.y = p.y; ptr.on = true; ptr.fresh = true; activity = 1;
    stamp(p.x, p.y, .85, R); cluster(p.x, p.y, clock, true); wake();
  }, { passive: true });
  const off = () => { ptr.on = false; ptr.touch = false; };
  root.addEventListener('pointerleave', off);
  root.addEventListener('pointerup', e => { if (e.pointerType === 'touch') off(); });
  root.addEventListener('pointercancel', off);

  // ---------- arranque ----------
  const im = new Image(); im.decoding = 'async';
  im.onload = () => { imgMapa = im; layout(); wake(); };
  im.src = shapeEl.getAttribute('href');

  let rz = 0;
  new ResizeObserver(() => { if (!imgMapa) return; clearTimeout(rz); rz = setTimeout(() => { layout(); wake(); }, 120); }).observe(root);
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) wake(); }, { threshold: 0 }).observe(root);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
})();
