const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('ADVERTENCIA: DATABASE_URL no está definida. Configúrala en .env o en Render.');
}

const esLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: esLocal ? false : { rejectUnauthorized: false }, // requerido por Neon en producción
});

module.exports = pool;
