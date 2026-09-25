(async function init() {
  const usuario = await requireSession('admin');
  if (!usuario) return;
  await cargarTipos();
  await cargarEquipos();
})();

async function cargarTipos() {
  const res = await apiFetch('/api/equipos/tipos');
  const tipos = await res.json();
  const sel = document.getElementById('sel-tipo');
  sel.innerHTML = tipos.map((t) => `<option value="${t.codigo}">${t.codigo} - ${t.nombre}</option>`).join('');
}

async function cargarEquipos() {
  const res = await apiFetch('/api/equipos');
  const equipos = await res.json();
  const tbody = document.getElementById('tabla-equipos');
  tbody.innerHTML = '';
  equipos.forEach((e) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e.nomenclatura}</td>
      <td>${e.tipo_nombre}</td>
      <td>${e.nombre || '-'}</td>
      <td>${e.activo ? 'Activo' : 'Inactivo'}</td>
      <td><button class="btn small secundario" data-id="${e.id}" data-action="qr">Ver QR</button></td>
      <td><button class="btn small ${e.activo ? 'rojo' : 'verde'}" data-id="${e.id}" data-action="toggle">${e.activo ? 'Desactivar' : 'Activar'}</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-action="qr"]').forEach((btn) =>
    btn.addEventListener('click', () => verQr(btn.dataset.id))
  );
  tbody.querySelectorAll('[data-action="toggle"]').forEach((btn) =>
    btn.addEventListener('click', () => toggleActivo(btn.dataset.id, btn.textContent.trim() === 'Desactivar'))
  );
}

async function verQr(id) {
  const res = await apiFetch(`/api/equipos/${id}/qr`);
  const data = await res.json();
  document.getElementById('qr-modal-titulo').textContent = data.nomenclatura;
  document.getElementById('qr-modal-img').src = data.qr;
  document.getElementById('modal-qr').style.display = 'flex';
}

async function toggleActivo(id, desactivar) {
  if (desactivar) {
    await apiFetch(`/api/equipos/${id}`, { method: 'DELETE' });
  } else {
    await apiFetch(`/api/equipos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: true }),
    });
  }
  await cargarEquipos();
}

document.getElementById('btn-crear').addEventListener('click', async () => {
  const tipo_codigo = document.getElementById('sel-tipo').value;
  const nomenclatura = document.getElementById('input-nom').value.trim().toUpperCase();
  const nombre = document.getElementById('input-nombre').value.trim();
  const errorEl = document.getElementById('crear-error');
  errorEl.textContent = '';
  const res = await apiFetch('/api/equipos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo_codigo, nomenclatura: nomenclatura || undefined, nombre: nombre || undefined }),
  });
  const data = await res.json();
  if (!res.ok) { errorEl.textContent = data.error || 'Error al crear equipo'; return; }
  document.getElementById('input-nom').value = '';
  document.getElementById('input-nombre').value = '';
  await cargarEquipos();
});
