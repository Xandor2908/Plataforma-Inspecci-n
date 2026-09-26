-- ESTABLO - Esquema de base de datos (Neon / Postgres)
-- Ejecutar una sola vez contra la base de datos indicada en DATABASE_URL.

CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  usuario       TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('admin', 'operador')),
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tipos de equipo: catalogo fijo de nomenclaturas segun el documento
CREATE TABLE IF NOT EXISTS tipos_equipo (
  codigo   TEXT PRIMARY KEY,      -- BRR, SST, SEA, TAB, GEN, AZU, ELE
  nombre   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equipos (
  id            SERIAL PRIMARY KEY,
  nomenclatura  TEXT NOT NULL UNIQUE,   -- ej. BRR-01 (siempre autogenerada)
  tipo_codigo   TEXT NOT NULL REFERENCES tipos_equipo(codigo),
  marca         TEXT,
  modelo        TEXT,
  n_serie       TEXT,
  fecha_ingreso DATE,
  ubicacion     TEXT,
  estado        TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'mantenimiento', 'baja')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tipos/plantillas de checklist (administrables desde la plataforma maestra)
CREATE TABLE IF NOT EXISTS checklist_tipos (
  id                SERIAL PRIMARY KEY,
  codigo            TEXT NOT NULL UNIQUE,   -- identificador interno, ej. '01-01'
  codigo_corto      TEXT UNIQUE,            -- código visible corto, ej. 'C01'
  nombre            TEXT NOT NULL,          -- ej. 'Checklist de inspeccion pre-operacional de equipo HotSpot'
  frecuencia        TEXT NOT NULL DEFAULT 'Diaria',
  tipo_checklist    TEXT NOT NULL DEFAULT 'mantenimiento' CHECK (tipo_checklist IN ('preoperacional', 'mantenimiento')),
  equipos_requeridos JSONB NOT NULL,        -- lista fija de tipo_codigo requeridos, ej. ["BRR","SST"]
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  orden             INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id               SERIAL PRIMARY KEY,
  checklist_tipo_id INTEGER NOT NULL REFERENCES checklist_tipos(id) ON DELETE CASCADE,
  categoria        TEXT NOT NULL,
  orden            INTEGER NOT NULL DEFAULT 0,
  descripcion      TEXT NOT NULL
);

-- Una inspeccion = un checklist enviado por un operador para un conjunto de equipos
CREATE TABLE IF NOT EXISTS inspecciones (
  id                SERIAL PRIMARY KEY,
  checklist_tipo_id INTEGER NOT NULL REFERENCES checklist_tipos(id),
  operador_id       INTEGER NOT NULL REFERENCES usuarios(id),
  folio             TEXT NOT NULL UNIQUE,     -- ej. 2026-09-25-001
  carpeta_fecha     DATE NOT NULL,            -- AAAA-MM-DD, para agrupar en "carpetas"
  fecha_hora        TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_items       INTEGER NOT NULL DEFAULT 0,
  total_observados  INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inspeccion_equipos (
  inspeccion_id INTEGER NOT NULL REFERENCES inspecciones(id) ON DELETE CASCADE,
  equipo_id     INTEGER NOT NULL REFERENCES equipos(id),
  PRIMARY KEY (inspeccion_id, equipo_id)
);

CREATE TABLE IF NOT EXISTS inspeccion_respuestas (
  id                 SERIAL PRIMARY KEY,
  inspeccion_id      INTEGER NOT NULL REFERENCES inspecciones(id),
  checklist_item_id  INTEGER REFERENCES checklist_items(id) ON DELETE SET NULL,
  resultado          TEXT NOT NULL CHECK (resultado IN ('correcto', 'observado')),
  observacion_texto  TEXT,
  observacion_foto_url TEXT,
  -- "Foto" del paso al momento de responder, para que editar la plantilla despues
  -- (agregar/quitar/modificar pasos) nunca rompa el historial de esta respuesta.
  categoria_snapshot   TEXT,
  descripcion_snapshot TEXT,
  orden_snapshot       INTEGER
);

CREATE TABLE IF NOT EXISTS incidencias (
  id                    SERIAL PRIMARY KEY,
  codigo                TEXT NOT NULL UNIQUE,   -- ej. INC-2026-0001
  inspeccion_respuesta_id INTEGER NOT NULL REFERENCES inspeccion_respuestas(id),
  inspeccion_id         INTEGER NOT NULL REFERENCES inspecciones(id),
  descripcion           TEXT NOT NULL,
  foto_url              TEXT,
  estado                TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'resuelta')),
  solucion_texto        TEXT,
  resuelto_por          INTEGER REFERENCES usuarios(id),
  resuelto_en           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspecciones_fecha ON inspecciones (carpeta_fecha);
CREATE INDEX IF NOT EXISTS idx_inspeccion_equipos_equipo ON inspeccion_equipos (equipo_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_estado ON incidencias (estado);
