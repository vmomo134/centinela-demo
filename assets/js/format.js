/* Helpers de formato es-MX, etiquetas legibles y constantes de color compartidas. */
window.CFmt = (() => {
  const nf = new Intl.NumberFormat('es-MX');
  const TZ = 'America/Mexico_City';

  // Etiquetas para personas: los valores internos (critico, alto…) no se muestran tal cual.
  const SEV_LABEL = { info: 'Informativa', medio: 'Media', alto: 'Alta', critico: 'Crítica' };
  const EST_LABEL = { normal: 'Normal', vigilancia: 'Vigilancia', activo: 'Activo', critico: 'Crítico' };
  const STATUS_LABEL = { nueva: 'Nueva', activa: 'Activa', controlada: 'Controlada', archivada: 'Archivada' };

  // Cada severidad lleva una forma distinta además del color (no depender solo del tono).
  const SEV_ICON = {
    info: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.2 7h1.6v4.5H7.2V7zm0-2.5h1.6v1.4H7.2V4.5z"/></svg>',
    medio: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2l6.5 11.5h-13L8 2zm-.8 4.5v3.3h1.6V6.5H7.2zm0 4.3v1.4h1.6v-1.4H7.2z" fill-rule="evenodd"/></svg>',
    alto: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.2c.9 2 3.2 3.2 3.2 5.9 0 1-.4 1.7-1 2.2.1-1.2-.5-2-1.2-2.6-.1 1.3-.7 1.9-1.4 2.4C6.5 8.2 6.6 7 6.2 5.6 5 6.9 4.3 8 4.3 9.6c0 2.6 1.6 4.8 3.7 4.8s3.7-2.2 3.7-4.8C11.7 5.6 8.9 4.5 8 1.2z"/></svg>',
    critico: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5.3 1.5h5.4l3.8 3.8v5.4l-3.8 3.8H5.3L1.5 10.7V5.3l3.8-3.8zm2.4 3.2v4h1.6v-4H7.7zm0 5.2v1.5h1.6V9.9H7.7z" fill-rule="evenodd"/></svg>',
  };

  // objeto cuyas propiedades se resuelven al leerlas (el tema puede cambiar entre lecturas)
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const colorMap = defs => {
    const o = {};
    Object.keys(defs).forEach(k => Object.defineProperty(o, k, { get: () => cssVar(defs[k]), enumerable: true }));
    return o;
  };

  const themeIsDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

  return {
    num: n => nf.format(Math.round(Number(n) || 0)),

    fecha: e => new Date(e * 1000).toLocaleString('es-MX', {
      timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }),

    hora: e => new Date(e * 1000).toLocaleTimeString('es-MX', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit',
    }),

    hace: e => {
      const s = Math.max(0, Date.now() / 1000 - e);
      if (s < 90) return 'hace instantes';
      if (s < 5400) return `hace ${Math.round(s / 60)} min`;
      if (s < 172800) return `hace ${Math.round(s / 3600)} h`;
      return `hace ${Math.round(s / 86400)} d`;
    },

    SEV_LABEL, EST_LABEL, STATUS_LABEL, SEV_ICON,
    sev: s => SEV_LABEL[s] || s,
    est: s => EST_LABEL[s] || s,
    status: s => STATUS_LABEL[s] || s,

    // Colores para Leaflet (no admite variables CSS): se leen de las variables --risk-* de centinela.css,
    // así hay una sola fuente de verdad y siguen al tema claro/oscuro.
    SEV_COLOR: colorMap({ info: '--risk-low', medio: '--risk-moderate', alto: '--risk-high', critico: '--risk-critical' }),
    EST_COLOR: colorMap({ normal: '--risk-low', vigilancia: '--risk-moderate', activo: '--risk-high', critico: '--risk-critical' }),
    SEV_RANK: { info: 0, medio: 1, alto: 2, critico: 3 },

    // Contorno de marcadores: oscuro sobre mapa claro, claro sobre mapa oscuro (contraste ≥ 3:1 con el fondo)
    markerRim: () => (themeIsDark() ? cssVar('--teal-50') : cssVar('--teal-950')),
    themeIsDark,
  };
})();
