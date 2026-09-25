let filtroActual = '';
let incidenciaActualId = null;

(async function init() {
  const usuario = await requireSession('admin');
  if (!usuario) return;
  await cargarIncidencias();

  document.querySelectorAll('[data-filtro]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filtroActual = btn.dataset.filtro;
      document.querySelectorAll('[data-filtro]').forEach((b) => b.classList.add('secundario'));
      btn.classList.remove('secundario');
      cargarIncidencias();
    });
  });
})();

async function cargarIncidencias() {
  const url = filtroActual ? `/api/incidencias?estado=${filtroActual}` : '/api/incidencias';
  const res = await apiFetch(url);
  const incidencias = await res.json();
  const tbody = document.getElementById('tabla-incidencias');
  tbody.innerHTML = '';
  incidencias.forEach((inc) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${inc.codigo}</td>
      <td>${inc.checklist_nombre}</td>
      <td>${inc.equipos || '-'}</td>
      <td>${inc.descripcion.slice(0, 60)}${inc.descripcion.length > 60 ? '…' : ''}</td>
      <td><span class="badge ${inc.estado}">${inc.estado}</span></td>
      <td><button class="btn small secundario" data-id="${inc.id}">Ver</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('button[data-id]').forEach((btn) =>
    btn.addEventListener('click', () => verDetalle(btn.dataset.id))
  );
}

async function verDetalle(id) {
  const res = await apiFetch(`/api/incidencias/${id}`);
  const inc = await res.json();
  incidenciaActualId = inc.id;

  document.getElementById('detalle-codigo').textContent = inc.codigo;
  document.getElementById('detalle-checklist').textContent = inc.checklist_nombre;
  document.getElementById('detalle-equipos').textContent = inc.equipos || '-';
  document.getElementById('detalle-folio').textContent = inc.folio;
  document.getElementById('detalle-descripcion').textContent = inc.descripcion;

  const foto = document.getElementById('detalle-foto');
  if (inc.foto_url) { foto.src = inc.foto_url; foto.style.display = 'block'; }
  else { foto.style.display = 'none'; }

  const formResolver = document.getElementById('detalle-form-resolver');
  const infoResuelta = document.getElementById('detalle-resuelta-info');
  const btnPendiente = document.getElementById('btn-marcar-pendiente');

  if (inc.estado === 'resuelta') {
    formResolver.style.display = 'none';
    infoResuelta.style.display = 'block';
    document.getElementById('detalle-solucion').textContent = inc.solucion_texto || '';
    btnPendiente.style.display = 'inline-block';
  } else {
    formResolver.style.display = 'block';
    infoResuelta.style.display = 'none';
    document.getElementById('detalle-solucion-input').value = '';
    btnPendiente.style.display = 'none';
  }

  document.getElementById('modal-detalle').style.display = 'flex';
}

document.getElementById('btn-marcar-resuelta').addEventListener('click', async () => {
  const solucion_texto = document.getElementById('detalle-solucion-input').value.trim();
  if (!solucion_texto) { alert('Describe cómo se solucionó la incidencia'); return; }
  await apiFetch(`/api/incidencias/${incidenciaActualId}/resolver`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ solucion_texto }),
  });
  document.getElementById('modal-detalle').style.display = 'none';
  await cargarIncidencias();
});

document.getElementById('btn-marcar-pendiente').addEventListener('click', async () => {
  await apiFetch(`/api/incidencias/${incidenciaActualId}/pendiente`, { method: 'PATCH' });
  document.getElementById('modal-detalle').style.display = 'none';
  await cargarIncidencias();
});
