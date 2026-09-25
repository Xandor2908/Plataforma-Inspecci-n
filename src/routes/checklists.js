const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Listado de checklist tipos activos (para que el operador seleccione uno)
router.get('/', requireAuth, async (req, res) => {
  const soloActivos = req.usuario.rol !== 'admin';
  const result = await pool.query(
    `SELECT id, codigo, nombre, equipos_variantes, activo, orden
     FROM checklist_tipos ${soloActivos ? 'WHERE activo = TRUE' : ''}
     ORDER BY orden, codigo`
  );
  res.json(result.rows);
});

// Detalle de un checklist tipo con sus items (agrupados por categoria en el cliente)
router.get('/:id', requireAuth, async (req, res) => {
  const tipoRes = await pool.query('SELECT * FROM checklist_tipos WHERE id = $1', [req.params.id]);
  const tipo = tipoRes.rows[0];
  if (!tipo) return res.status(404).json({ error: 'Checklist no encontrado' });
  const itemsRes = await pool.query(
    'SELECT id, categoria, orden, descripcion FROM checklist_items WHERE checklist_tipo_id = $1 ORDER BY orden',
    [req.params.id]
  );
  res.json({ ...tipo, items: itemsRes.rows });
});

// --- Administración (crear / editar / desactivar checklist tipos e items) ---

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { codigo, nombre, equipos_variantes, orden, items } = req.body || {};
  if (!codigo || !nombre || !Array.isArray(equipos_variantes)) {
    return res.status(400).json({ error: 'codigo, nombre y equipos_variantes son requeridos' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tipoRes = await client.query(
      `INSERT INTO checklist_tipos (codigo, nombre, equipos_variantes, orden)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [codigo, nombre, JSON.stringify(equipos_variantes), orden || 0]
    );
    const tipo = tipoRes.rows[0];
    let orden_item = 0;
    for (const item of items || []) {
      orden_item += 1;
      await client.query(
        `INSERT INTO checklist_items (checklist_tipo_id, categoria, orden, descripcion)
         VALUES ($1, $2, $3, $4)`,
        [tipo.id, item.categoria, orden_item, item.descripcion]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(tipo);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un checklist con ese código' });
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  } finally {
    client.release();
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { nombre, equipos_variantes, activo, orden } = req.body || {};
  const result = await pool.query(
    `UPDATE checklist_tipos SET
       nombre = COALESCE($1, nombre),
       equipos_variantes = COALESCE($2, equipos_variantes),
       activo = COALESCE($3, activo),
       orden = COALESCE($4, orden)
     WHERE id = $5 RETURNING *`,
    [nombre ?? null, equipos_variantes ? JSON.stringify(equipos_variantes) : null, activo ?? null, orden ?? null, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Checklist no encontrado' });
  res.json(result.rows[0]);
});

// Reemplaza por completo los items de un checklist tipo
router.put('/:id/items', requireAuth, requireAdmin, async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items debe ser un arreglo' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM checklist_items WHERE checklist_tipo_id = $1', [req.params.id]);
    let orden = 0;
    for (const item of items) {
      orden += 1;
      await client.query(
        `INSERT INTO checklist_items (checklist_tipo_id, categoria, orden, descripcion)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, item.categoria, orden, item.descripcion]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  } finally {
    client.release();
  }
});

module.exports = router;
