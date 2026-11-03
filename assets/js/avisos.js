/* Avisos animados: confirmaciones y errores de las acciones de la página.
   El mensaje sube con un pequeño rebote y su símbolo "salta" para que se note; sin movimiento
   si la persona pidió reducirlo. Se usa en el mapa y en la página de registro. */
window.CAviso = (() => {
  const ICONS = {
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="aviso__draw" d="M6.5 12.5l3.6 3.6 7.4-7.6" pathLength="24"/></svg>',
    err: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 6.5v7.2M12 17.4v.1"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 11v5.6M12 7.5v.1"/></svg>',
  };
  const LIFE = { ok: 5500, info: 5500, err: 9000 };
  const MAX = 3;
  let stack = null;

  function host() {
    if (stack) return stack;
    stack = document.createElement('div');
    stack.className = 'avisos';
    stack.setAttribute('role', 'region');
    stack.setAttribute('aria-label', 'Avisos');
    document.body.appendChild(stack);
    return stack;
  }

  function close(n) {
    if (!n.isConnected || n.classList.contains('is-out')) return;
    n.classList.add('is-out');
    setTimeout(() => n.remove(), 260);
  }

  /** Muestra un aviso. kind: 'ok' | 'err' | 'info'. Devuelve la función que lo cierra. */
  function show(kind, text, detail = '') {
    const root = host();
    while (root.children.length >= MAX) close(root.firstElementChild); // no se apilan más de 3
    const n = document.createElement('div');
    n.className = `aviso aviso--${kind}`;
    n.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    const ic = document.createElement('span');
    ic.className = 'aviso__icon';
    ic.innerHTML = ICONS[kind] || ICONS.info;
    const tx = document.createElement('span');
    tx.className = 'aviso__text';
    const b = document.createElement('b');
    b.textContent = text;
    tx.appendChild(b);
    if (detail) {
      const s = document.createElement('small');
      s.textContent = detail;
      tx.appendChild(s);
    }
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'aviso__x';
    x.setAttribute('aria-label', 'Cerrar aviso');
    x.textContent = '✕';
    n.append(ic, tx, x);
    root.appendChild(n);

    let timer;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => close(n), LIFE[kind] || 5500); };
    x.addEventListener('click', () => close(n));
    n.addEventListener('mouseenter', () => clearTimeout(timer)); // con el cursor encima no se va
    n.addEventListener('mouseleave', arm);
    n.addEventListener('focusin', () => clearTimeout(timer));
    n.addEventListener('focusout', arm);
    arm();
    return () => close(n);
  }

  /** Hace "saltar" un elemento (por ejemplo un botón al terminar su acción). */
  function jump(el) {
    if (!el) return;
    el.classList.remove('pop-jump');
    void el.offsetWidth; // reinicia la animación
    el.classList.add('pop-jump');
    el.addEventListener('animationend', () => el.classList.remove('pop-jump'), { once: true });
  }

  return {
    ok: (t, d) => show('ok', t, d),
    err: (t, d) => show('err', t, d),
    info: (t, d) => show('info', t, d),
    jump,
  };
})();
