const express = require('express');
const multer = require('multer');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { subirImagen } = require('../cloudinary');
const { enviarAlertaTelegram, textoAlertaIncidencia } = require('../telegram');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// Dado un checklist_tipo y la lista de tipo_codigo ya ingresados, evalua contra
// el conjunto fijo de equipos requeridos y responde si esta completo o cuantos equipos faltan.
router.post('/validar-equipos', requireAuth, async (req, res) => {
  const { checklist_tipo_id, tipo_codigos } = req.body || {};
  if (!checklist_tipo_id || !Array.isArray(tipo_codigos)) {
    return res.status(400).json({ error: 'checklist_tipo_id y tipo_codigos son requeridos' });
  }
  const tipoRes = await pool.query('SELECT equipos_requeridos FROM checklist_tipos WHERE id = $1', [checklist_tipo_id]);
  const tipo = tipoRes.rows[0];
  if (!tipo) return res.status(404).json({ error: 'Checklist no encontrado' });

  const requeridos = tipo.equipos_requeridos; // array plano de tipo_codigo, ej. ["BRR","SST"]
  const ingresados = [...new Set(tipo_codigos)];

  const noPertenecen = ingresados.filter((c) => !requeridos.includes(c));
  if (noPertenecen.length > 0) {
    return res.json({ completo: false, error: 'Los equipos ingresados no corresponden a este checklist' });
  }

  const faltantes = requeridos.filter((c) => !ingresados.includes(c));
  if (faltantes.length === 0) {
    return res.json({ completo: true });
  }
  res.json({ completo: false, faltan: faltantes.length, tipos_faltantes: faltantes });
});

// Envio del checklist completo. multipart/form-data:
//  - campo "payload": JSON string { checklist_tipo_id, equipo_ids, respuestas: [{checklist_item_id, resultado, observacion_texto}] }
//  - archivos: campo "foto_<checklist_item_id>" por cada item con observacion y foto
router.post('/', requireAuth, upload.any(), async (req, res) => {
  let payload;
  try {
    payload = JSON.parse(req.body.payload);
  } catch (err) {
    return res.status(400).json({ error: 'payload inválido' });
  }
  const { checklist_tipo_id, equipo_ids, respuestas } = payload || {};
  if (!checklist_tipo_id || !Array.isArray(equipo_ids) || !Array.isArray(respuestas)) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hoy = new Date();
    const carpetaFecha = hoy.toISOString().slice(0, 10); // AAAA-MM-DD
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS n FROM inspecciones WHERE carpeta_fecha = $1`,
      [carpetaFecha]
    );
    const folio = `${carpetaFecha}-${String(countRes.rows[0].n + 1).padStart(3, '0')}`;

    const totalObservados = respuestas.filter((r) => r.resultado === 'observado').length;

    const inspRes = await client.query(
      `INSERT INTO inspecciones (checklist_tipo_id, operador_id, folio, carpeta_fecha, total_items, total_observados)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [checklist_tipo_id, req.usuario.id, folio, carpetaFecha, respuestas.length, totalObservados]
    );
    const inspeccion = inspRes.rows[0];

    for (const equipoId of equipo_ids) {
      await client.query(
        `INSERT INTO inspeccion_equipos (inspeccion_id, equipo_id) VALUES ($1, $2)`,
        [inspeccion.id, equipoId]
      );
    }

    // Mapa de archivos por fieldname (foto_<itemId>)
    const archivosPorItem = {};
    for (const f of req.files || []) {
      const match = f.fieldname.match(/^foto_(\d+)$/);
      if (match) archivosPorItem[match[1]] = f;
    }

    const incidenciasCreadas = [];

    for (const r of respuestas) {
      let fotoUrl = null;
      const archivo = archivosPorItem[String(r.checklist_item_id)];
      if (archivo) {
        fotoUrl = await subirImagen(archivo.buffer, 'establo/observaciones');
      }

      const respRes = await client.query(
        `INSERT INTO inspeccion_respuestas
           (inspeccion_id, checklist_item_id, resultado, observacion_texto, observacion_foto_url)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [inspeccion.id, r.checklist_item_id, r.resultado, r.observacion_texto || null, fotoUrl]
      );

      if (r.resultado === 'observado') {
        const codeCountRes = await client.query(
          `SELECT COUNT(*)::int AS n FROM incidencias WHERE created_at::date = CURRENT_DATE`
        );
        const codigo = `INC-${carpetaFecha}-${String(codeCountRes.rows[0].n + 1).padStart(3, '0')}`;
        const incRes = await client.query(
          `INSERT INTO incidencias (codigo, inspeccion_respuesta_id, inspeccion_id, descripcion, foto_url)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [codigo, respRes.rows[0].id, inspeccion.id, r.observacion_texto || '(sin descripción)', fotoUrl]
        );
        incidenciasCreadas.push(incRes.rows[0]);
      }
    }

    await client.query('COMMIT');

    // Alertas a Telegram (fuera de la transacción, no debe bloquear el guardado)
    if (incidenciasCreadas.length > 0) {
      const checklistRes = await pool.query('SELECT nombre FROM checklist_tipos WHERE id = $1', [checklist_tipo_id]);
      const equiposRes = await pool.query(
        `SELECT e.nomenclatura FROM equipos e
         JOIN inspeccion_equipos ie ON ie.equipo_id = e.id
         WHERE ie.inspeccion_id = $1`,
        [inspeccion.id]
      );
      const equiposTexto = equiposRes.rows.map((e) => e.nomenclatura).join(', ');
      for (const inc of incidenciasCreadas) {
        await enviarAlertaTelegram({
          texto: textoAlertaIncidencia({
            codigo: inc.codigo,
            checklistNombre: checklistRes.rows[0]?.nombre || '',
            equiposTexto,
            descripcion: inc.descripcion,
            folio,
          }),
          fotoUrl: inc.foto_url,
        });
      }
    }

    res.status(201).json({ inspeccion, incidencias: incidenciasCreadas.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al guardar la inspección' });
  } finally {
    client.release();
  }
});

// Calendario de inspecciones de un equipo: dias con inspeccion registrada,
// diferenciando pre-operacional/mantenimiento/otros por color (segun checklist_tipo).
router.get('/calendario/:equipo_id', requireAuth, async (req, res) => {
  const { equipo_id } = req.params;
  const { anio, mes } = req.query; // mes 1-12, opcional: si no se manda, trae todo

  let query = `
    SELECT i.id, i.folio, i.carpeta_fecha, i.total_observados, ct.codigo AS checklist_codigo,
           ct.codigo_corto, ct.nombre AS checklist_nombre, ct.tipo_checklist
    FROM inspecciones i
    JOIN inspeccion_equipos ie ON ie.inspeccion_id = i.id
    JOIN checklist_tipos ct ON ct.id = i.checklist_tipo_id
    WHERE ie.equipo_id = $1
  `;
  const params = [equipo_id];
  if (anio && mes) {
    query += ` AND EXTRACT(YEAR FROM i.carpeta_fecha) = $2 AND EXTRACT(MONTH FROM i.carpeta_fecha) = $3`;
    params.push(anio, mes);
  }
  query += ' ORDER BY i.carpeta_fecha';

  const result = await pool.query(query, params);

  const totalRes = await pool.query(
    `SELECT COUNT(*)::int AS total, COALESCE(SUM(i.total_observados),0)::int AS observaciones
     FROM inspecciones i JOIN inspeccion_equipos ie ON ie.inspeccion_id = i.id
     WHERE ie.equipo_id = $1`,
    [equipo_id]
  );

  res.json({
    inspecciones: result.rows,
    total_inspecciones: totalRes.rows[0].total,
    total_observaciones: totalRes.rows[0].observaciones,
  });
});

// Detalle de una inspeccion (para ver el checklist enviado)
router.get('/:id', requireAuth, async (req, res) => {
  const inspRes = await pool.query(
    `SELECT i.*, ct.nombre AS checklist_nombre, u.nombre AS operador_nombre
     FROM inspecciones i
     JOIN checklist_tipos ct ON ct.id = i.checklist_tipo_id
     JOIN usuarios u ON u.id = i.operador_id
     WHERE i.id = $1`,
    [req.params.id]
  );
  const inspeccion = inspRes.rows[0];
  if (!inspeccion) return res.status(404).json({ error: 'Inspección no encontrada' });

  const equiposRes = await pool.query(
    `SELECT e.nomenclatura, e.tipo_codigo FROM equipos e
     JOIN inspeccion_equipos ie ON ie.equipo_id = e.id WHERE ie.inspeccion_id = $1`,
    [req.params.id]
  );
  const respuestasRes = await pool.query(
    `SELECT r.*, ci.categoria, ci.descripcion AS item_descripcion, ci.orden
     FROM inspeccion_respuestas r JOIN checklist_items ci ON ci.id = r.checklist_item_id
     WHERE r.inspeccion_id = $1 ORDER BY ci.orden`,
    [req.params.id]
  );

  res.json({ ...inspeccion, equipos: equiposRes.rows, respuestas: respuestasRes.rows });
});

module.exports = router;
