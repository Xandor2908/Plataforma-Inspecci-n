let checklistSeleccionado = null; // { id, nombre }
let equiposIngresados = []; // [{id, nomenclatura, tipo_codigo}]
let html5QrCode = null;

(async function init() {
  const usuario = await requireSession('operador');
  if (!usuario) return;
  await cargarChecklists();
})();

async function cargarChecklists() {
  const res = await apiFetch('/api/checklists');
  const checklists = await res.json();
  const cont = document.getElementById('lista-checklists');
  cont.innerHTML = '';
  checklists.forEach((c) => {
    const a = document.createElement('a');
    a.href = '#';
    a.innerHTML = `<div class="menu-card">${c.codigo}<br><span style="font-weight:400;font-size:12px">${c.nombre}</span></div>`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      seleccionarChecklist(c);
    });
    cont.appendChild(a);
  });
}

function seleccionarChecklist(c) {
  checklistSeleccionado = c;
  equiposIngresados = [];
  document.getElementById('paso-checklist').style.display = 'none';
  document.getElementById('paso-equipos').style.display = 'block';
  document.getElementById('checklist-seleccionado-nombre').textContent = c.nombre;
  renderChips();
}

document.getElementById('btn-cambiar-checklist').addEventListener('click', () => {
  document.getElementById('paso-checklist').style.display = 'block';
  document.getElementById('paso-equipos').style.display = 'none';
  detenerScanner();
});

document.getElementById('btn-agregar-equipo').addEventListener('click', () => agregarPorNomenclatura());
document.getElementById('input-nomenclatura').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); agregarPorNomenclatura(); }
});

async function agregarPorNomenclatura() {
  const input = document.getElementById('input-nomenclatura');
  const nom = input.value.trim().toUpperCase();
  const errorEl = document.getElementById('equipo-error');
  errorEl.textContent = '';
  if (!nom) return;
  if (equiposIngresados.some((e) => e.nomenclatura === nom)) {
    errorEl.textContent = 'Ese equipo ya fue agregado';
    return;
  }
  try {
    const res = await apiFetch(`/api/equipos/buscar/${encodeURIComponent(nom)}`);
    if (!res.ok) {
      errorEl.textContent = 'Equipo no encontrado';
      return;
    }
    const equipo = await res.json();
    equiposIngresados.push(equipo);
    input.value = '';
    renderChips();
  } catch (err) {
    errorEl.textContent = 'Error de conexión';
  }
}

function quitarEquipo(id) {
  equiposIngresados = equiposIngresados.filter((e) => e.id !== id);
  renderChips();
}

function renderChips() {
  const cont = document.getElementById('chips-equipos');
  cont.innerHTML = '';
  equiposIngresados.forEach((e) => {
    const chip = document.createElement('span');
    chip.className = 'equipo-chip';
    chip.innerHTML = `${e.nomenclatura} (${e.tipo_nombre}) <button data-id="${e.id}">&times;</button>`;
    chip.querySelector('button').addEventListener('click', () => quitarEquipo(e.id));
    cont.appendChild(chip);
  });
}

// --- Escaneo QR ---
document.getElementById('btn-escanear').addEventListener('click', async () => {
  const reader = document.getElementById('qr-reader');
  const cerrarBtn = document.getElementById('btn-cerrar-scanner');
  reader.style.display = 'block';
  cerrarBtn.style.display = 'inline-block';
  html5QrCode = new Html5Qrcode('qr-reader');
  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 220 },
      async (decodedText) => {
        document.getElementById('input-nomenclatura').value = decodedText.trim().toUpperCase();
        await agregarPorNomenclatura();
        detenerScanner();
      },
      () => {}
    );
  } catch (err) {
    document.getElementById('equipo-error').textContent = 'No se pudo acceder a la cámara';
  }
});

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
document.getElementById('btn-continuar').addEventListener('click', async () => {
  const errorEl = document.getElementById('continuar-error');
  errorEl.textContent = '';
  const tipoCodigos = equiposIngresados.map((e) => e.tipo_codigo);
  const res = await apiFetch('/api/inspecciones/validar-equipos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checklist_tipo_id: checklistSeleccionado.id, tipo_codigos: tipoCodigos }),
  });
  const data = await res.json();
  if (!data.completo) {
    if (data.faltan) {
      errorEl.textContent = `Faltan ${data.faltan} equipo(s) para agregar`;
    } else {
      errorEl.textContent = data.error || 'Equipos incompletos';
    }
    return;
  }
  sessionStorage.setItem('establo_checklist', JSON.stringify({
    checklistTipoId: checklistSeleccionado.id,
    checklistNombre: checklistSeleccionado.nombre,
    equipos: equiposIngresados,
  }));
  window.location.href = '/checklist.html';
});
