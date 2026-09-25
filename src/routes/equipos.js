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

// Listado de equipos (uso admin)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT e.id, e.nomenclatura, e.tipo_codigo, t.nombre AS tipo_nombre, e.nombre, e.activo, e.created_at
     FROM equipos e JOIN tipos_equipo t ON t.codigo = e.tipo_codigo
     ORDER BY e.tipo_codigo, e.nomenclatura`
  );
  res.json(result.rows);
});

// Crear equipo (genera nomenclatura si no se especifica: TIPO-NN correlativo)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { tipo_codigo, nomenclatura, nombre } = req.body || {};
  if (!tipo_codigo) return res.status(400).json({ error: 'tipo_codigo es requerido' });
  try {
    let nom = nomenclatura;
    if (!nom) {
      const countRes = await pool.query(
        'SELECT COUNT(*)::int AS n FROM equipos WHERE tipo_codigo = $1',
        [tipo_codigo]
      );
      const siguiente = countRes.rows[0].n + 1;
      nom = `${tipo_codigo}-${String(siguiente).padStart(2, '0')}`;
    }
    const result = await pool.query(
      `INSERT INTO equipos (nomenclatura, tipo_codigo, nombre) VALUES ($1, $2, $3) RETURNING *`,
      [nom, tipo_codigo, nombre || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un equipo con esa nomenclatura' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { nombre, activo } = req.body || {};
  const result = await pool.query(
    `UPDATE equipos SET nombre = COALESCE($1, nombre), activo = COALESCE($2, activo)
     WHERE id = $3 RETURNING *`,
    [nombre ?? null, activo ?? null, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Equipo no encontrado' });
  res.json(result.rows[0]);
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  await pool.query('UPDATE equipos SET activo = FALSE WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Buscar equipo por nomenclatura exacta (usado por el operador al ingresar/escanear).
// Responde 404 con mensaje "equipo no encontrado" segun el documento.
router.get('/buscar/:nomenclatura', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT e.id, e.nomenclatura, e.tipo_codigo, t.nombre AS tipo_nombre
     FROM equipos e JOIN tipos_equipo t ON t.codigo = e.tipo_codigo
     WHERE e.nomenclatura = $1 AND e.activo = TRUE`,
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
