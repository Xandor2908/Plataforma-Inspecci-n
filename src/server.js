require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const equiposRoutes = require('./routes/equipos');
const checklistsRoutes = require('./routes/checklists');
const inspeccionesRoutes = require('./routes/inspecciones');
const incidenciasRoutes = require('./routes/incidencias');
const usuariosRoutes = require('./routes/usuarios');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/equipos', equiposRoutes);
app.use('/api/checklists', checklistsRoutes);
app.use('/api/inspecciones', inspeccionesRoutes);
app.use('/api/incidencias', incidenciasRoutes);
app.use('/api/usuarios', usuariosRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));

// Cualquier ruta no-API sirve el frontend (SPA simple con paginas estaticas)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ESTABLO escuchando en puerto ${PORT}`);
});
