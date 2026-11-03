/* Demo estática: atiende las llamadas a api/*.php con los JSON exportados en data/.
   Sin servidor, solo las fechas incluidas en la demo; las acciones que escriben quedan cerradas. */
(() => {
  const nativa = window.fetch.bind(window);
  const json = (cuerpo, estado = 200) =>
    new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });
  const sinDatos = { error: 'Esa fecha no está incluida en la demo pública', offline: true };

  async function archivo(ruta, init, falla) {
    try {
      const r = await nativa(ruta, init);
      if (r.ok) return r;
    } catch { /* sin red */ }
    return json(falla, 503);
  }

  // si no se exportó justo esa ventana (días), se usa la más cercana disponible de esa fecha
  async function historia(fecha, dias, init) {
    for (const n of [dias, 1, 2, 3, 4, 5]) {
      try {
        const r = await nativa(`data/history/${fecha}_${n}.json`, init);
        if (r.ok) return r;
      } catch { /* sin red */ }
    }
    return json(sinDatos, 503);
  }

  window.fetch = (entrada, init) => {
    const url = typeof entrada === 'string' ? entrada : entrada.url;
    const m = /(?:^|\/)api\/([a-z]+)\.php(?:\?(.*))?$/.exec(url);
    if (!m) return nativa(entrada, init);
    const q = new URLSearchParams(m[2] || '');
    switch (m[1]) {
      case 'data': case 'trigger': return archivo('data/data.json', init, sinDatos);
      case 'coverage': return archivo('data/coverage.json', init, sinDatos);
      case 'goes': return archivo('data/goes.json', init, sinDatos);
      case 'live': return archivo('data/live.json', init, sinDatos);
      case 'history': return historia(q.get('date'), Number(q.get('days')) || 1, init);
      case 'calendar': return archivo(`data/calendar/${q.get('month')}.json`, init, sinDatos);
      case 'imagenes':
        if (q.get('action') === 'status') return archivo(`data/imagenes/status-${q.get('date')}.json`, init, sinDatos);
        return Promise.resolve(json({ error: 'No disponible en la demo pública' }, 403));
      default: return Promise.resolve(json({ error: 'No disponible en la demo pública' }, 403));
    }
  };
})();
