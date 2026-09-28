(async function init() {
  await initShell('calendario', 'Calendario');

  const hoy = new Date();
  document.getElementById('sel-anio').value = hoy.getFullYear();
  document.getElementById('sel-mes').value = String(hoy.getMonth() + 1);

  await cargarEquipos();
  await cargarFiltrosChecklistYResponsable();
  document.getElementById('btn-ver').addEventListener('click', verCalendario);
  document.getElementById('filtro-fecha').addEventListener('change', verCalendario);
  document.getElementById('filtro-checklist').addEventListener('change', verCalendario);
  document.getElementById('filtro-responsable').addEventListener('change', verCalendario);
  document.getElementById('btn-limpiar-filtros').addEventListener('click', () => {
    document.getElementById('filtro-fecha').value = '';
    document.getElementById('filtro-checklist').value = '';
    document.getElementById('filtro-responsable').value = '';
    verCalendario();
  });
  document.getElementById('btn-confirmar-eliminar').addEventListener('click', confirmarEliminar);
  await verCalendario();
})();

async function cargarEquipos() {
  const res = await apiFetch('/api/equipos');
  const equipos = await res.json();
  const sel = document.getElementById('sel-equipo');
  sel.innerHTML = equipos.map((e) => `<option value="${e.id}">${e.nomenclatura} (${e.tipo_nombre})</option>`).join('');
}

async function cargarFiltrosChecklistYResponsable() {
  const [checklistsRes, usuariosRes] = await Promise.all([
    apiFetch('/api/checklists'),
    apiFetch('/api/usuarios'),
  ]);
  const checklists = await checklistsRes.json();
  const usuarios = await usuariosRes.json();
  document.getElementById('filtro-checklist').innerHTML =
    '<option value="">Todos</option>' + checklists.map((c) => `<option value="${c.id}">${c.codigo_corto} - ${c.nombre}</option>`).join('');
  document.getElementById('filtro-responsable').innerHTML =
    '<option value="">Todos</option>' + usuarios.map((u) => `<option value="${u.id}">${u.nombre}</option>`).join('');
}

let inspeccionAEliminar = null;

async function verCalendario() {
  const equipoId = document.getElementById('sel-equipo').value;
  if (!equipoId) return;
  const anio = document.getElementById('sel-anio').value;
  const mes = document.getElementById('sel-mes').value;
  const fecha = document.getElementById('filtro-fecha').value;
  const checklistId = document.getElementById('filtro-checklist').value;
  const responsableId = document.getElementById('filtro-responsable').value;

  const params = new URLSearchParams({ anio, mes });
  if (fecha) params.set('fecha', fecha);
  if (checklistId) params.set('checklist_tipo_id', checklistId);
  if (responsableId) params.set('operador_id', responsableId);

  const res = await apiFetch(`/api/inspecciones/calendario/${equipoId}?${params.toString()}`);
  const data = await res.json();

  document.getElementById('stat-mes').textContent = data.inspecciones.length;
  document.getElementById('stat-total').textContent = data.total_inspecciones;
  document.getElementById('stat-observaciones').textContent = data.total_observaciones;

  // Agrupar inspecciones por dia (para el calendario visual, siempre segun el mes, sin los filtros de tabla)
  const porDia = {};
  data.inspecciones.forEach((insp) => {
    const dia = new Date(insp.carpeta_fecha).getUTCDate();
    porDia[dia] = porDia[dia] || [];
    porDia[dia].push(insp);
  });

  const diasEnMes = new Date(anio, mes, 0).getDate();
  const primerDiaSemana = new Date(anio, mes - 1, 1).getDay();
  const hoyReal = new Date();
  const esMesActual = hoyReal.getFullYear() === Number(anio) && (hoyReal.getMonth() + 1) === Number(mes);

  const cont = document.getElementById('calendario');
  cont.innerHTML = '';
  for (let i = 0; i < primerDiaSemana; i++) cont.appendChild(document.createElement('div'));
  for (let d = 1; d <= diasEnMes; d++) {
    const div = document.createElement('div');
    div.className = 'dia';
    div.textContent = d;
    if (esMesActual && hoyReal.getDate() === d) div.classList.add('hoy');
    const inspsDelDia = porDia[d];
    if (inspsDelDia && inspsDelDia.length > 0) {
      const tienePre = inspsDelDia.some((i) => i.tipo_checklist === 'preoperacional');
      const tieneMant = inspsDelDia.some((i) => i.tipo_checklist !== 'preoperacional');
      if (tienePre && tieneMant) div.classList.add('doble');
      else if (tienePre) div.classList.add('pre');
      else div.classList.add('mant');
      div.title = inspsDelDia.map((i) => `${i.checklist_nombre} (folio ${i.folio})`).join('\n') + '\n\n(Clic para filtrar la tabla a este día)';
      div.classList.add('con-datos');
      const fechaDia = `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      div.addEventListener('click', () => {
        document.getElementById('filtro-fecha').value = fechaDia;
        verCalendario();
      });
    }
    cont.appendChild(div);
  }

  const tbody = document.getElementById('tabla-inspecciones');
  tbody.innerHTML = '';
  data.inspecciones.forEach((insp) => {
    const hora = new Date(insp.fecha_hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatearFecha(insp.carpeta_fecha)}</td>
      <td>${hora}</td>
      <td>${insp.folio}</td>
      <td>${insp.checklist_nombre}</td>
      <td>${insp.operador_nombre}</td>
      <td>${insp.total_observados}</td>
      <td style="white-space:nowrap">
        <a class="btn small secundario" href="/api/inspecciones/${insp.id}/reporte.pdf" target="_blank">Ver reporte</a>
        <button class="btn small secundario" data-action="imprimir-reporte" data-id="${insp.id}">Imprimir reporte</button>
        <button class="btn small rojo" data-id="${insp.id}" data-action="eliminar">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-action="eliminar"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      inspeccionAEliminar = btn.dataset.id;
      document.getElementById('clave-eliminar').value = '';
      document.getElementById('eliminar-error').textContent = '';
      document.getElementById('modal-eliminar').style.display = 'flex';
    })
  );
  tbody.querySelectorAll('[data-action="imprimir-reporte"]').forEach((btn) =>
    btn.addEventListener('click', () => imprimirReporte(btn.dataset.id))
  );
}

function imprimirReporte(inspeccionId) {
  // Carga el PDF en un iframe oculto y dispara la impresion del navegador
  // apenas termina de cargar, sin necesidad de abrir/descargar el archivo.
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = `/api/inspecciones/${inspeccionId}/reporte.pdf`;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      window.open(`/api/inspecciones/${inspeccionId}/reporte.pdf`, '_blank');
    }
    setTimeout(() => document.body.removeChild(iframe), 60000);
  };
}

async function confirmarEliminar() {
  const clave = document.getElementById('clave-eliminar').value;
  const errorEl = document.getElementById('eliminar-error');
  if (!clave) { errorEl.textContent = 'Ingresa la clave de confirmación'; return; }
  const res = await apiFetch(`/api/inspecciones/${inspeccionAEliminar}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave }),
  });
  const data = await res.json();
  if (!res.ok) { errorEl.textContent = data.error || 'No se pudo eliminar'; return; }
  document.getElementById('modal-eliminar').style.display = 'none';
  await verCalendario();
}
