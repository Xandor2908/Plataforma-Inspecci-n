const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { limpiarTexto } = require('../utils');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const { estado } = req.query;
  let query = `
    SELECT inc.*, i.folio, ct.nombre AS checklist_nombre,
           (SELECT string_agg(e.nomenclatura, ', ') FROM equipos e
            JOIN inspeccion_equipos ie ON ie.equipo_id = e.id WHERE ie.inspeccion_id = i.id) AS equipos
    FROM incidencias inc
    JOIN inspecciones i ON i.id = inc.inspeccion_id
    JOIN checklist_tipos ct ON ct.id = i.checklist_tipo_id
  `;
  const params = [];
  if (estado) {
    params.push(estado);
    query += ` WHERE inc.estado = $1`;
  }
  query += ' ORDER BY inc.created_at DESC';
  const result = await pool.query(query, params);
  res.json(result.rows);
});

router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT inc.*, i.folio, ct.nombre AS checklist_nombre,
            (SELECT string_agg(e.nomenclatura, ', ') FROM equipos e
             JOIN inspeccion_equipos ie ON ie.equipo_id = e.id WHERE ie.inspeccion_id = i.id) AS equipos
     FROM incidencias inc
     JOIN inspecciones i ON i.id = inc.inspeccion_id
     JOIN checklist_tipos ct ON ct.id = i.checklist_tipo_id
     WHERE inc.id = $1`,
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Incidencia no encontrada' });
  res.json(result.rows[0]);
});

router.patch('/:id/resolver', requireAuth, requireAdmin, async (req, res) => {
  const { solucion_texto } = req.body || {};
  if (!solucion_texto) return res.status(400).json({ error: 'solucion_texto es requerido' });
  const result = await pool.query(
    `UPDATE incidencias SET estado = 'resuelta', solucion_texto = $1, resuelto_por = $2, resuelto_en = now()
     WHERE id = $3 RETURNING *`,
    [limpiarTexto(solucion_texto), req.usuario.id, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Incidencia no encontrada' });
  res.json(result.rows[0]);
});

router.patch('/:id/pendiente', requireAuth, requireAdmin, async (req, res) => {
  const result = await pool.query(
    `UPDATE incidencias SET estado = 'pendiente', solucion_texto = NULL, resuelto_por = NULL, resuelto_en = NULL
     WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Incidencia no encontrada' });
  res.json(result.rows[0]);
});

module.exports = router;
