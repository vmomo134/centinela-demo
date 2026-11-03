/* Mapa Leaflet: base clara u oscura según el tema + capa ráster FIRMS + polígonos de zona + marcadores de evento. */
window.CMap = (() => {
  let map, wmsLayer, goesLayer, goesKey = '', zonasLayer, evLayer, ptLayer, forecastLayer, zonasGeo = null, baseLayers = [];
  let ptsOn = true, evOn = true, lastState = null, userMoved = false;
  const canvas = L.canvas({ padding: 0.3 });
  // color del píxel por familia de satélite (siempre con nombre en la ventana emergente)
  const PT_COLOR = { VIIRS: '#FF4D2E', MODIS: '#FFA41B', GOES: '#FFE45C' };
  const fam = src => (src.startsWith('GOES') ? 'GOES' : src.startsWith('MODIS') ? 'MODIS' : 'VIIRS');
  const SAT_NAME = s => ({ N: 'S-NPP', N20: 'NOAA-20', N21: 'NOAA-21', A: 'Aqua', T: 'Terra', Aqua: 'Aqua', Terra: 'Terra' }[s] || s.replace(/^G(\d+)$/, 'GOES-$1'));
  let wmsOn = true, curWin = 24;
  const markerById = {};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = () => window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
  // Nombres de poblaciones (Esri) sobre el calor y los puntos, con contorno para leerse sobre el rojo:
  // texto blanco con halo oscuro en el tema oscuro y texto oscuro con halo claro en el claro
  const ESRI_REF = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/';
  let labelsOn = true;
  try { labelsOn = localStorage.getItem('centinela.nombres') !== 'no'; } catch { /* sin almacenamiento */ }

  // El mapa base sigue el tema de la interfaz (claro/oscuro).
  function setBase() {
    const dark = CFmt.themeIsDark();
    const set = dark ? 'World_Dark_Gray' : 'World_Light_Gray';
    baseLayers.forEach(l => map.removeLayer(l));
    baseLayers = [
      L.tileLayer(`${ESRI}${set}_Base/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 16, attribution: '&copy; Esri, HERE, Garmin, &copy; OpenStreetMap',
      }),
    ];
    if (labelsOn) {
      baseLayers.push(L.tileLayer(`${ESRI_REF}World_Boundaries_and_Places${dark ? '' : '_Alternate'}/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 15, pane: 'etiquetas', tileSize: 512, zoomOffset: -1, // mosaico al doble de tamaño: el texto se lee sobre el calor
        attribution: 'Nombres &copy; Esri, HERE, Garmin, &copy; OpenStreetMap',
      }));
    }
    baseLayers.forEach(l => l.addTo(map));
    baseLayers[0].bringToBack();
  }

  function setLabels(on) {
    labelsOn = on;
    try { localStorage.setItem('centinela.nombres', on ? 'si' : 'no'); } catch { /* sin almacenamiento */ }
    setBase();
  }

  const GRO_BOUNDS = [[16.3, -102.2], [18.9, -98.0]];

  /** Margen al encuadrar Guerrero: deja libre el lado de la leyenda si está abierta y el mapa es ancho. */
  function framePad() {
    const lg = document.querySelector('.legend');
    const open = lg && !lg.classList.contains('is-collapsed');
    const w = document.getElementById('map').clientWidth;
    // el panel lateral, los indicadores y la bitácora flotan sobre el mapa: se deja libre su espacio
    const over = sel => { const el = document.querySelector(sel); return el && getComputedStyle(el).position === 'absolute' && el.offsetWidth ? el : null; };
    const side = over('.sidebar'), hud = over('.hud'), log = over('.bitacora');
    const left = open && w > 700 ? Math.round(lg.offsetWidth * 0.6) + 16 : 16;
    return {
      paddingTopLeft: [left, hud ? hud.offsetHeight + 28 : 12],
      paddingBottomRight: [side ? side.offsetWidth + 36 : 40, log ? log.offsetHeight + 28 : 12],
    };
  }

  /** Leyenda plegable: se recuerda la elección; si no hay, se pliega sola cuando el mapa es bajo. */
  function setupLegend() {
    const lg = document.querySelector('.legend'), btn = document.getElementById('legend-toggle');
    if (!lg || !btn) return;
    const apply = open => {
      lg.classList.toggle('is-collapsed', !open);
      btn.setAttribute('aria-expanded', String(open));
    };
    let pref = null;
    try { pref = localStorage.getItem('centinela.leyenda'); } catch { /* sin almacenamiento */ }
    apply(pref ? pref === 'abierta' : document.getElementById('map').clientHeight >= 700);
    btn.addEventListener('click', () => {
      const open = lg.classList.contains('is-collapsed');
      apply(open);
      try { localStorage.setItem('centinela.leyenda', open ? 'abierta' : 'plegada'); } catch { /* sin almacenamiento */ }
    });
  }

  function init() {
    setupLegend();
    map = L.map('map', {
      zoomControl: false, attributionControl: true,
      minZoom: 6, maxZoom: 15, zoomSnap: 0.25, zoomDelta: 0.5, // encuadre más justo de Guerrero
    }).fitBounds(GRO_BOUNDS, framePad()); // todo Guerrero a la vista

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    map.createPane('firms').style.zIndex = 350;
    map.createPane('zonas').style.zIndex = 400;
    map.createPane('puntos').style.zIndex = 450;
    map.createPane('eventos').style.zIndex = 500;
    // por encima de todo salvo ventanas: los nombres de comunidades nunca quedan tapados por el calor ni los puntos
    const lp = map.createPane('etiquetas');
    lp.style.zIndex = 520;
    lp.style.pointerEvents = 'none';
    setBase();
    const lt = document.getElementById('lbl-toggle');
    if (lt) {
      lt.checked = labelsOn;
      lt.addEventListener('change', () => setLabels(lt.checked));
    }
    // los píxeles se dibujan a su tamaño real solo con zoom suficiente; al cambiar de escala se repintan
    map.on('moveend', () => { if (lastState) renderPoints(lastState); });

    // el contenedor puede terminar de dimensionarse tras el primer pintado: se vuelve a encuadrar Guerrero
    setTimeout(() => {
      map.invalidateSize();
      if (!userMoved) map.fitBounds(GRO_BOUNDS, framePad());
    }, 250);
    map.once('dragstart zoomstart', () => { userMoved = true; });
    let rt;
    const relayout = () => {
      clearTimeout(rt);
      rt = setTimeout(() => map.invalidateSize(), 150);
    };
    window.addEventListener('resize', relayout);
    // el contenedor también cambia sin "resize" de ventana (la barra superior pasa a dos filas, etc.)
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(map.getContainer());
  }

  // time = 'YYYY-MM-DD/YYYY-MM-DD' para imágenes de una fecha pasada; null = últimas 24/48/72 h
  function setWms(on, windowH, time = null) {
    if (windowH) curWin = windowH;
    wmsOn = on;
    if (wmsLayer) { map.removeLayer(wmsLayer); wmsLayer = null; }
    if (!on) return;
    const opts = {
      layers: time ? 'fires_viirs,fires_modis' : `fires_viirs_${curWin},fires_modis_${curWin}`,
      format: 'image/png', transparent: true, version: '1.3.0',
      pane: 'firms', opacity: 0.85,
    };
    if (time) opts.time = time;
    wmsLayer = L.tileLayer.wms('assets/img/tile-blank.png', opts).addTo(map);
  }

  // Imagen GOES-East de NASA GIBS (WMTS, sin llave). id = null la quita.
  function setGoes(id, iso, matrix, kind) {
    const key = id ? `${id}|${iso}` : '';
    if (key === goesKey) return;
    goesKey = key;
    if (goesLayer) { map.removeLayer(goesLayer); goesLayer = null; }
    if (!id) return;
    goesLayer = L.tileLayer(
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${id}/default/${iso}/${matrix}/{z}/{y}/{x}.png`, {
        pane: 'firms', maxNativeZoom: 7, maxZoom: 15, opacity: kind === 'calor' ? 0.9 : 0.75,
        attribution: 'Imagen GOES-East &copy; NASA GIBS / NOAA',
      }).addTo(map);
  }

  /**
   * Cada detección como el píxel que vio el satélite: ancho (scan) × alto (track) en km.
   * Con poco zoom un píxel de 375 m no se vería: se dibuja como punto de tamaño fijo.
   */
  function renderPoints(state) {
    lastState = state;
    if (ptLayer) { map.removeLayer(ptLayer); ptLayer = null; }
    if (!ptsOn || !state.data) return;
    const pts = CApp.visiblePoints(state.data);
    ptLayer = L.layerGroup([], { pane: 'puntos' }).addTo(map);
    const real = map.getZoom() >= 10;
    const b = map.getBounds().pad(0.2);
    pts.forEach(p => {
      const [lat, lon, acq, frp, src, conf, w, h, sat] = p;
      if (real && !b.contains([lat, lon])) return;
      const f = fam(src);
      const col = PT_COLOR[f];
      const style = {
        renderer: canvas, pane: 'puntos', color: f === 'GOES' ? '#B8860B' : '#3a0d00',
        weight: f === 'GOES' ? 1.5 : 1, fillColor: col, fillOpacity: f === 'GOES' ? 0.35 : 0.85,
        dashArray: f === 'GOES' ? '3 2' : null,
      };
      let mk;
      if (real) {
        const dLat = h / 111.32 / 2, dLon = w / (111.32 * Math.cos(lat * Math.PI / 180)) / 2;
        mk = L.rectangle([[lat - dLat, lon - dLon], [lat + dLat, lon + dLon]], style);
      } else {
        mk = L.circleMarker([lat, lon], { ...style, radius: f === 'GOES' ? 3.5 : 2.5 });
      }
      mk.bindPopup(
        `<b>Detección ${f}</b> · ${SAT_NAME(sat)}<br>${CFmt.fecha(acq)}<br>` +
        `FRP ${frp} MW · confianza ${({ h: 'alta', n: 'nominal', l: 'baja' })[conf] || conf}<br>` +
        `Píxel de ${w.toFixed(2)} × ${h.toFixed(2)} km · ${lat.toFixed(4)}, ${lon.toFixed(4)}`
      );
      mk.addTo(ptLayer);
    });
  }

  /** Focos que GOES detectó en el instante elegido con el deslizador de hora: anillos cian sobre la imagen. */
  let scanLayer = null;
  function setScan(points) {
    if (scanLayer) { map.removeLayer(scanLayer); scanLayer = null; }
    if (!points || !points.length) return;
    scanLayer = L.layerGroup([], { pane: 'puntos' }).addTo(map);
    points.forEach(p => {
      const [lat, lon, acq, frp, , conf, , , sat] = p;
      L.circleMarker([lat, lon], { pane: 'puntos', radius: 11, color: '#00D4FF', weight: 3, fill: true, fillColor: '#00D4FF', fillOpacity: 0.12 })
        .bindPopup(`<b>Detección GOES de este instante</b> · ${SAT_NAME(sat)}<br>${CFmt.fecha(acq)}<br>` +
          `FRP ${frp} MW · confianza ${({ h: 'alta', n: 'nominal', l: 'baja' })[conf] || conf}`)
        .addTo(scanLayer);
    });
  }

  /** Focos agrupados (círculos): ocultos en la vista de calor, que ya los resume. */
  function setEventsVisible(on) {
    evOn = on;
    if (!map) return;
    if (evLayer && on && !map.hasLayer(evLayer)) evLayer.addTo(map);
    if (evLayer && !on && map.hasLayer(evLayer)) map.removeLayer(evLayer);
    if (forecastLayer && on && forecastLayer.getLayers().length && !map.hasLayer(forecastLayer)) forecastLayer.addTo(map);
    if (forecastLayer && !on && map.hasLayer(forecastLayer)) map.removeLayer(forecastLayer);
  }

  function setPoints(on) {
    ptsOn = on;
    if (lastState) renderPoints(lastState);
  }

  // Imagen descargada al servidor (recuadro de Guerrero en Web Mercator): url = null la quita.
  const GRO = [[16.3, -102.2], [18.9, -98.0]];
  let localLayer = null, localUrl = '';
  function setLocalImage(url, opacity = 0.85) {
    if ((url || '') === localUrl) return;
    localUrl = url || '';
    if (localLayer) { map.removeLayer(localLayer); localLayer = null; }
    if (!url) return;
    localLayer = L.imageOverlay(url, GRO, { pane: 'firms', opacity, className: 'img-new', attribution: 'Imagen &copy; NASA GIBS (descargada)' }).addTo(map);
  }

  async function loadZonas() {
    if (!zonasGeo) zonasGeo = await fetch('assets/data/zonas-guerrero.geojson').then(r => r.json());
    return zonasGeo;
  }

  async function render(state) {
    const d = state.data;
    if (!d || !map) return;
    curWin = state.window;
    await loadZonas();

    // --- zonas ---
    const est = {};
    d.zone_state.forEach(z => (est[z.id] = z));
    if (zonasLayer) map.removeLayer(zonasLayer);
    zonasLayer = L.geoJSON(zonasGeo, {
      pane: 'zonas',
      style: f => {
        const e = (est[f.properties.id] && est[f.properties.id].estado) || 'normal';
        const c = CFmt.EST_COLOR[e];
        return {
          color: c, weight: e === 'normal' ? 1 : 2,
          dashArray: e === 'normal' ? '2 4' : null,
          fillColor: c, fillOpacity: e === 'normal' ? 0.04 : 0.14,
        };
      },
      onEachFeature: (f, lyr) => {
        const z = est[f.properties.id];
        lyr.bindPopup(
          `<b>${f.properties.nombre}</b><br>Estado: ${CFmt.est(z ? z.estado : 'normal').toLowerCase()}` +
          ` · ${(z && z.events_24h) || 0} foco(s) en 24 h` +
          `<br>${f.properties.region} · peso ${f.properties.peso}`
        );
      },
    }).addTo(map);

    renderPoints(state);

    if (forecastLayer) map.removeLayer(forecastLayer);
    forecastLayer = L.layerGroup([], { pane: 'eventos' });
    for (const e of CApp.visibleEvents(d)) {
      const f = e.forecast;
      if (!f || f.status !== 'observed_trend' || !Array.isArray(f.points) || !f.points.length) continue;
      const path = [[e.lat, e.lon], ...f.points.map(p => [p.lat, p.lon])];
      L.polyline(path, { pane: 'eventos', color: '#54d6c7', weight: 2, dashArray: '7 7', opacity: 0.85 }).addTo(forecastLayer);
      f.points.forEach(p => L.circleMarker([p.lat, p.lon], {
        pane: 'eventos', radius: p.hours === 6 ? 5 : 3, color: '#54d6c7', weight: 1.5,
        fillColor: '#102c31', fillOpacity: 0.9,
      }).bindTooltip(`Tendencia +${p.hours} h · incertidumbre ±${p.uncertainty_km} km`).addTo(forecastLayer));
    }
    if (evOn && forecastLayer.getLayers().length) forecastLayer.addTo(map);

    // --- eventos (filtrados por la ventana temporal) ---
    const evs = CApp.visibleEvents(d);
    if (evLayer) map.removeLayer(evLayer);
    for (const k in markerById) delete markerById[k];
    evLayer = L.layerGroup([], { pane: 'eventos' });
    if (evOn) evLayer.addTo(map);

    evs.forEach(e => {
      const fresh = d.meta.now - e.last_seen < 10800;
      // solo-GOES: píxel de ~2 km, se dibuja hueco con borde punteado para no confundirlo con VIIRS
      const m = L.circleMarker([e.lat, e.lon], e.official_only ? {
        pane: 'eventos', radius: 8, color: '#36c3b3', weight: 3,
        fillColor: '#36c3b3', fillOpacity: 0.35,
      } : e.goes ? {
        pane: 'eventos', radius: Math.max(6, Math.min(16, 5 + 1.6 * Math.sqrt(e.frp_max))),
        color: CFmt.SEV_COLOR[e.severity] || '#54948E', weight: 2.5, dashArray: '3 3',
        fillColor: CFmt.SEV_COLOR[e.severity] || '#54948E', fillOpacity: 0.18,
      } : {
        pane: 'eventos',
        radius: Math.max(4, Math.min(22, 4 + 2.2 * Math.sqrt(e.frp_max))),
        color: CFmt.markerRim(),
        weight: e.severity === 'critico' ? 3 : 2,
        fillColor: CFmt.SEV_COLOR[e.severity] || '#54948E',
        fillOpacity: 0.85,
        className: fresh && !reduce() ? 'evt-fresh' : '',
      });
      const classification = e.confirmation
        ? `<b>Confirmado por ${esc(e.confirmation.authority)}</b> · ${esc(e.confirmation.incident_status)} · ${esc(e.confirmation.municipality)} (${e.confirmation.distance_km} km)<br>`
        : e.agricultural_context
          ? `<b>Posible quema agrícola</b> · uso de suelo: ${esc(e.landcover && e.landcover.description)}<br>`
          : '<b>Detección satelital</b> · sin coincidencia oficial reciente<br>';
      const forecastText = e.forecast && e.forecast.status === 'observed_trend'
        ? `Tendencia observada: ${e.forecast.speed_kmh} km/h, rumbo ${e.forecast.bearing_deg}° · horizonte 6 h.<br>${esc(e.forecast.basis)}<br>`
        : `Sin proyección confiable: ${esc((e.forecast && e.forecast.basis) || 'datos insuficientes')}<br>`;
      m.bindPopup(
        (e.goes ? '<b>Detección GOES</b> (ubicación aprox. ±2 km)<br>' : '') +
        classification +
        `<b>Severidad ${CFmt.sev(e.severity || 'info').toLowerCase()}</b> · FRP ${e.frp_max} MW<br>` +
        `${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}<br>` +
        `${(e.sats || []).join(' + ')} · ${e.detections} lectura${e.detections === 1 ? '' : 's'} · ${CFmt.fecha(e.last_seen)}<br>` +
        `${e.zone_id || 'Fuera de las zonas de riesgo'}<br>` + forecastText +
        (e.confirmation ? `<a href="https://monitor_incendios.cnf.gob.mx/incendios_tarjeta_diaria" target="_blank" rel="noopener">Registro oficial CONAFOR</a>` : '')
      );
      m.addTo(evLayer);
      markerById[e.id] = m;
      // Alta y crítica se parecen en luminosidad: la crítica añade un segundo anillo (señal de forma)
      if (e.severity === 'critico') {
        L.circleMarker([e.lat, e.lon], {
          pane: 'eventos', interactive: false,
          radius: m.options.radius + 6, color: CFmt.SEV_COLOR.critico, weight: 2.5, fill: false,
        }).addTo(evLayer);
      }
    });
  }

  function focus(lat, lon) {
    if (!map) return;
    if (reduce()) map.setView([lat, lon], 12);
    else map.flyTo([lat, lon], 12, { duration: 0.6 });
  }

  function selectEvent(id) {
    const m = markerById[id];
    if (!m) return;
    focus(m.getLatLng().lat, m.getLatLng().lng);
    m.openPopup();
  }

  function selectZone(id) {
    if (!zonasLayer) return;
    zonasLayer.eachLayer(l => {
      if (l.feature && l.feature.properties.id === id) {
        map.fitBounds(l.getBounds(), { maxZoom: 12, padding: [40, 40] });
        l.openPopup();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.CApp) CApp.on(s => { render(s); });
  });
  // al cambiar de tema se cambia la base y se repintan los marcadores con su contorno
  document.addEventListener('centinela:tema', () => {
    if (!map) return;
    setBase();
    if (window.CApp && CApp.state.data) render(CApp.state);
  });

  return { init, setWms, setGoes, setScan, setLocalImage, setPoints, setEventsVisible, render, focus, selectEvent, selectZone, get map() { return map; } };
})();
