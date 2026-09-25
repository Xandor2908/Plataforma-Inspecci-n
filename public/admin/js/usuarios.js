(async function init() {
  const usuario = await requireSession('admin');
  if (!usuario) return;
  await cargarUsuarios();
})();

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
      <td>${u.activo ? 'Activo' : 'Inactivo'}</td>
      <td><button class="btn small ${u.activo ? 'rojo' : 'verde'}" data-id="${u.id}" data-activo="${u.activo}">${u.activo ? 'Desactivar' : 'Activar'}</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('button[data-id]').forEach((btn) =>
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
