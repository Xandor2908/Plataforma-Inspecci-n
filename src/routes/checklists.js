const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { limpiarTexto } = require('../utils');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const soloActivos = req.usuario.rol !== 'admin';
  const result = await pool.query(
    `SELECT ct.id, ct.codigo, ct.codigo_corto, ct.nombre, ct.frecuencia, ct.tipo_checklist,
            ct.equipos_requeridos, ct.activo, ct.orden,
            COUNT(DISTINCT ci.categoria)::int AS total_secciones,
            COUNT(ci.id)::int AS total_pasos
     FROM checklist_tipos ct
     LEFT JOIN checklist_items ci ON ci.checklist_tipo_id = ct.id
     ${soloActivos ? 'WHERE ct.activo = TRUE' : ''}
     GROUP BY ct.id
     ORDER BY ct.orden, ct.codigo`
  );
  res.json(result.rows);
});

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

async function siguienteCodigoCorto(client) {
  const res = await client.query(
    `SELECT codigo_corto FROM checklist_tipos WHERE codigo_corto ~ '^C[0-9]+$' ORDER BY (substring(codigo_corto from 2))::int DESC LIMIT 1`
  );
  const ultimo = res.rows[0]?.codigo_corto;
  const n = ultimo ? parseInt(ultimo.slice(1), 10) + 1 : 1;
  return 'C' + String(n).padStart(2, '0');
}

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { nombre, equipos_requeridos, orden, frecuencia, tipo_checklist, items } = req.body || {};
  if (!nombre || !Array.isArray(equipos_requeridos) || equipos_requeridos.length === 0) {
    return res.status(400).json({ error: 'nombre y equipos_requeridos (al menos 1) son requeridos' });
  }
  if (!['preoperacional', 'mantenimiento'].includes(tipo_checklist)) {
    return res.status(400).json({ error: 'tipo_checklist debe ser preoperacional o mantenimiento' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const codigoCorto = await siguienteCodigoCorto(client);
    const tipoRes = await client.query(
      `INSERT INTO checklist_tipos (codigo, codigo_corto, nombre, equipos_requeridos, orden, frecuencia, tipo_checklist)
       VALUES ($1, $1, $2, $3, $4, $5, $6) RETURNING *`,
      [codigoCorto, limpiarTexto(nombre), JSON.stringify(equipos_requeridos), orden || 0, frecuencia || 'Diaria', tipo_checklist]
    );
    const tipo = tipoRes.rows[0];
    let orden_item = 0;
    for (const item of items || []) {
      orden_item += 1;
      await client.query(
        `INSERT INTO checklist_items (checklist_tipo_id, categoria, orden, descripcion) VALUES ($1, $2, $3, $4)`,
        [tipo.id, limpiarTexto(item.categoria), orden_item, limpiarTexto(item.descripcion)]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(tipo);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error del servidor', detalle: err.message, codigo: err.code });
  } finally {
    client.release();
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { nombre, equipos_requeridos, activo, orden, frecuencia, tipo_checklist } = req.body || {};
  if (tipo_checklist && !['preoperacional', 'mantenimiento'].includes(tipo_checklist)) {
    return res.status(400).json({ error: 'tipo_checklist inválido' });
  }
  const result = await pool.query(
    `UPDATE checklist_tipos SET
       nombre = COALESCE($1, nombre),
       equipos_requeridos = COALESCE($2, equipos_requeridos),
       activo = COALESCE($3, activo),
       orden = COALESCE($4, orden),
       frecuencia = COALESCE($5, frecuencia),
       tipo_checklist = COALESCE($6, tipo_checklist)
     WHERE id = $7 RETURNING *`,
    [nombre ? limpiarTexto(nombre) : null, equipos_requeridos ? JSON.stringify(equipos_requeridos) : null, activo ?? null, orden ?? null, frecuencia ?? null, tipo_checklist ?? null, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Checklist no encontrado' });
  res.json(result.rows[0]);
});

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
        `INSERT INTO checklist_items (checklist_tipo_id, categoria, orden, descripcion) VALUES ($1, $2, $3, $4)`,
        [req.params.id, limpiarTexto(item.categoria), orden, limpiarTexto(item.descripcion)]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error del servidor', detalle: err.message, codigo: err.code });
  } finally {
    client.release();
  }
});

router.post('/:id/duplicar', requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const origenRes = await client.query('SELECT * FROM checklist_tipos WHERE id = $1', [req.params.id]);
    const origen = origenRes.rows[0];
    if (!origen) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Checklist no encontrado' }); }

    const codigoCorto = await siguienteCodigoCorto(client);
    const nuevoRes = await client.query(
      `INSERT INTO checklist_tipos (codigo, codigo_corto, nombre, equipos_requeridos, orden, frecuencia, tipo_checklist, activo)
       VALUES ($1, $1, $2, $3, $4, $5, $6, FALSE) RETURNING *`,
      [codigoCorto, `${origen.nombre} (copia)`, JSON.stringify(origen.equipos_requeridos), origen.orden, origen.frecuencia, origen.tipo_checklist]
    );
    const nuevo = nuevoRes.rows[0];

    const itemsRes = await client.query(
      'SELECT categoria, orden, descripcion FROM checklist_items WHERE checklist_tipo_id = $1 ORDER BY orden',
      [req.params.id]
    );
    for (const item of itemsRes.rows) {
      await client.query(
        `INSERT INTO checklist_items (checklist_tipo_id, categoria, orden, descripcion) VALUES ($1, $2, $3, $4)`,
        [nuevo.id, limpiarTexto(item.categoria), item.orden, limpiarTexto(item.descripcion)]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(nuevo);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  } finally {
    client.release();
  }
});

module.exports = router;
