const express = require('express');
const QRCode = require('qrcode');
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Catalogo de tipos de equipo (fijo, definido en el documento de indicaciones)
router.get('/tipos', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT codigo, nombre FROM tipos_equipo ORDER BY codigo');
  res.json(result.rows);
});

// Valores previamente ingresados, para autocompletar Marca / Modelo / Ubicación
router.get('/sugerencias/:campo', requireAuth, requireAdmin, async (req, res) => {
  const campos = { marca: 'marca', modelo: 'modelo', ubicacion: 'ubicacion' };
  const columna = campos[req.params.campo];
  if (!columna) return res.status(400).json({ error: 'Campo inválido' });
  const result = await pool.query(
    `SELECT DISTINCT ${columna} AS valor FROM equipos WHERE ${columna} IS NOT NULL AND ${columna} <> '' ORDER BY ${columna}`
  );
  res.json(result.rows.map((r) => r.valor));
});

// Listado de equipos (uso admin)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT e.id, e.nomenclatura, e.tipo_codigo, t.nombre AS tipo_nombre,
            e.marca, e.modelo, e.n_serie, e.fecha_ingreso, e.ubicacion, e.estado, e.created_at
     FROM equipos e JOIN tipos_equipo t ON t.codigo = e.tipo_codigo
     ORDER BY e.tipo_codigo, e.nomenclatura`
  );
  res.json(result.rows);
});

// Crear equipo. La nomenclatura SIEMPRE se autogenera (TIPO-NN correlativo), nunca manual.
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

// Editar cualquier dato del equipo (marca, modelo, n° serie, fecha, ubicación, estado)
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

// Buscar equipo por nomenclatura exacta (usado por el operador al ingresar/escanear).
// Responde 404 con mensaje "equipo no encontrado" segun el documento.
// Los equipos "de baja" no se consideran disponibles para checklists.
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

// Genera el codigo QR (PNG data URL) de un equipo, para imprimir/pegar en el equipo fisico
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
