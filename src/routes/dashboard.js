const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/resumen', requireAuth, requireAdmin, async (req, res) => {
  const [equipos, incidencias, checklists, inspecciones] = await Promise.all([
    pool.query(`SELECT COUNT(*) FILTER (WHERE estado = 'activo')::int AS activos, COUNT(*)::int AS total FROM equipos`),
    pool.query(`SELECT COUNT(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes, COUNT(*)::int AS total FROM incidencias`),
    pool.query(`SELECT COUNT(*) FILTER (WHERE activo)::int AS activos FROM checklist_tipos`),
    pool.query(`SELECT COUNT(*)::int AS total FROM inspecciones WHERE date_trunc('month', carpeta_fecha) = date_trunc('month', CURRENT_DATE)`),
  ]);

  res.json({
    equipos_activos: equipos.rows[0].activos,
    equipos_total: equipos.rows[0].total,
    incidencias_pendientes: incidencias.rows[0].pendientes,
    incidencias_total: incidencias.rows[0].total,
    checklists_activos: checklists.rows[0].activos,
    inspecciones_mes: inspecciones.rows[0].total,
  });
});

module.exports = router;
