let checklistSeleccionado = null; // { id, nombre, equipos_requeridos, ... }
let tiposEquipoMap = {}; // codigo -> nombre
let equiposPorTipo = {}; // tipo_codigo -> { id, nomenclatura } | null
let html5QrCode = null;
let tipoEscaneando = null;

(async function init() {
  const usuario = await requireSession('operador');
  if (!usuario) return;
  await cargarTiposEquipo();
  await cargarChecklists();
})();

async function cargarTiposEquipo() {
  const res = await apiFetch('/api/equipos/tipos');
  const tipos = await res.json();
  tipos.forEach((t) => { tiposEquipoMap[t.codigo] = t.nombre; });
}

async function cargarChecklists() {
  const res = await apiFetch('/api/checklists');
  const checklists = await res.json();
  const cont = document.getElementById('lista-checklists');
  cont.innerHTML = '';
  checklists.forEach((c) => {
    const a = document.createElement('a');
    a.href = '#';
    a.innerHTML = `<div class="menu-card">${c.codigo_corto || c.codigo}<br><span style="font-weight:400;font-size:12px">${c.nombre}</span></div>`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      seleccionarChecklist(c);
    });
    cont.appendChild(a);
  });
}

function seleccionarChecklist(c) {
  checklistSeleccionado = c;
  equiposPorTipo = {};
  c.equipos_requeridos.forEach((tipo) => { equiposPorTipo[tipo] = null; });

  document.getElementById('paso-checklist').style.display = 'none';
  document.getElementById('paso-equipos').style.display = 'block';
  document.getElementById('checklist-seleccionado-nombre').textContent = c.nombre;
  renderFilas();
}

document.getElementById('btn-cambiar-checklist').addEventListener('click', () => {
  document.getElementById('paso-checklist').style.display = 'block';
  document.getElementById('paso-equipos').style.display = 'none';
  detenerScanner();
});

function renderFilas() {
  const cont = document.getElementById('filas-equipos');
  cont.innerHTML = '';
  checklistSeleccionado.equipos_requeridos.forEach((tipoCodigo) => {
    const asignado = equiposPorTipo[tipoCodigo];
    const nombreTipo = tiposEquipoMap[tipoCodigo] || tipoCodigo;

    const fila = document.createElement('div');
    fila.className = 'card';
    fila.style.marginBottom = '10px';
    fila.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
        <strong style="font-size:14px">Agregar ${nombreTipo}</strong>
        <span class="pill ${asignado ? 'pill-green' : 'pill-gray'}">${asignado ? 'Agregado' : 'No agregado'}</span>
      </div>
      ${asignado
        ? `<div class="equipo-chip">${asignado.nomenclatura} <button data-tipo="${tipoCodigo}" data-accion="quitar">&times;</button></div>`
        : `<div style="display:flex; gap:8px">
            <input placeholder="Ej. ${tipoCodigo}-01" data-tipo="${tipoCodigo}" class="input-nomenclatura" style="flex:1">
            <button class="btn small" data-tipo="${tipoCodigo}" data-accion="agregar" style="margin-top:0">Agregar</button>
            <button class="btn small secundario" data-tipo="${tipoCodigo}" data-accion="escanear" style="margin-top:0">Escanear QR</button>
          </div>
          <div class="error-msg" data-error-tipo="${tipoCodigo}"></div>`
      }
    `;
    cont.appendChild(fila);
  });

  cont.querySelectorAll('[data-accion="agregar"]').forEach((btn) =>
    btn.addEventListener('click', () => agregarPorNomenclatura(btn.dataset.tipo))
  );
  cont.querySelectorAll('.input-nomenclatura').forEach((input) =>
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); agregarPorNomenclatura(input.dataset.tipo); }
    })
  );
  cont.querySelectorAll('[data-accion="escanear"]').forEach((btn) =>
    btn.addEventListener('click', () => iniciarScanner(btn.dataset.tipo))
  );
  cont.querySelectorAll('[data-accion="quitar"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      equiposPorTipo[btn.dataset.tipo] = null;
      renderFilas();
    })
  );
}

async function agregarPorNomenclatura(tipoCodigo) {
  const input = document.querySelector(`.input-nomenclatura[data-tipo="${tipoCodigo}"]`);
  const errorEl = document.querySelector(`[data-error-tipo="${tipoCodigo}"]`);
  const nom = input.value.trim().toUpperCase();
  if (errorEl) errorEl.textContent = '';
  if (!nom) return;

  try {
    const res = await apiFetch(`/api/equipos/buscar/${encodeURIComponent(nom)}`);
    if (!res.ok) {
      if (errorEl) errorEl.textContent = 'Equipo no encontrado';
      return;
    }
    const equipo = await res.json();
    if (equipo.tipo_codigo !== tipoCodigo) {
      if (errorEl) errorEl.textContent = 'El equipo que se desea agregar no pertenece al tipo solicitado';
      return;
    }
    equiposPorTipo[tipoCodigo] = equipo;
    renderFilas();
  } catch (err) {
    if (errorEl) errorEl.textContent = 'Error de conexión';
  }
}

// --- Escaneo QR ---
async function iniciarScanner(tipoCodigo) {
  tipoEscaneando = tipoCodigo;
  const reader = document.getElementById('qr-reader');
  const cerrarBtn = document.getElementById('btn-cerrar-scanner');
  reader.style.display = 'block';
  cerrarBtn.style.display = 'inline-block';
  reader.scrollIntoView({ behavior: 'smooth', block: 'center' });
  html5QrCode = new Html5Qrcode('qr-reader');
  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 220 },
      async (decodedText) => {
        const nom = decodedText.trim().toUpperCase();
        detenerScanner();
        try {
          const res = await apiFetch(`/api/equipos/buscar/${encodeURIComponent(nom)}`);
          if (!res.ok) { alert('Equipo no encontrado'); return; }
          const equipo = await res.json();
          if (equipo.tipo_codigo !== tipoEscaneando) {
            alert('El equipo que se desea agregar no pertenece al tipo solicitado');
            return;
          }
          equiposPorTipo[tipoEscaneando] = equipo;
          renderFilas();
        } catch (err) {
          alert('Error de conexión');
        }
      },
      () => {}
    );
  } catch (err) {
    alert('No se pudo acceder a la cámara');
    detenerScanner();
  }
}

document.getElementById('btn-cerrar-scanner').addEventListener('click', detenerScanner);

function detenerScanner() {
  const reader = document.getElementById('qr-reader');
  const cerrarBtn = document.getElementById('btn-cerrar-scanner');
  if (html5QrCode) {
    html5QrCode.stop().catch(() => {}).finally(() => { html5QrCode = null; });
  }
  reader.style.display = 'none';
  cerrarBtn.style.display = 'none';
}

// --- Continuar ---
document.getElementById('btn-continuar').addEventListener('click', () => {
  const errorEl = document.getElementById('continuar-error');
  errorEl.textContent = '';
  const faltantes = Object.entries(equiposPorTipo).filter(([, v]) => !v);
  if (faltantes.length > 0) {
    errorEl.textContent = `Faltan ${faltantes.length} equipo(s) para agregar`;
    return;
  }
  const equipos = Object.values(equiposPorTipo);
  sessionStorage.setItem('establo_checklist', JSON.stringify({
    checklistTipoId: checklistSeleccionado.id,
    checklistNombre: checklistSeleccionado.nombre,
    equipos,
  }));
  window.location.href = '/checklist.html';
});
