let equipoEditandoId = null;
let ultimaNomenclaturaQr = '';

(async function init() {
  await initShell('equipos', 'Equipos');
  await cargarTipos();
  await cargarSugerencias();
  await cargarEquipos();

  ['filtro-tipo', 'filtro-marca', 'filtro-modelo', 'filtro-ubicacion', 'filtro-estado'].forEach((id) =>
    document.getElementById(id).addEventListener('change', cargarEquipos)
  );
  document.getElementById('btn-imprimir-qr').addEventListener('click', imprimirQr);
})();

async function cargarTipos() {
  const res = await apiFetch('/api/equipos/tipos');
  const tipos = await res.json();
  document.getElementById('f-tipo').innerHTML = tipos.map((t) => `<option value="${t.codigo}">${t.codigo} - ${t.nombre}</option>`).join('');
  const filtroTipo = document.getElementById('filtro-tipo');
  filtroTipo.innerHTML = '<option value="">Todos</option>' + tipos.map((t) => `<option value="${t.codigo}">${t.nombre}</option>`).join('');
}

async function cargarSugerencias() {
  for (const campo of ['marca', 'modelo', 'ubicacion']) {
    const res = await apiFetch(`/api/equipos/sugerencias/${campo}`);
    const valores = await res.json();
    const datalist = document.getElementById(`lista-${campo === 'ubicacion' ? 'ubicaciones' : campo + 's'}`);
    datalist.innerHTML = valores.map((v) => `<option value="${v}">`).join('');
    const filtroId = campo === 'ubicacion' ? 'filtro-ubicacion' : `filtro-${campo}`;
    const filtroSel = document.getElementById(filtroId);
    const actual = filtroSel.value;
    filtroSel.innerHTML = `<option value="">Todas</option>` + valores.map((v) => `<option value="${v}">${v}</option>`).join('');
    filtroSel.value = actual;
  }
}

function pillEstado(estado) {
  const map = {
    activo: ['pill-green', 'Activo'],
    mantenimiento: ['pill-amber', 'En mantenimiento'],
    baja: ['pill-gray', 'De baja'],
  };
  const [clase, texto] = map[estado] || ['pill-gray', estado];
  return `<span class="pill ${clase}">${texto}</span>`;
}

function filtrosActuales() {
  const params = new URLSearchParams();
  const mapa = { tipo: 'filtro-tipo', marca: 'filtro-marca', modelo: 'filtro-modelo', ubicacion: 'filtro-ubicacion', estado: 'filtro-estado' };
  for (const [clave, id] of Object.entries(mapa)) {
    const v = document.getElementById(id).value;
    if (v) params.set(clave, v);
  }
  return params;
}

function actualizarLinksExportar() {
  const qs = filtrosActuales().toString();
  document.getElementById('link-excel').href = `/api/equipos/exportar/excel${qs ? '?' + qs : ''}`;
  document.getElementById('link-pdf').href = `/api/equipos/exportar/pdf${qs ? '?' + qs : ''}`;
}

async function cargarEquipos() {
  const qs = filtrosActuales().toString();
  const res = await apiFetch(`/api/equipos${qs ? '?' + qs : ''}`);
  const equipos = await res.json();
  actualizarLinksExportar();

  const tbody = document.getElementById('tabla-equipos');
  tbody.innerHTML = '';
  equipos.forEach((e) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e.nomenclatura}</td>
      <td>${e.tipo_nombre}</td>
      <td>${e.marca || '-'}</td>
      <td>${e.modelo || '-'}</td>
      <td>${e.n_serie || '-'}</td>
      <td>${e.ubicacion || '-'}</td>
      <td>${pillEstado(e.estado)}</td>
      <td style="white-space:nowrap">
        <button class="btn small secundario" data-action="qr" data-id="${e.id}">QR</button>
        <button class="btn small" data-action="editar" data-id="${e.id}">Editar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-action="qr"]').forEach((btn) => btn.addEventListener('click', () => verQr(btn.dataset.id)));
  tbody.querySelectorAll('[data-action="editar"]').forEach((btn) =>
    btn.addEventListener('click', () => abrirEdicion(equipos.find((e) => String(e.id) === btn.dataset.id)))
  );
}

async function verQr(id) {
  const res = await apiFetch(`/api/equipos/${id}/qr`);
  const data = await res.json();
  ultimaNomenclaturaQr = data.nomenclatura;
  document.getElementById('qr-modal-titulo').textContent = data.nomenclatura;
  document.getElementById('qr-modal-img').src = data.qr;
  document.getElementById('modal-qr').style.display = 'flex';
}

function imprimirQr() {
  const img = document.getElementById('qr-modal-img').src;
  const ventana = window.open('', '_blank', 'width=400,height=500');
  ventana.document.write(`
    <html><head><title>QR ${ultimaNomenclaturaQr}</title>
    <style>body{font-family:sans-serif;text-align:center;padding-top:40px}img{width:280px;height:280px}h2{margin-bottom:20px}</style>
    </head><body>
    <h2>${ultimaNomenclaturaQr}</h2>
    <img src="${img}">
    <script>window.onload = () => { window.print(); }<\/script>
    </body></html>
  `);
  ventana.document.close();
}

function abrirEdicion(equipo) {
  equipoEditandoId = equipo.id;
  document.getElementById('editar-nomenclatura').textContent = `(${equipo.nomenclatura})`;
  document.getElementById('e-marca').value = equipo.marca || '';
  document.getElementById('e-modelo').value = equipo.modelo || '';
  document.getElementById('e-serie').value = equipo.n_serie || '';
  document.getElementById('e-fecha').value = equipo.fecha_ingreso ? equipo.fecha_ingreso.slice(0, 10) : '';
  document.getElementById('e-ubicacion').value = equipo.ubicacion || '';
  document.getElementById('e-estado').value = equipo.estado;
  document.getElementById('editar-error').textContent = '';
  document.getElementById('modal-editar').style.display = 'flex';
}

document.getElementById('btn-guardar-edicion').addEventListener('click', async () => {
  const body = {
    marca: document.getElementById('e-marca').value.trim() || null,
    modelo: document.getElementById('e-modelo').value.trim() || null,
    n_serie: document.getElementById('e-serie').value.trim() || null,
    fecha_ingreso: document.getElementById('e-fecha').value || null,
    ubicacion: document.getElementById('e-ubicacion').value.trim() || null,
    estado: document.getElementById('e-estado').value,
  };
  const res = await apiFetch(`/api/equipos/${equipoEditandoId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json();
    document.getElementById('editar-error').textContent = data.error || 'No se pudo guardar';
    return;
  }
  document.getElementById('modal-editar').style.display = 'none';
  await cargarSugerencias();
  await cargarEquipos();
});

document.getElementById('btn-crear').addEventListener('click', async () => {
  const body = {
    tipo_codigo: document.getElementById('f-tipo').value,
    marca: document.getElementById('f-marca').value.trim() || null,
    modelo: document.getElementById('f-modelo').value.trim() || null,
    n_serie: document.getElementById('f-serie').value.trim() || null,
    fecha_ingreso: document.getElementById('f-fecha').value || null,
    ubicacion: document.getElementById('f-ubicacion').value.trim() || null,
  };
  const errorEl = document.getElementById('crear-error');
  errorEl.textContent = '';
  const res = await apiFetch('/api/equipos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) { errorEl.textContent = data.error || 'Error al crear equipo'; return; }

  document.getElementById('f-marca').value = '';
  document.getElementById('f-modelo').value = '';
  document.getElementById('f-serie').value = '';
  document.getElementById('f-fecha').value = '';
  document.getElementById('f-ubicacion').value = '';
  await cargarSugerencias();
  await cargarEquipos();
});
