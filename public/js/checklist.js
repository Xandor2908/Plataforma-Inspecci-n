let estado = null; // { checklistTipoId, checklistNombre, equipos }
let checklistDetalle = null; // { items: [...] }
const respuestas = {}; // itemId -> { resultado, observacion_texto, foto: File|null }

(async function init() {
  const usuario = await requireSession('operador');
  if (!usuario) return;

  const raw = sessionStorage.getItem('establo_checklist');
  if (!raw) { window.location.href = '/seleccionar.html'; return; }
  estado = JSON.parse(raw);

  document.getElementById('checklist-titulo').textContent = estado.checklistNombre;
  document.getElementById('equipos-resumen').textContent =
    'Equipos: ' + estado.equipos.map((e) => e.nomenclatura).join(', ');

  const res = await apiFetch(`/api/checklists/${estado.checklistTipoId}`);
  checklistDetalle = await res.json();
  renderItems();
})();

function renderItems() {
  const cont = document.getElementById('items-container');
  cont.innerHTML = '';
  let categoriaActual = null;
  checklistDetalle.items.forEach((item) => {
    if (item.categoria !== categoriaActual) {
      categoriaActual = item.categoria;
      const h = document.createElement('div');
      h.className = 'categoria-header';
      h.textContent = categoriaActual;
      cont.appendChild(h);
    }
    cont.appendChild(renderItemFila(item));
  });
}

function renderItemFila(item) {
  const wrap = document.createElement('div');
  wrap.className = 'item-fila-wrap';

  const fila = document.createElement('div');
  fila.className = 'item-fila';
  fila.innerHTML = `
    <div class="desc">${item.descripcion}</div>
    <div class="opciones">
      <button type="button" data-r="correcto" class="btn-correcto">Correcto ✓</button>
      <button type="button" data-r="observado" class="btn-observado">Observado ✕</button>
    </div>
  `;
  wrap.appendChild(fila);

  const panel = document.createElement('div');
  panel.className = 'observacion-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <label>Descripción del problema observado</label>
    <textarea placeholder="Describa detalladamente el problema observado..."></textarea>
    <label>Fotografía (opcional)</label>
    <input type="file" accept="image/*" capture="environment">
  `;
  wrap.appendChild(panel);

  const btnCorrecto = fila.querySelector('.btn-correcto');
  const btnObservado = fila.querySelector('.btn-observado');
  const textarea = panel.querySelector('textarea');
  const fileInput = panel.querySelector('input[type=file]');

  function marcar(resultado) {
    btnCorrecto.classList.toggle('activo', resultado === 'correcto');
    btnCorrecto.classList.toggle('correcto', true);
    btnObservado.classList.toggle('activo', resultado === 'observado');
    btnObservado.classList.toggle('observado', true);
    panel.style.display = resultado === 'observado' ? 'block' : 'none';
    respuestas[item.id] = respuestas[item.id] || {};
    respuestas[item.id].resultado = resultado;
  }

  btnCorrecto.addEventListener('click', () => marcar('correcto'));
  btnObservado.addEventListener('click', () => marcar('observado'));
  textarea.addEventListener('input', () => {
    respuestas[item.id] = respuestas[item.id] || {};
    respuestas[item.id].observacion_texto = textarea.value;
  });
  fileInput.addEventListener('change', () => {
    respuestas[item.id] = respuestas[item.id] || {};
    respuestas[item.id].foto = fileInput.files[0] || null;
  });

  return wrap;
}

document.getElementById('btn-enviar').addEventListener('click', async () => {
  const errorEl = document.getElementById('envio-error');
  const okEl = document.getElementById('envio-ok');
  errorEl.textContent = '';
  okEl.textContent = '';

  const faltantes = checklistDetalle.items.filter((item) => !respuestas[item.id] || !respuestas[item.id].resultado);
  if (faltantes.length > 0) {
    errorEl.textContent = `Faltan ${faltantes.length} ítem(s) por calificar`;
    return;
  }
  const sinDescripcion = checklistDetalle.items.filter(
    (item) => respuestas[item.id].resultado === 'observado' && !respuestas[item.id].observacion_texto
  );
  if (sinDescripcion.length > 0) {
    errorEl.textContent = 'Toda observación debe incluir una descripción';
    return;
  }

  const payload = {
    checklist_tipo_id: estado.checklistTipoId,
    equipo_ids: estado.equipos.map((e) => e.id),
    respuestas: checklistDetalle.items.map((item) => ({
      checklist_item_id: item.id,
      resultado: respuestas[item.id].resultado,
      observacion_texto: respuestas[item.id].observacion_texto || null,
    })),
  };

  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  checklistDetalle.items.forEach((item) => {
    const foto = respuestas[item.id].foto;
    if (foto) formData.append(`foto_${item.id}`, foto);
  });

  document.getElementById('btn-enviar').disabled = true;
  try {
    const res = await apiFetch('/api/inspecciones', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'No se pudo enviar el checklist';
      document.getElementById('btn-enviar').disabled = false;
      return;
    }
    okEl.textContent = `Checklist enviado correctamente (folio ${data.inspeccion.folio}).` +
      (data.incidencias > 0 ? ` Se registraron ${data.incidencias} incidencia(s).` : '');
    sessionStorage.removeItem('establo_checklist');
    setTimeout(() => { window.location.href = '/seleccionar.html'; }, 2500);
  } catch (err) {
    errorEl.textContent = 'Error de conexión con el servidor';
    document.getElementById('btn-enviar').disabled = false;
  }
});
