let checklistsCache = [];
let editandoId = null; // null = nueva plantilla
let secciones = []; // [{ nombre, pasos: [string, ...] }]

(async function init() {
  const usuario = await requireSession('admin');
  if (!usuario) return;
  await cargarChecklists();

  document.getElementById('btn-nueva-plantilla').addEventListener('click', () => abrirEditor(null));
  document.getElementById('btn-volver').addEventListener('click', volverATarjetas);
  document.getElementById('btn-cancelar-plantilla').addEventListener('click', volverATarjetas);
  document.getElementById('btn-agregar-seccion').addEventListener('click', () => {
    secciones.push({ nombre: 'Nueva sección', pasos: [''] });
    renderSecciones();
  });
  document.getElementById('btn-guardar-plantilla').addEventListener('click', guardarPlantilla);
})();

function volverATarjetas() {
  document.getElementById('vista-editor').style.display = 'none';
  document.getElementById('vista-tarjetas').style.display = 'block';
}

async function cargarChecklists() {
  const res = await apiFetch('/api/checklists');
  checklistsCache = await res.json();
  const grid = document.getElementById('grid-checklists');
  grid.innerHTML = '';
  checklistsCache.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'checklist-card';
    div.innerHTML = `
      <div class="cc-top">
        <span class="cc-codigo">${c.codigo_corto || c.codigo}</span>
        <span class="pill ${c.activo ? 'pill-green' : 'pill-gray'}">${c.activo ? 'Activa' : 'Inactiva'}</span>
      </div>
      <div class="cc-nombre">${c.nombre}</div>
      <div class="cc-meta">${c.total_secciones} secciones · ${c.total_pasos} pasos · Frecuencia ${c.frecuencia}</div>
      <div class="cc-preview" data-preview="${c.id}">Cargando vista previa…</div>
      <div class="cc-botones">
        <button class="btn small" data-action="editar" data-id="${c.id}">Editar</button>
        <button class="btn small secundario" data-action="duplicar" data-id="${c.id}">Duplicar</button>
        <button class="btn small ${c.activo ? 'rojo' : 'verde'}" data-action="toggle" data-id="${c.id}" data-activo="${c.activo}">${c.activo ? 'Desactivar' : 'Activar'}</button>
      </div>
    `;
    grid.appendChild(div);
    cargarPreview(c.id);
  });

  grid.querySelectorAll('[data-action="editar"]').forEach((b) => b.addEventListener('click', () => abrirEditor(b.dataset.id)));
  grid.querySelectorAll('[data-action="duplicar"]').forEach((b) => b.addEventListener('click', () => duplicar(b.dataset.id)));
  grid.querySelectorAll('[data-action="toggle"]').forEach((b) =>
    b.addEventListener('click', () => toggleActivo(b.dataset.id, b.dataset.activo === 'true'))
  );
}

async function cargarPreview(id) {
  const res = await apiFetch(`/api/checklists/${id}`);
  const detalle = await res.json();
  const cats = [...new Set(detalle.items.map((i) => i.categoria))];
  const el = document.querySelector(`[data-preview="${id}"]`);
  if (!el) return;
  if (cats.length === 0) {
    el.textContent = 'Sin secciones todavía. Ábrela para empezar a construirla.';
  } else {
    const primeras = cats.slice(0, 3).map((c) => `· ${c}`).join('<br>');
    const resto = cats.length > 3 ? `<br>… y ${cats.length - 3} más` : '';
    el.innerHTML = primeras + resto;
  }
}

async function toggleActivo(id, activoActual) {
  await apiFetch(`/api/checklists/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activo: !activoActual }),
  });
  await cargarChecklists();
}

async function duplicar(id) {
  await apiFetch(`/api/checklists/${id}/duplicar`, { method: 'POST' });
  await cargarChecklists();
}

async function abrirEditor(id) {
  editandoId = id;
  document.getElementById('vista-tarjetas').style.display = 'none';
  document.getElementById('vista-editor').style.display = 'block';
  document.getElementById('ed-error').textContent = '';

  if (id) {
    const res = await apiFetch(`/api/checklists/${id}`);
    const detalle = await res.json();
    document.getElementById('ed-nombre').value = detalle.nombre;
    document.getElementById('ed-frecuencia').value = detalle.frecuencia;
    document.getElementById('ed-variantes').value = (detalle.equipos_variantes || []).map((v) => v.join(',')).join('\n');

    secciones = [];
    let actual = null;
    detalle.items.forEach((it) => {
      if (!actual || actual.nombre !== it.categoria) {
        actual = { nombre: it.categoria, pasos: [] };
        secciones.push(actual);
      }
      actual.pasos.push(it.descripcion);
    });
  } else {
    document.getElementById('ed-nombre').value = '';
    document.getElementById('ed-frecuencia').value = 'Diaria';
    document.getElementById('ed-variantes').value = '';
    secciones = [];
  }
  renderSecciones();
}

function renderSecciones() {
  const cont = document.getElementById('ed-secciones');
  cont.innerHTML = '';
  secciones.forEach((seccion, si) => {
    const div = document.createElement('div');
    div.className = 'plantilla-seccion';
    div.innerHTML = `
      <div class="ps-header">
        <input class="ps-nombre" value="${seccion.nombre.replace(/"/g, '&quot;')}" data-si="${si}">
        <div class="ps-acciones">
          <button data-accion="subir" data-si="${si}" title="Subir sección">↑</button>
          <button data-accion="bajar" data-si="${si}" title="Bajar sección">↓</button>
          <button data-accion="quitar-seccion" data-si="${si}" title="Quitar sección" style="color:var(--red)">✕ Quitar sección</button>
        </div>
      </div>
      <div class="ps-pasos"></div>
      <button class="btn-agregar-paso" data-accion="agregar-paso" data-si="${si}">+ Agregar paso</button>
    `;
    const pasosCont = div.querySelector('.ps-pasos');
    seccion.pasos.forEach((paso, pi) => {
      const fila = document.createElement('div');
      fila.className = 'plantilla-paso';
      fila.innerHTML = `
        <span class="pp-num">${pi + 1}.</span>
        <input value="${paso.replace(/"/g, '&quot;')}" data-si="${si}" data-pi="${pi}">
        <button data-accion="quitar-paso" data-si="${si}" data-pi="${pi}">✕</button>
      `;
      pasosCont.appendChild(fila);
    });
    cont.appendChild(div);
  });

  cont.querySelectorAll('.ps-nombre').forEach((input) =>
    input.addEventListener('input', (e) => { secciones[e.target.dataset.si].nombre = e.target.value; })
  );
  cont.querySelectorAll('.plantilla-paso input').forEach((input) =>
    input.addEventListener('input', (e) => { secciones[e.target.dataset.si].pasos[e.target.dataset.pi] = e.target.value; })
  );
  cont.querySelectorAll('[data-accion="quitar-paso"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      secciones[btn.dataset.si].pasos.splice(btn.dataset.pi, 1);
      renderSecciones();
    })
  );
  cont.querySelectorAll('[data-accion="agregar-paso"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      secciones[btn.dataset.si].pasos.push('');
      renderSecciones();
    })
  );
  cont.querySelectorAll('[data-accion="quitar-seccion"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      secciones.splice(btn.dataset.si, 1);
      renderSecciones();
    })
  );
  cont.querySelectorAll('[data-accion="subir"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.si);
      if (i === 0) return;
      [secciones[i - 1], secciones[i]] = [secciones[i], secciones[i - 1]];
      renderSecciones();
    })
  );
  cont.querySelectorAll('[data-accion="bajar"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.si);
      if (i === secciones.length - 1) return;
      [secciones[i + 1], secciones[i]] = [secciones[i], secciones[i + 1]];
      renderSecciones();
    })
  );
}

async function guardarPlantilla() {
  const errorEl = document.getElementById('ed-error');
  errorEl.textContent = '';

  const nombre = document.getElementById('ed-nombre').value.trim();
  const frecuencia = document.getElementById('ed-frecuencia').value;
  const variantesTexto = document.getElementById('ed-variantes').value.trim();

  if (!nombre) { errorEl.textContent = 'El nombre de la plantilla es requerido'; return; }
  if (!variantesTexto) { errorEl.textContent = 'Agrega al menos una variante de equipos'; return; }
  if (secciones.length === 0) { errorEl.textContent = 'Agrega al menos una sección'; return; }

  const equipos_variantes = variantesTexto
    .split('\n')
    .map((l) => l.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean))
    .filter((v) => v.length > 0);

  const items = [];
  secciones.forEach((s) => {
    s.pasos.filter((p) => p.trim()).forEach((p) => items.push({ categoria: s.nombre.trim(), descripcion: p.trim() }));
  });
  if (items.length === 0) { errorEl.textContent = 'Agrega al menos un paso'; return; }

  let id = editandoId;
  if (id) {
    const res = await apiFetch(`/api/checklists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, frecuencia, equipos_variantes }),
    });
    if (!res.ok) { errorEl.textContent = 'No se pudo guardar la plantilla'; return; }
  } else {
    const res = await apiFetch('/api/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, frecuencia, equipos_variantes, items: [] }),
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'No se pudo crear la plantilla'; return; }
    id = data.id;
  }

  const itemsRes = await apiFetch(`/api/checklists/${id}/items`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!itemsRes.ok) { errorEl.textContent = 'La plantilla se guardó pero hubo un error con los pasos'; return; }

  volverATarjetas();
  await cargarChecklists();
}
