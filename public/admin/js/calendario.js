(async function init() {
  await initShell('calendario', 'Calendario');

  const hoy = new Date();
  document.getElementById('sel-anio').value = hoy.getFullYear();
  document.getElementById('sel-mes').value = String(hoy.getMonth() + 1);

  await cargarEquipos();
  document.getElementById('btn-ver').addEventListener('click', verCalendario);
  await verCalendario();
})();

async function cargarEquipos() {
  const res = await apiFetch('/api/equipos');
  const equipos = await res.json();
  const sel = document.getElementById('sel-equipo');
  sel.innerHTML = equipos.map((e) => `<option value="${e.id}">${e.nomenclatura} (${e.tipo_nombre})</option>`).join('');
}

async function verCalendario() {
  const equipoId = document.getElementById('sel-equipo').value;
  if (!equipoId) return;
  const anio = document.getElementById('sel-anio').value;
  const mes = document.getElementById('sel-mes').value;

  const res = await apiFetch(`/api/inspecciones/calendario/${equipoId}?anio=${anio}&mes=${mes}`);
  const data = await res.json();

  document.getElementById('stat-mes').textContent = data.inspecciones.length;
  document.getElementById('stat-total').textContent = data.total_inspecciones;
  document.getElementById('stat-observaciones').textContent = data.total_observaciones;

  // Agrupar inspecciones por dia
  const porDia = {};
  data.inspecciones.forEach((insp) => {
    const dia = new Date(insp.carpeta_fecha).getUTCDate();
    porDia[dia] = porDia[dia] || [];
    porDia[dia].push(insp);
  });

  const diasEnMes = new Date(anio, mes, 0).getDate();
  const primerDiaSemana = new Date(anio, mes - 1, 1).getDay(); // 0=domingo

  const cont = document.getElementById('calendario');
  cont.innerHTML = '';
  for (let i = 0; i < primerDiaSemana; i++) {
    const vacio = document.createElement('div');
    cont.appendChild(vacio);
  }
  for (let d = 1; d <= diasEnMes; d++) {
    const div = document.createElement('div');
    div.className = 'dia';
    div.textContent = d;
    const inspsDelDia = porDia[d];
    if (inspsDelDia && inspsDelDia.length > 0) {
      const tienePre = inspsDelDia.some((i) => i.tipo_checklist === 'preoperacional');
      const tieneMant = inspsDelDia.some((i) => i.tipo_checklist !== 'preoperacional');
      if (tienePre && tieneMant) div.classList.add('doble');
      else if (tienePre) div.classList.add('pre');
      else div.classList.add('mant');
      div.title = inspsDelDia.map((i) => `${i.checklist_nombre} (folio ${i.folio})`).join('\n');
    }
    cont.appendChild(div);
  }

  const tbody = document.getElementById('tabla-inspecciones');
  tbody.innerHTML = '';
  data.inspecciones.forEach((insp) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatearFecha(insp.carpeta_fecha)}</td>
      <td>${insp.folio}</td>
      <td>${insp.checklist_nombre}</td>
      <td>${insp.total_observados}</td>
    `;
    tbody.appendChild(tr);
  });
}
