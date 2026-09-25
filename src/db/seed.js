// Carga datos iniciales: tipos de equipo, tipos de checklist (segun el documento
// "Indicaciones para el desarrollo de la plataforma ESTABLO") y un usuario admin.
// Ejecutar con: npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');

const TIPOS_EQUIPO = [
  ['BRR', 'Robot Burro'],
  ['SST', 'Sistema Starlink'],
  ['SEA', 'Sistema Espanta Aves'],
  ['TAB', 'Tablero eléctrico'],
  ['GEN', 'Generador eléctrico'],
  ['AZU', 'Azufradora'],
  ['ELE', 'Electrostática'],
];

// Cada checklist tipo puede tener varias "variantes" de equipos requeridos
// (ej. con SIM Card vs con Starlink). El operador debe completar una variante entera.
const CHECKLIST_TIPOS = [
  {
    codigo: '01-01',
    nombre: 'Checklist de inspección pre-operacional de equipo HotSpot',
    orden: 1,
    equipos_variantes: [['BRR', 'SST']],
    items: [
      ['Categoría General (Estructural)', 'Nivel de fluidos'],
      ['Categoría General (Estructural)', 'Estado de llantas'],
      ['Categoría General (Estructural)', 'Verificación de frenos'],
      ['Sistema Eléctrico', 'Luces frontales/traseras y bocina operativos'],
      ['Categoría General (Estructural)', 'Cinturón de seguridad'],
      ['Sistema Hidráulico', 'Mangueras y conexiones'],
      ['Sistema Hidráulico', 'Fugas de aceite'],
      ['Sistema Hidráulico', 'Cilindros'],
      ['Sistema Hidráulico', 'Estado de implemento (Cuchara)'],
      ['Sistema Hidráulico', 'Alarma de retroceso'],
    ],
  },
  {
    codigo: '01-02',
    nombre: 'Checklist de mantenimiento preventivo mensual de equipo HotSpot',
    orden: 2,
    equipos_variantes: [['BRR', 'SST']],
    items: [
      ['Mantenimiento General', 'Cambio/revisión de aceite'],
      ['Mantenimiento General', 'Filtros (aire, aceite, combustible)'],
      ['Mantenimiento General', 'Lubricación de puntos de engrase'],
      ['Sistema Eléctrico', 'Estado de batería y conexiones'],
      ['Sistema Starlink', 'Estado físico del equipo Starlink'],
      ['Sistema Starlink', 'Conectividad / señal'],
      ['Sistema Hidráulico', 'Presión del sistema hidráulico'],
      ['Categoría General (Estructural)', 'Torque de pernos estructurales'],
    ],
  },
  {
    codigo: '02',
    nombre: 'Checklist de equipo Espanta Aves',
    orden: 3,
    equipos_variantes: [
      ['BRR', 'SEA'],
      ['BRR', 'SEA', 'SST'],
    ],
    items: [
      ['Categoría General (Estructural)', 'Nivel de fluidos'],
      ['Categoría General (Estructural)', 'Estado de llantas'],
      ['Sistema Eléctrico', 'Luces frontales/traseras y bocina operativos'],
      ['Sistema Espanta Aves', 'Estado físico del sistema espanta aves'],
      ['Sistema Espanta Aves', 'Funcionamiento del disparo/sonido'],
      ['Sistema Espanta Aves', 'Conectividad (SIM Card o Starlink)'],
    ],
  },
  {
    codigo: '03',
    nombre: 'Checklist de equipo Burro con Azufradora',
    orden: 4,
    equipos_variantes: [
      ['BRR', 'GEN', 'TAB', 'AZU'],
      ['BRR', 'GEN', 'TAB', 'AZU', 'SST'],
    ],
    items: [
      ['Categoría General (Estructural)', 'Nivel de fluidos'],
      ['Categoría General (Estructural)', 'Estado de llantas'],
      ['Generador Eléctrico', 'Nivel de combustible'],
      ['Generador Eléctrico', 'Estado de arranque'],
      ['Tablero Eléctrico', 'Estado de conexiones y protecciones'],
      ['Azufradora', 'Estado de boquillas y mangueras'],
      ['Azufradora', 'Nivel de producto'],
      ['Azufradora', 'Funcionamiento del sistema de aspersión'],
    ],
  },
  {
    codigo: '04',
    nombre: 'Checklist de equipo Burro con Electrostática',
    orden: 5,
    equipos_variantes: [
      ['BRR', 'GEN', 'TAB', 'ELE'],
      ['BRR', 'GEN', 'TAB', 'ELE', 'SST'],
    ],
    items: [
      ['Categoría General (Estructural)', 'Nivel de fluidos'],
      ['Categoría General (Estructural)', 'Estado de llantas'],
      ['Generador Eléctrico', 'Nivel de combustible'],
      ['Generador Eléctrico', 'Estado de arranque'],
      ['Tablero Eléctrico', 'Estado de conexiones y protecciones'],
      ['Electrostática', 'Estado de boquillas y carga electrostática'],
      ['Electrostática', 'Nivel de producto'],
      ['Electrostática', 'Funcionamiento del sistema de aspersión'],
    ],
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [codigo, nombre] of TIPOS_EQUIPO) {
      await client.query(
        `INSERT INTO tipos_equipo (codigo, nombre) VALUES ($1, $2)
         ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre`,
        [codigo, nombre]
      );
    }

    for (const ct of CHECKLIST_TIPOS) {
      const res = await client.query(
        `INSERT INTO checklist_tipos (codigo, nombre, equipos_variantes, orden)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (codigo) DO UPDATE SET
           nombre = EXCLUDED.nombre,
           equipos_variantes = EXCLUDED.equipos_variantes,
           orden = EXCLUDED.orden
         RETURNING id`,
        [ct.codigo, ct.nombre, JSON.stringify(ct.equipos_variantes), ct.orden]
      );
      const checklistTipoId = res.rows[0].id;

      // Si ya tenia items, los reemplazamos para que el seed sea idempotente
      await client.query(`DELETE FROM checklist_items WHERE checklist_tipo_id = $1`, [checklistTipoId]);
      let orden = 0;
      for (const [categoria, descripcion] of ct.items) {
        orden += 1;
        await client.query(
          `INSERT INTO checklist_items (checklist_tipo_id, categoria, orden, descripcion)
           VALUES ($1, $2, $3, $4)`,
          [checklistTipoId, categoria, orden, descripcion]
        );
      }
    }

    // Usuario admin inicial (cambia la contraseña luego de tu primer login)
    const adminUser = process.env.SEED_ADMIN_USER || 'admin';
    const adminPass = process.env.SEED_ADMIN_PASSWORD || 'establo2026';
    const hash = await bcrypt.hash(adminPass, 10);
    await client.query(
      `INSERT INTO usuarios (nombre, usuario, password_hash, rol)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (usuario) DO NOTHING`,
      ['Administrador', adminUser, hash]
    );

    // Un par de equipos de ejemplo para poder probar de inmediato
    const equiposEjemplo = [
      ['BRR-01', 'BRR'],
      ['SST-01', 'SST'],
      ['SEA-01', 'SEA'],
      ['TAB-01', 'TAB'],
      ['GEN-01', 'GEN'],
      ['AZU-01', 'AZU'],
      ['ELE-01', 'ELE'],
    ];
    for (const [nomenclatura, tipo] of equiposEjemplo) {
      await client.query(
        `INSERT INTO equipos (nomenclatura, tipo_codigo) VALUES ($1, $2)
         ON CONFLICT (nomenclatura) DO NOTHING`,
        [nomenclatura, tipo]
      );
    }

    await client.query('COMMIT');
    console.log('Seed completado.');
    console.log(`Usuario admin: ${adminUser} / contraseña: ${adminPass} (cámbiala luego de tu primer login)`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en seed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
