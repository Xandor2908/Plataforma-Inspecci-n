const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const result = await pool.query(
    'SELECT id, nombre, usuario, rol, activo, created_at FROM usuarios ORDER BY nombre'
  );
  res.json(result.rows);
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { nombre, usuario, password, rol } = req.body || {};
  if (!nombre || !usuario || !password || !['admin', 'operador'].includes(rol)) {
    return res.status(400).json({ error: 'nombre, usuario, password y rol (admin|operador) son requeridos' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, usuario, rol, activo, created_at`,
      [nombre, usuario, hash, rol]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { nombre, rol, activo, password } = req.body || {};
  const fields = [];
  const values = [];
  let i = 1;
  if (nombre !== undefined) { fields.push(`nombre = $${i++}`); values.push(nombre); }
  if (rol !== undefined) { fields.push(`rol = $${i++}`); values.push(rol); }
  if (activo !== undefined) { fields.push(`activo = $${i++}`); values.push(activo); }
  if (password) { fields.push(`password_hash = $${i++}`); values.push(await bcrypt.hash(password, 10)); }
  if (fields.length === 0) return res.status(400).json({ error: 'Nada para actualizar' });
  values.push(req.params.id);
  const result = await pool.query(
    `UPDATE usuarios SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, nombre, usuario, rol, activo`,
    values
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(result.rows[0]);
});

module.exports = router;
