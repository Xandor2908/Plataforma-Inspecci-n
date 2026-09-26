const express = require('express');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const ESTADO_TEXTO = { activo: 'Activo', mantenimiento: 'En mantenimiento', baja: 'De baja' };

router.get('/tipos', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT codigo, nombre FROM tipos_equipo ORDER BY codigo');
  res.json(result.rows);
});

router.get('/sugerencias/:campo', requireAuth, requireAdmin, async (req, res) => {
  const campos = { marca: 'marca', modelo: 'modelo', ubicacion: 'ubicacion' };
  const columna = campos[req.params.campo];
  if (!columna) return res.status(400).json({ error: 'Campo inválido' });
  const result = await pool.query(
    `SELECT DISTINCT ${columna} AS valor FROM equipos WHERE ${columna} IS NOT NULL AND ${columna} <> '' ORDER BY ${columna}`
  );
  res.json(result.rows.map((r) => r.valor));
});

// Construye el WHERE + params de los filtros (Tipo, Marca, Modelo, Ubicación, Estado),
// reutilizado por el listado y por ambas exportaciones.
function construirFiltro(query) {
  const condiciones = [];
  const params = [];
  let i = 1;
  if (query.tipo) { condiciones.push(`e.tipo_codigo = $${i++}`); params.push(query.tipo); }
  if (query.marca) { condiciones.push(`e.marca = $${i++}`); params.push(query.marca); }
  if (query.modelo) { condiciones.push(`e.modelo = $${i++}`); params.push(query.modelo); }
  if (query.ubicacion) { condiciones.push(`e.ubicacion = $${i++}`); params.push(query.ubicacion); }
  if (query.estado) { condiciones.push(`e.estado = $${i++}`); params.push(query.estado); }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return { where, params };
}

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const { where, params } = construirFiltro(req.query);
  const result = await pool.query(
    `SELECT e.id, e.nomenclatura, e.tipo_codigo, t.nombre AS tipo_nombre,
            e.marca, e.modelo, e.n_serie, e.fecha_ingreso, e.ubicacion, e.estado, e.created_at
     FROM equipos e JOIN tipos_equipo t ON t.codigo = e.tipo_codigo
     ${where}
     ORDER BY e.tipo_codigo, e.nomenclatura`,
    params
  );
  res.json(result.rows);
});

async function filasParaExportar(query) {
  const { where, params } = construirFiltro(query);
  const result = await pool.query(
    `SELECT e.nomenclatura, t.nombre AS tipo_nombre, e.marca, e.modelo, e.n_serie,
            e.fecha_ingreso, e.ubicacion, e.estado
     FROM equipos e JOIN tipos_equipo t ON t.codigo = e.tipo_codigo
     ${where}
     ORDER BY e.tipo_codigo, e.nomenclatura`,
    params
  );
  return result.rows.map((r) => ({
    Nomenclatura: r.nomenclatura,
    Tipo: r.tipo_nombre,
    Marca: r.marca || '',
    Modelo: r.modelo || '',
    'N° Serie': r.n_serie || '',
    'Fecha de ingreso': r.fecha_ingreso ? r.fecha_ingreso.toISOString().slice(0, 10) : '',
    Ubicación: r.ubicacion || '',
    Estado: ESTADO_TEXTO[r.estado] || r.estado,
  }));
}

router.get('/exportar/excel', requireAuth, requireAdmin, async (req, res) => {
  const filas = await filasParaExportar(req.query);
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Equipos');
  const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="equipos_establo.xlsx"');
  res.send(buffer);
});

router.get('/exportar/pdf', requireAuth, requireAdmin, async (req, res) => {
  const filas = await filasParaExportar(req.query);
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="equipos_establo.pdf"');
  doc.pipe(res);

  doc.fontSize(16).text('ESTABLO - Equipos registrados', { align: 'left' });
  doc.moveDown(0.5);

  const columnas = ['Nomenclatura', 'Tipo', 'Marca', 'Modelo', 'N° Serie', 'Fecha de ingreso', 'Ubicación', 'Estado'];
  const anchoCol = 90;
  let y = doc.y + 5;

  doc.fontSize(9).font('Helvetica-Bold');
  columnas.forEach((col, idx) => doc.text(col, 30 + idx * anchoCol, y, { width: anchoCol - 4 }));
  y += 16;
  doc.moveTo(30, y - 2).lineTo(30 + columnas.length * anchoCol, y - 2).stroke();

  doc.font('Helvetica');
  filas.forEach((fila) => {
    if (y > 550) { doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' }); y = 40; }
    columnas.forEach((col, idx) => {
      doc.text(String(fila[col] ?? ''), 30 + idx * anchoCol, y, { width: anchoCol - 4 });
    });
    y += 16;
  });

  doc.end();
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { tipo_codigo, marca, modelo, n_serie, fecha_ingreso, ubicacion } = req.body || {};
  if (!tipo_codigo) return res.status(400).json({ error: 'tipo_codigo es requerido' });
  try {
    const countRes = await pool.query('SELECT COUNT(*)::int AS n FROM equipos WHERE tipo_codigo = $1', [tipo_codigo]);
    const siguiente = countRes.rows[0].n + 1;
    const nomenclatura = `${tipo_codigo}-${String(siguiente).padStart(2, '0')}`;

    const result = await pool.query(
      `INSERT INTO equipos (nomenclatura, tipo_codigo, marca, modelo, n_serie, fecha_ingreso, ubicacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [nomenclatura, tipo_codigo, marca || null, modelo || null, n_serie || null, fecha_ingreso || null, ubicacion || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un equipo con esa nomenclatura, intenta de nuevo' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { marca, modelo, n_serie, fecha_ingreso, ubicacion, estado } = req.body || {};
  if (estado && !['activo', 'mantenimiento', 'baja'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  const result = await pool.query(
    `UPDATE equipos SET
       marca = COALESCE($1, marca),
       modelo = COALESCE($2, modelo),
       n_serie = COALESCE($3, n_serie),
       fecha_ingreso = COALESCE($4, fecha_ingreso),
       ubicacion = COALESCE($5, ubicacion),
       estado = COALESCE($6, estado)
     WHERE id = $7 RETURNING *`,
    [marca ?? null, modelo ?? null, n_serie ?? null, fecha_ingreso ?? null, ubicacion ?? null, estado ?? null, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Equipo no encontrado' });
  res.json(result.rows[0]);
});

router.get('/buscar/:nomenclatura', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT e.id, e.nomenclatura, e.tipo_codigo, t.nombre AS tipo_nombre, e.estado
     FROM equipos e JOIN tipos_equipo t ON t.codigo = e.tipo_codigo
     WHERE e.nomenclatura = $1 AND e.estado <> 'baja'`,
    [req.params.nomenclatura.trim().toUpperCase()]
  );
  if (!result.rows[0]) {
    return res.status(404).json({ error: 'Equipo no encontrado' });
  }
  res.json(result.rows[0]);
});

router.get('/:id/qr', requireAuth, requireAdmin, async (req, res) => {
  const result = await pool.query('SELECT nomenclatura FROM equipos WHERE id = $1', [req.params.id]);
  const equipo = result.rows[0];
  if (!equipo) return res.status(404).json({ error: 'Equipo no encontrado' });
  try {
    const dataUrl = await QRCode.toDataURL(equipo.nomenclatura, { width: 300, margin: 2 });
    res.json({ nomenclatura: equipo.nomenclatura, qr: dataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo generar el QR' });
  }
});

module.exports = router;
