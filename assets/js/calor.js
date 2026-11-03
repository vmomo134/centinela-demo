/* Mapa de calor de gravedad: superficie continua recortada a la silueta de Guerrero.
   Cada celda (~1 km) suma la energía del fuego (FRP, MW) de las detecciones cercanas con un núcleo
   gaussiano (σ = 10 km, alcance 30 km): el resultado es una superficie continua, como la de una red de
   estaciones interpoladas. El valor se pinta con una escala continua y se agrupa en 5 grados fijos
   (calibrados con el 30-abr-2026: mediana → bajo, 3 % más caliente → extremo).
   Sigue el mismo filtro de tiempo que el resto del mapa (ventana, día, hora o cuarto de hora). */
window.CCalor = (() => {
  const $ = s => document.querySelector(s);
  const BBOX = [-102.2, 16.3, -98.0, 18.9]; // mismo recuadro que el servidor y las imágenes
  const W = 420;
  const SIGMA = 10, REACH = 30; // km
  // grados de gravedad: [desde MW cercanos, nombre, color]
  const GRADES = [
    [0, 'Sin actividad', '#FFF3B8'],
    [10, 'Bajo', '#FFD84D'],
    [50, 'Moderado', '#FFAA1F'],
    [200, 'Alto', '#FF6A13'],
    [600, 'Muy alto', '#DF2A17'],
    [1500, 'Extremo', '#8E0B18'],
  ];
  let on = true, layer = null, labels = null, estado = null, zonas = null, under = false;
  // con una imagen GOES o descargada debajo, la superficie se vuelve translúcida para que se vean las dos
  let userOp = 0.85; // transparencia elegida en la leyenda: deja ver el terreno y los caminos bajo el calor
  try { const v = parseFloat(localStorage.getItem('centinela.calor-op')); if (v >= 0.3 && v <= 1) userOp = v; } catch { /* sin almacenamiento */ }
  const alpha = () => (under ? 0.55 : 1) * userOp;
  function setOpacity(v) {
    userOp = v;
    try { localStorage.setItem('centinela.calor-op', String(v)); } catch { /* sin almacenamiento */ }
    if (layer) layer.setOpacity(alpha());
  }
  function setImageryUnder(v) {
    under = v;
    if (layer) layer.setOpacity(alpha());
  }
  let field = null, H = 0, lastKey = '';

  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const latOf = y => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;
  const Y0 = mercY(BBOX[1]), Y1 = mercY(BBOX[3]);
  H = Math.round((W * (Y1 - Y0)) / (((BBOX[2] - BBOX[0]) * Math.PI) / 180));
  const lonOfCol = c => BBOX[0] + ((c + 0.5) / W) * (BBOX[2] - BBOX[0]);
  const latOfRow = r => latOf(Y1 - ((r + 0.5) / H) * (Y1 - Y0));
  const colOf = lon => Math.floor(((lon - BBOX[0]) / (BBOX[2] - BBOX[0])) * W);
  const rowOf = lat => Math.floor(((Y1 - mercY(lat)) / (Y1 - Y0)) * H);

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function grade(v) {
    let g = 0;
    for (let i = 0; i < GRADES.length; i++) if (v >= GRADES[i][0]) g = i;
    return g;
  }
  /** Color continuo: interpola entre grados en escala logarítmica. */
  function color(v) {
    const g = grade(v);
    if (g === GRADES.length - 1) return hex(GRADES[g][2]);
    const a = GRADES[g][0], b = GRADES[g + 1][0];
    const t = g === 0 ? v / b : (Math.log(v) - Math.log(a)) / (Math.log(b) - Math.log(a));
    const c0 = hex(GRADES[g][2]), c1 = hex(GRADES[g + 1][2]);
    return c0.map((x, i) => Math.round(x + (c1[i] - x) * Math.max(0, Math.min(1, t))));
  }

  /** Suma FRP·exp(-d²/2σ²) de cada detección en las celdas a menos de REACH km. */
  function compute(points) {
    const f = new Float32Array(W * H);
    const kmLat = 110.57;
    for (const p of points) {
      const [lat, lon, , frp] = p;
      if (!(frp > 0)) continue;
      const kmLon = 111.32 * Math.cos((lat * Math.PI) / 180);
      const c0 = colOf(lon - REACH / kmLon), c1 = colOf(lon + REACH / kmLon);
      const r0 = rowOf(lat + REACH / kmLat), r1 = rowOf(lat - REACH / kmLat);
      for (let r = Math.max(0, r0); r <= Math.min(H - 1, r1); r++) {
        const dy = (latOfRow(r) - lat) * kmLat;
        for (let c = Math.max(0, c0); c <= Math.min(W - 1, c1); c++) {
          const dx = (lonOfCol(c) - lon) * kmLon;
          const d2 = dx * dx + dy * dy;
          if (d2 > REACH * REACH) continue;
          f[r * W + c] += frp * Math.exp(-d2 / (2 * SIGMA * SIGMA));
        }
      }
    }
    return f;
  }

  function ringsOf(geom) {
    return geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
  }
  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  async function loadShapes() {
    if (!estado) estado = await fetch('assets/data/guerrero-estado.geojson').then(r => r.json());
    if (!zonas) zonas = await fetch('assets/data/zonas-guerrero.geojson').then(r => r.json());
  }

  function paint() {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    // recorte con la silueta del estado
    ctx.beginPath();
    estado.features.forEach(ft => ringsOf(ft.geometry).forEach(ring => ring.forEach(([lon, lat], i) => {
      const x = ((lon - BBOX[0]) / (BBOX[2] - BBOX[0])) * W, y = ((Y1 - mercY(lat)) / (Y1 - Y0)) * H;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    })));
    ctx.closePath();
    ctx.save();
    ctx.clip();
    const img = ctx.createImageData(W, H);
    for (let k = 0; k < W * H; k++) {
      const v = field[k];
      const [r, g, b] = color(v);
      img.data[k * 4] = r; img.data[k * 4 + 1] = g; img.data[k * 4 + 2] = b;
      img.data[k * 4 + 3] = 225; // superficie casi opaca, como un mapa de temperatura
    }
    // putImageData ignora el recorte: se pinta en otro lienzo y se dibuja recortado
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
    // contorno del estado
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(70,20,0,.55)';
    ctx.stroke();
    return cv.toDataURL('image/png');
  }

  /** Valor máximo dentro de cada zona de riesgo, para las etiquetas numéricas. */
  function zonePeaks() {
    return zonas.features.map(ft => {
      const rings = ringsOf(ft.geometry);
      const xs = rings.flat().map(p => p[0]), ys = rings.flat().map(p => p[1]);
      let best = 0, at = null;
      for (let r = Math.max(0, rowOf(Math.max(...ys))); r <= Math.min(H - 1, rowOf(Math.min(...ys))); r++) {
        const lat = latOfRow(r);
        for (let c = Math.max(0, colOf(Math.min(...xs))); c <= Math.min(W - 1, colOf(Math.max(...xs))); c++) {
          const lon = lonOfCol(c);
          if (!rings.some(ring => inRing(lon, lat, ring))) continue;
          if (field[r * W + c] >= best) { best = field[r * W + c]; at = [lat, lon]; }
        }
      }
      const cx = xs.reduce((a, b) => a + b, 0) / xs.length, cy = ys.reduce((a, b) => a + b, 0) / ys.length;
      return { name: ft.properties.nombre, value: best, at: best >= 1 && at ? at : [cy, cx] };
    });
  }

  async function render(state) {
    const map = CMap.map;
    if (!map || !state.data) return;
    if (!map.getPane('calor')) map.createPane('calor').style.zIndex = 380; // sobre la imagen, bajo zonas y puntos
    if (!on) { clear(); return; }
    await loadShapes();
    const pts = CApp.visiblePoints(state.data);
    const key = `${pts.length}|${pts.length ? pts[0][2] + '|' + pts[pts.length - 1][2] : ''}|${JSON.stringify(state.focus)}|${state.window}|${state.date}`;
    if (key === lastKey && layer) return;
    lastKey = key;
    field = compute(pts);
    clear();
    layer = L.imageOverlay(paint(), [[BBOX[1], BBOX[0]], [BBOX[3], BBOX[2]]], {
      pane: 'calor', opacity: alpha(), className: 'calor-img', interactive: false,
    }).addTo(map);
    labels = L.layerGroup([], { pane: 'calor' }).addTo(map);
    zonePeaks().forEach(z => {
      const g = grade(z.value);
      L.marker(z.at, {
        pane: 'calor', interactive: false, keyboard: false,
        icon: L.divIcon({
          className: 'calor-lbl',
          html: `<span class="calor-lbl__v calor-lbl__v--g${g}">${z.value >= 1 ? Math.round(z.value) : '0'}</span>`,
          iconSize: [34, 18], iconAnchor: [17, 9],
        }),
      }).addTo(labels);
    });
    renderScale();
  }

  function clear() {
    if (layer) { CMap.map.removeLayer(layer); layer = null; }
    if (labels) { CMap.map.removeLayer(labels); labels = null; }
  }

  function renderScale() {
    const el = $('#calor-scale');
    if (!el) return;
    el.innerHTML = GRADES.slice(1).map(([v, n, c]) =>
      `<span class="calor-scale__step"><i style="background:${c}"></i>${n}<b>${v}+</b></span>`).join('');
  }

  /** Valor bajo el cursor: "Gravedad alta · 87 MW cercanos". */
  function hover(e) {
    const tip = $('#calor-tip');
    if (!tip) return;
    if (!on || !field) { tip.hidden = true; return; }
    const c = colOf(e.latlng.lng), r = rowOf(e.latlng.lat);
    if (c < 0 || c >= W || r < 0 || r >= H || !estado.features.some(ft => ringsOf(ft.geometry).some(ring => inRing(e.latlng.lng, e.latlng.lat, ring)))) {
      tip.hidden = true;
      return;
    }
    const v = field[r * W + c], g = grade(v);
    tip.hidden = false;
    tip.innerHTML = `<i style="background:${GRADES[g][2]}"></i>${GRADES[g][1]} · ${v >= 1 ? Math.round(v) : 0} MW en ~20 km`;
  }

  function setOn(v) {
    on = v;
    lastKey = '';
    const sc = $('#calor-box');
    if (sc) sc.hidden = !on;
    if (window.CApp && CApp.state.data) render(CApp.state);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[name="vista"]').forEach(r => r.addEventListener('change', () => CApp.setView(r.value)));
    const op = $('#calor-op');
    if (op) {
      op.value = Math.round(userOp * 100);
      op.addEventListener('input', () => setOpacity(op.value / 100));
    }
    if (window.CApp) CApp.on(s => render(s));
    // el mapa se crea en el arranque de la app: se engancha el cursor en cuanto exista
    const wait = setInterval(() => {
      if (!window.CMap || !CMap.map) return;
      clearInterval(wait);
      CMap.map.on('mousemove', hover);
      CMap.map.on('mouseout', () => { const tip = $('#calor-tip'); if (tip) tip.hidden = true; });
    }, 50);
  });

  return { render, setOn, setImageryUnder, GRADES, grade };
})();
