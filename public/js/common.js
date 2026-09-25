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
