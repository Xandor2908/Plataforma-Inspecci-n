let usuarioEditandoId = null;

(async function init() {
  const usuario = await requireSession('admin');
  if (!usuario) return;
  await cargarUsuarios();

  document.getElementById('btn-restablecer').addEventListener('click', () => {
    document.getElementById('r-password').value = '';
    document.getElementById('restablecer-error').textContent = '';
    document.getElementById('modal-restablecer').style.display = 'flex';
  });
  document.getElementById('btn-generar-password').addEventListener('click', () => {
    document.getElementById('r-password').value = generarPasswordAleatoria();
  });
  document.getElementById('btn-confirmar-restablecer').addEventListener('click', confirmarRestablecer);
})();

function generarPasswordAleatoria() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function cargarUsuarios() {
  const res = await apiFetch('/api/usuarios');
  const usuarios = await res.json();
  const tbody = document.getElementById('tabla-usuarios');
  tbody.innerHTML = '';
  usuarios.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.nombre}</td>
      <td>${u.usuario}</td>
      <td>${u.rol === 'admin' ? 'Admin' : 'No admin'}</td>
      <td><span class="pill ${u.activo ? 'pill-green' : 'pill-gray'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td style="white-space:nowrap">
        <button class="btn small" data-action="editar" data-id="${u.id}">Editar</button>
        <button class="btn small ${u.activo ? 'rojo' : 'verde'}" data-action="toggle" data-id="${u.id}" data-activo="${u.activo}">${u.activo ? 'Desactivar' : 'Activar'}</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-action="editar"]').forEach((btn) =>
    btn.addEventListener('click', () => abrirEdicion(usuarios.find((u) => String(u.id) === btn.dataset.id)))
  );
  tbody.querySelectorAll('[data-action="toggle"]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await apiFetch(`/api/usuarios/${btn.dataset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: btn.dataset.activo !== 'true' }),
      });
      await cargarUsuarios();
    })
  );
}

function abrirEdicion(usuario) {
  usuarioEditandoId = usuario.id;
  document.getElementById('e-nombre').value = usuario.nombre;
  document.getElementById('e-rol').value = usuario.rol;
  document.getElementById('editar-error').textContent = '';
  document.getElementById('modal-editar').style.display = 'flex';
}

document.getElementById('btn-guardar-usuario').addEventListener('click', async () => {
  const nombre = document.getElementById('e-nombre').value.trim();
  const rol = document.getElementById('e-rol').value;
  const errorEl = document.getElementById('editar-error');
  errorEl.textContent = '';
  const res = await apiFetch(`/api/usuarios/${usuarioEditandoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, rol }),
  });
  if (!res.ok) { errorEl.textContent = 'No se pudo guardar'; return; }
  document.getElementById('modal-editar').style.display = 'none';
  await cargarUsuarios();
});

async function confirmarRestablecer() {
  const password = document.getElementById('r-password').value;
  const errorEl = document.getElementById('restablecer-error');
  if (!password || password.length < 6) {
    errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
    return;
  }
  const res = await apiFetch(`/api/usuarios/${usuarioEditandoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) { errorEl.textContent = 'No se pudo restablecer la contraseña'; return; }
  document.getElementById('modal-restablecer').style.display = 'none';
  document.getElementById('modal-editar').style.display = 'none';
  alert(`Nueva contraseña asignada: ${password}\n\nAnótala ahora, no se volverá a mostrar.`);
}

document.getElementById('btn-crear-usuario').addEventListener('click', async () => {
  const nombre = document.getElementById('nuevo-nombre-usuario').value.trim();
  const usuario = document.getElementById('nuevo-usuario-login').value.trim();
  const password = document.getElementById('nuevo-usuario-password').value;
  const rol = document.getElementById('nuevo-usuario-rol').value;
  const errorEl = document.getElementById('usuario-error');
  errorEl.textContent = '';

  const res = await apiFetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, usuario, password, rol }),
  });
  const data = await res.json();
  if (!res.ok) { errorEl.textContent = data.error || 'No se pudo crear el usuario'; return; }

  document.getElementById('nuevo-nombre-usuario').value = '';
  document.getElementById('nuevo-usuario-login').value = '';
  document.getElementById('nuevo-usuario-password').value = '';
  await cargarUsuarios();
});
