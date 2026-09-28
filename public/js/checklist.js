let estado = null; // { checklistTipoId, checklistNombre, equipos }
let checklistDetalle = null; // { items, tipo_checklist, imagen_url, ... }
const respuestas = {}; // itemId -> { resultado, observacion_texto, foto: File|null }
let draftKey = null;

const ICONOS_TIPO = { BRR: '🤖', SST: '📡', SEA: '🐦', TAB: '🔌', GEN: '⚡', AZU: '💧', ELE: '🌫️' };

(async function init() {
  const usuario = await requireSession('operador');
  if (!usuario) return;

  const raw = sessionStorage.getItem('establo_checklist');
  if (!raw) { window.location.href = '/seleccionar.html'; return; }
  estado = JSON.parse(raw);
  draftKey = `establo_draft_${estado.checklistTipoId}`;

  document.getElementById('checklist-titulo').textContent = estado.checklistNombre;
  document.getElementById('cf-nombre-checklist').textContent = estado.checklistNombre;
  document.getElementById('cf-equipos').textContent = estado.equipos.map((e) => e.nomenclatura).join(', ');
  document.getElementById('cf-fecha-hoy').textContent = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const iconoPrincipal = ICONOS_TIPO[estado.equipos[0]?.tipo_codigo] || '📋';

  const res = await apiFetch(`/api/checklists/${estado.checklistTipoId}`);
  checklistDetalle = await res.json();

  const tipoPill = document.getElementById('cf-tipo-pill');
  tipoPill.innerHTML = `<span class="pill ${checklistDetalle.tipo_checklist === 'preoperacional' ? 'pill-blue' : 'pill-amber'}">${checklistDetalle.tipo_checklist === 'preoperacional' ? 'Inspección pre-operacional' : 'Mantenimiento'}</span>`;

  const imgEl = document.getElementById('cf-imagen');
  if (checklistDetalle.imagen_url) {
    imgEl.innerHTML = `<img src="${checklistDetalle.imagen_url}">`;
  } else {
    imgEl.textContent = iconoPrincipal;
  }

  if (estado.equipos.some((e) => e.tipo_codigo === 'SST')) {
    document.getElementById('cf-banner-starlink').style.display = 'block';
  }

  cargarUltimaInspeccion();
  cargarBorrador();
  renderItems();
  actualizarProgreso();

  document.getElementById('btn-limpiar').addEventListener('click', limpiarFormulario);
})();

async function cargarUltimaInspeccion() {
  const ids = estado.equipos.map((e) => e.id).join(',');
  try {
    const res = await apiFetch(`/api/inspecciones/ultima?equipo_ids=${ids}`);
    const data = await res.json();
    document.getElementById('cf-ultimo').textContent = data.fecha ? formatearFecha(data.fecha) : 'Sin registros previos';
  } catch (e) {
    document.getElementById('cf-ultimo').textContent = '-';
  }
}

function cargarBorrador() {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    if (guardado) {
      Object.assign(respuestas, guardado.respuestas || {});
      document.getElementById('extra-texto').value = guardado.extraTexto || '';
    }
  } catch (e) { /* borrador invalido, se ignora */ }
}

function guardarBorrador() {
  const copia = {};
  Object.entries(respuestas).forEach(([id, r]) => {
    copia[id] = { resultado: r.resultado, observacion_texto: r.observacion_texto };
  });
  sessionStorage.setItem(draftKey, JSON.stringify({ respuestas: copia, extraTexto: document.getElementById('extra-texto').value }));
}

function renderItems() {
  const cont = document.getElementById('items-container');
  cont.innerHTML = '';
  let categoriaActual = null;
  checklistDetalle.items.forEach((item, idx) => {
    if (item.categoria !== categoriaActual) {
      categoriaActual = item.categoria;
      const h = document.createElement('div');
      h.className = 'categoria-header';
      h.textContent = categoriaActual;
      cont.appendChild(h);
    }
    cont.appendChild(renderItemFila(item, idx + 1));
  });
}

function renderItemFila(item, numero) {
  const guardado = respuestas[item.id] || {};
  const wrap = document.createElement('div');
  wrap.className = 'cf-item-row' + (guardado.resultado === 'observado' ? ' observado' : '');

  wrap.innerHTML = `
    <div class="cf-num">${numero}.</div>
    <div class="cf-item-texto">
      <div class="cf-item-desc">${item.descripcion}</div>
      <div class="cf-observacion">
        <input type="text" placeholder="Escriba una observación..." value="${(guardado.observacion_texto || '').replace(/"/g, '&quot;')}">
        <label class="cf-foto-btn">📷<input type="file" accept="image/*" capture="environment"></label>
      </div>
    </div>
    <div class="cf-opciones">
      <button type="button" class="correcto ${guardado.resultado === 'correcto' ? 'activo' : ''}" title="Correcto">✓</button>
      <button type="button" class="observado ${guardado.resultado === 'observado' ? 'activo' : ''}" title="Observado">✕</button>
    </div>
  `;

  const btnCorrecto = wrap.querySelector('.correcto');
  const btnObservado = wrap.querySelector('.observado');
  const inputTexto = wrap.querySelector('.cf-observacion input[type=text]');
  const inputFoto = wrap.querySelector('.cf-observacion input[type=file]');

  function marcar(resultado) {
    btnCorrecto.classList.toggle('activo', resultado === 'correcto');
    btnObservado.classList.toggle('activo', resultado === 'observado');
    wrap.classList.toggle('observado', resultado === 'observado');
    respuestas[item.id] = respuestas[item.id] || {};
    respuestas[item.id].resultado = resultado;
    guardarBorrador();
    actualizarProgreso();
  }

  btnCorrecto.addEventListener('click', () => marcar('correcto'));
  btnObservado.addEventListener('click', () => marcar('observado'));
  inputTexto.addEventListener('input', () => {
    respuestas[item.id] = respuestas[item.id] || {};
    respuestas[item.id].observacion_texto = inputTexto.value;
    guardarBorrador();
  });
  inputFoto.addEventListener('change', () => {
    respuestas[item.id] = respuestas[item.id] || {};
    respuestas[item.id].foto = inputFoto.files[0] || null;
  });

  return wrap;
}

function actualizarProgreso() {
  const total = checklistDetalle.items.length;
  const respondidos = checklistDetalle.items.filter((it) => respuestas[it.id]?.resultado).length;
  document.getElementById('cf-progreso-texto').textContent = `${respondidos} / ${total}`;
  document.getElementById('cf-progreso-fill').style.width = total ? `${(respondidos / total) * 100}%` : '0%';
}

function limpiarFormulario() {
  if (!confirm('¿Seguro que deseas limpiar todo el formulario? Se perderá lo que has llenado.')) return;
  Object.keys(respuestas).forEach((k) => delete respuestas[k]);
  document.getElementById('extra-texto').value = '';
  document.getElementById('extra-foto').value = '';
  sessionStorage.removeItem(draftKey);
  renderItems();
  actualizarProgreso();
}

document.getElementById('extra-texto').addEventListener('input', guardarBorrador);

document.getElementById('btn-enviar').addEventListener('click', async () => {
  const btnEnviar = document.getElementById('btn-enviar');
  if (btnEnviar.disabled) return; // ya se esta procesando un envio, ignora clics/toques repetidos
  btnEnviar.disabled = true;

  const errorEl = document.getElementById('envio-error');
  const okEl = document.getElementById('envio-ok');
  errorEl.textContent = '';
  okEl.textContent = '';

  const faltantes = checklistDetalle.items.filter((item) => !respuestas[item.id] || !respuestas[item.id].resultado);
  if (faltantes.length > 0) {
    errorEl.textContent = `Faltan ${faltantes.length} ítem(s) por calificar`;
    btnEnviar.disabled = false;
    return;
  }
  const sinDescripcion = checklistDetalle.items.filter(
    (item) => respuestas[item.id].resultado === 'observado' && !respuestas[item.id].observacion_texto
  );
  if (sinDescripcion.length > 0) {
    errorEl.textContent = 'Toda observación debe incluir una descripción';
    btnEnviar.disabled = false;
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
    observacion_extra_texto: document.getElementById('extra-texto').value.trim() || null,
  };

  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  checklistDetalle.items.forEach((item) => {
    const foto = respuestas[item.id].foto;
    if (foto) formData.append(`foto_${item.id}`, foto);
  });
  const fotoExtra = document.getElementById('extra-foto').files[0];
  if (fotoExtra) formData.append('foto_extra', fotoExtra);

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
    sessionStorage.removeItem(draftKey);
    setTimeout(() => { window.location.href = '/seleccionar.html'; }, 2500);
  } catch (err) {
    errorEl.textContent = 'Error de conexión con el servidor';
    document.getElementById('btn-enviar').disabled = false;
  }
});
