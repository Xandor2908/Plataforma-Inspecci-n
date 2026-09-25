let checklistEditandoId = null;

(async function init() {
  const usuario = await requireSession('admin');
  if (!usuario) return;
  await cargarChecklists();
})();

async function cargarChecklists() {
  const res = await apiFetch('/api/checklists');
  const checklists = await res.json();
  const tbody = document.getElementById('tabla-checklists');
  tbody.innerHTML = '';
  checklists.forEach((c) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.codigo}</td>
      <td>${c.nombre}</td>
      <td>${c.activo ? 'Activo' : 'Inactivo'}</td>
      <td><button class="btn small secundario" data-id="${c.id}" data-nombre="${c.nombre}" data-action="items">Ítems</button></td>
      <td><button class="btn small ${c.activo ? 'rojo' : 'verde'}" data-id="${c.id}" data-action="toggle">${c.activo ? 'Desactivar' : 'Activar'}</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-action="items"]').forEach((btn) =>
    btn.addEventListener('click', () => abrirItems(btn.dataset.id, btn.dataset.nombre))
  );
  tbody.querySelectorAll('[data-action="toggle"]').forEach((btn) =>
    btn.addEventListener('click', () => toggleActivo(btn.dataset.id, btn.textContent.trim() === 'Desactivar'))
  );
}

async function toggleActivo(id, desactivar) {
  await apiFetch(`/api/checklists/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activo: !desactivar }),
  });
  await cargarChecklists();
}

async function abrirItems(id, nombre) {
  checklistEditandoId = id;
  const res = await apiFetch(`/api/checklists/${id}`);
  const detalle = await res.json();
  document.getElementById('items-titulo').textContent = `Ítems de: ${nombre}`;
  document.getElementById('items-textarea').value = detalle.items
    .map((it) => `${it.categoria} | ${it.descripcion}`)
    .join('\n');
  document.getElementById('items-error').textContent = '';
  document.getElementById('panel-items').style.display = 'block';
}

function parsearItems(texto) {
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [categoria, ...resto] = l.split('|');
      return { categoria: (categoria || '').trim(), descripcion: resto.join('|').trim() };
    })
    .filter((it) => it.categoria && it.descripcion);
}

document.getElementById('btn-guardar-items').addEventListener('click', async () => {
  const items = parsearItems(document.getElementById('items-textarea').value);
  const errorEl = document.getElementById('items-error');
  if (items.length === 0) { errorEl.textContent = 'Agrega al menos un ítem con formato Categoría | Descripción'; return; }
  const res = await apiFetch(`/api/checklists/${checklistEditandoId}/items`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) { errorEl.textContent = 'No se pudo guardar'; return; }
  errorEl.textContent = '';
  document.getElementById('panel-items').style.display = 'none';
});

document.getElementById('btn-crear-checklist').addEventListener('click', async () => {
  const codigo = document.getElementById('nuevo-codigo').value.trim();
  const nombre = document.getElementById('nuevo-nombre').value.trim();
  const orden = parseInt(document.getElementById('nuevo-orden').value, 10) || 0;
  const variantesTexto = document.getElementById('nuevo-variantes').value.trim();
  const itemsTexto = document.getElementById('nuevo-items').value.trim();
  const errorEl = document.getElementById('nuevo-error');
  errorEl.textContent = '';

  if (!codigo || !nombre || !variantesTexto) {
    errorEl.textContent = 'Código, nombre y al menos una variante de equipos son requeridos';
    return;
  }
  const equipos_variantes = variantesTexto
    .split('\n')
    .map((l) => l.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean))
    .filter((v) => v.length > 0);
  const items = parsearItems(itemsTexto);

  const res = await apiFetch('/api/checklists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo, nombre, orden, equipos_variantes, items }),
  });
  const data = await res.json();
  if (!res.ok) { errorEl.textContent = data.error || 'No se pudo crear el checklist'; return; }

  document.getElementById('nuevo-codigo').value = '';
  document.getElementById('nuevo-nombre').value = '';
  document.getElementById('nuevo-variantes').value = '';
  document.getElementById('nuevo-items').value = '';
  await cargarChecklists();
});
