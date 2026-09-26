async function apiFetch(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (res.status === 401) {
    window.location.href = '/index.html';
    throw new Error('No autenticado');
  }
  return res;
}

async function requireSession(rolEsperado) {
  const res = await apiFetch('/api/auth/me');
  if (!res.ok) { window.location.href = '/index.html'; return null; }
  const data = await res.json();
  if (rolEsperado && data.usuario.rol !== rolEsperado) {
    window.location.href = data.usuario.rol === 'admin' ? '/admin/dashboard.html' : '/seleccionar.html';
    return null;
  }
  const nombreEl = document.getElementById('nombre-usuario');
  if (nombreEl) nombreEl.textContent = data.usuario.nombre;
  return data.usuario;
}

async function cerrarSesion() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/index.html';
}

function formatearFecha(fechaISO) {
  const d = new Date(fechaISO);
  return d.toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const ICONO_ESTABLO = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/><circle cx="12" cy="12" r="2.6" fill="white" stroke="none"/></svg>`;

const SB_ITEMS = [
  { id: 'inicio', href: 'dashboard.html', label: 'Inicio', icon: '🏠' },
  { id: 'equipos', href: 'equipos.html', label: 'Equipos', icon: '📦' },
  { id: 'checklists', href: 'checklists.html', label: 'Checklists', icon: '📋' },
  { id: 'incidencias', href: 'incidencias.html', label: 'Incidencias', icon: '⚠️', badge: 'incidencias' },
  { id: 'calendario', href: 'calendario.html', label: 'Calendario', icon: '📅' },
  { id: 'usuarios', href: 'usuarios.html', label: 'Usuarios', icon: '👤' },
];

/**
 * Construye el shell (sidebar + franja superior) de la plataforma maestra alrededor
 * del contenido que ya esté en el DOM bajo el id "page-content".
 * @param {string} activo - id de SB_ITEMS que debe marcarse activo
 * @param {string} crumbTitle - texto a mostrar en el breadcrumb superior
 */
async function initShell(activo, crumbTitle) {
  const usuario = await requireSession('admin');
  if (!usuario) return;

  const pageContent = document.getElementById('page-content');
  const navHtml = SB_ITEMS.map((item) => `
    <a href="${item.href}" class="${item.id === activo ? 'activo' : ''}">
      <span class="sb-label"><span>${item.icon}</span><span>${item.label}</span></span>
      ${item.badge ? `<span class="sb-count" id="sb-count-${item.badge}" style="display:none">0</span>` : ''}
    </a>
  `).join('');

  const shell = document.createElement('div');
  shell.className = 'app-shell';
  shell.innerHTML = `
    <aside class="app-sidebar">
      <div class="sb-logo">
        <div class="sb-icon">${ICONO_ESTABLO}</div>
        <div>
          <div class="sb-title">ESTABLO</div>
          <div class="sb-subtitle">Gestión de Mantenimiento</div>
        </div>
      </div>
      <nav class="sb-nav">${navHtml}</nav>
    </aside>
    <div class="app-main">
      <div class="app-topstrip">
        <div class="crumbs">ESTABLO / <b>${crumbTitle}</b></div>
        <div class="ts-right">
          <div class="ts-user"><div class="nombre" id="nombre-usuario"></div><div class="rol">Administrador</div></div>
          <button class="salir" onclick="cerrarSesion()">Salir</button>
        </div>
      </div>
      <div class="app-main-content"></div>
    </div>
  `;

  document.body.insertBefore(shell, pageContent);
  shell.querySelector('.app-main-content').appendChild(pageContent);
  pageContent.style.display = 'block';
  document.getElementById('nombre-usuario').textContent = usuario.nombre;

  try {
    const res = await apiFetch('/api/dashboard/resumen');
    const r = await res.json();
    const badge = document.getElementById('sb-count-incidencias');
    if (badge && r.incidencias_pendientes > 0) {
      badge.textContent = r.incidencias_pendientes;
      badge.style.display = 'inline-block';
    }
  } catch (e) { /* si falla, simplemente no se muestra el contador */ }
}
