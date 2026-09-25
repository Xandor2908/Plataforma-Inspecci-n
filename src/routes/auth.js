const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 1000 * 60 * 60 * 12, // 12 horas
};

router.post('/login', async (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
  }
  try {
    const result = await pool.query(
      'SELECT id, nombre, usuario, password_hash, rol, activo FROM usuarios WHERE usuario = $1',
      [usuario]
    );
    const user = result.rows[0];
    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    const valido = await bcrypt.compare(password, user.password_hash);
    if (!valido) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    const payload = { id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.cookie('establo_token', token, COOKIE_OPTS);
    res.json({ usuario: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('establo_token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ usuario: req.usuario });
});

module.exports = router;
