/* Panel de alertas, tarjeta de selección, banner + sonido + notificación del navegador. */
window.CAlerts = (() => {
  const $ = s => document.querySelector(s);
  let interacted = false;
  document.addEventListener('pointerdown', () => { interacted = true; }, { once: true });
  document.addEventListener('keydown', () => { interacted = true; }, { once: true });

  function render(state) {
    const d = state.data;
    if (!d) return;

    const alerts = d.alerts.slice().sort((a, b) =>
      CFmt.SEV_RANK[b.severity] - CFmt.SEV_RANK[a.severity] || b.last_activity - a.last_activity);
    const activas = alerts.filter(a => ['nueva', 'activa'].includes(a.status));

    $('#count-alertas').textContent = activas.length;
    const cp = $('#count-panel');
    if (cp) cp.textContent = activas.length;
    $('#alertas-meta').textContent = state.date
      ? 'Alertas reconstruidas para la fecha elegida'
      : d.meta.offline
      ? 'Sin internet · datos del ' + CFmt.fecha(d.meta.fetched_at)
      : d.meta.stale
      ? 'Datos con retraso'
      : (d.meta.fetched_at ? 'Actualizado a las ' + CFmt.hora(d.meta.fetched_at) : '');

    const list = $('#alertas-list');
    if (!alerts.length) {
      list.innerHTML = '<div class="empty"><strong>Todo en calma por ahora</strong>No hay alertas en este momento. Cuando un satélite detecte un foco en una zona de riesgo, aparecerá aquí.</div>';
    } else {
      list.innerHTML = alerts.map(a => {
        const [name, sub] = splitName(a.zone_name);
        return `
        <div class="alert alert--${a.severity}" data-id="${a.id}" data-lat="${a.centroid[0]}" data-lon="${a.centroid[1]}" tabindex="0" role="button" aria-label="${esc(a.zone_name)}, severidad ${CFmt.sev(a.severity).toLowerCase()}. Ver en el mapa">
          <span class="alert__glyph" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 3c1.6 3 4.5 4.7 4.5 8.3A4.5 4.5 0 0112 16a4.5 4.5 0 01-4.5-4.7c0-2.3 1.7-3.6 2.5-5.8.4 1.5 1.1 2.3 2 3C12.4 6.8 11.6 5 12 3zM8 20h8"/></svg></span>
          <span class="alert__main">
            <span class="alert__id" title="${esc(a.zone_name)}">${esc(name)}</span>
            ${sub ? `<span class="alert__sub">${esc(sub)}</span>` : ''}
            <span class="alert__meta">
              <span class="badge badge--${a.severity}">${CFmt.SEV_ICON[a.severity] || ''}<span>${CFmt.sev(a.severity)}</span></span>
              <span>${a.status === 'activa' ? '' : CFmt.status(a.status) + ' · '}${a.events_24h} focos · ${state.date ? CFmt.fecha(a.last_activity) : CFmt.hace(a.last_activity)}</span>
            </span>
          </span>
          <span class="alert__mw" title="Energía máxima (FRP)"><b>${a.frp_max}</b><small>MW</small></span>
        </div>`;
      }).join('');
      list.querySelectorAll('.alert').forEach(el => {
        const go = () => {
          CMap.focus(Number(el.dataset.lat), Number(el.dataset.lon));
          fillCard(alerts.find(a => a.id === el.dataset.id));
          list.querySelectorAll('.alert').forEach(x => x.classList.toggle('is-selected', x === el));
        };
        el.addEventListener('click', go);
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
        });
      });
    }

    // una consulta por fecha no es una alerta nueva: sin banner, sonido ni notificación
    if (state.date) { $('#abanner').hidden = true; return; }
    handleNew(activas, state);
  }

  /** "Tierra Caliente (Cd. Altamirano - …)" o "Costa Grande: Tecpan - …" → nombre corto y detalle. */
  function splitName(n) {
    const m = /^(.*?)\s*\((.*)\)\s*$/.exec(n) || /^([^:]+):\s*(.+)$/.exec(n);
    return m ? [m[1], m[2]] : [n, ''];
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function fillCard(a) {
    if (!a) return;
    const c = $('#selcard');
    c.hidden = false;
    c.innerHTML = `<div class="selcard__kicker">Alerta ${CFmt.status(a.status).toLowerCase()}</div>
      <div class="selcard__title">${esc(a.zone_name)}</div>
      <dl class="selcard__grid">
        <dt>Severidad</dt><dd>${CFmt.sev(a.severity)}</dd>
        <dt>Focos en 24 h</dt><dd>${a.events_24h}</dd>
        <dt>Energía máx. (FRP)</dt><dd>${a.frp_max} MW</dd>
        <dt>Centro</dt><dd>${a.centroid[0].toFixed(3)}, ${a.centroid[1].toFixed(3)}</dd>
        <dt>Abierta desde</dt><dd>${CFmt.fecha(a.opened_at)}</dd>
      </dl>`;
  }

  function handleNew(activas, state) {
    const nuevas = activas.filter(a =>
      ['alto', 'critico'].includes(a.severity) && state.seen[a.id] !== a.severity);
    const banner = $('#abanner');
    if (!nuevas.length) return;

    const top = nuevas.slice().sort((a, b) => CFmt.SEV_RANK[b.severity] - CFmt.SEV_RANK[a.severity])[0];
    $('#abanner-txt').textContent = `Alerta ${CFmt.sev(top.severity).toLowerCase()} · ${top.zone_name}`;
    banner.hidden = false;
    $('#abanner-go').onclick = () => {
      CMap.focus(top.centroid[0], top.centroid[1]);
      fillCard(top);
      banner.hidden = true;
    };
    $('#abanner-x').onclick = () => { banner.hidden = true; };

    if (interacted) {
      const snd = $('#alert-sound');
      if (snd) { snd.currentTime = 0; snd.play().catch(() => {}); }
    }
    if (window.Notification && Notification.permission === 'granted') {
      nuevas.forEach(a => new Notification('Centinela · alerta ' + CFmt.sev(a.severity).toLowerCase(), {
        body: `${a.zone_name} · energía del fuego ${a.frp_max} MW`,
      }));
    }
    nuevas.forEach(a => CApp.markSeen(a.id, a.severity));
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.CApp) CApp.on(render);
    const ask = $('#notif-ask');
    if (ask && window.Notification) {
      ask.hidden = Notification.permission !== 'default';
      ask.addEventListener('click', () =>
        Notification.requestPermission().then(p => {
          ask.hidden = true;
          if (p === 'granted') CAviso.ok('Avisos del navegador activados', 'Te notificaremos cuando haya una alerta nueva.');
          else CAviso.info('Avisos del navegador desactivados', 'Puedes activarlos más tarde desde los permisos del sitio.');
        }));
    }
  });

  return { render };
})();
