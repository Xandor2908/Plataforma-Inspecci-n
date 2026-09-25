-- ESTABLO - Migración: mejoras de equipos y checklists
-- Pegar y ejecutar en el SQL Editor de Neon (una sola vez).

-- 1) Equipos: nuevos campos (marca, modelo, n° serie, fecha de ingreso, ubicación, estado)
ALTER TABLE equipos
  ADD COLUMN IF NOT EXISTS marca TEXT,
  ADD COLUMN IF NOT EXISTS modelo TEXT,
  ADD COLUMN IF NOT EXISTS n_serie TEXT,
  ADD COLUMN IF NOT EXISTS fecha_ingreso DATE,
  ADD COLUMN IF NOT EXISTS ubicacion TEXT,
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo';

-- Migrar el estado anterior (activo booleano) al nuevo estado de 3 valores
UPDATE equipos SET estado = CASE WHEN activo THEN 'activo' ELSE 'baja' END;

ALTER TABLE equipos DROP CONSTRAINT IF EXISTS equipos_estado_check;
ALTER TABLE equipos ADD CONSTRAINT equipos_estado_check CHECK (estado IN ('activo','mantenimiento','baja'));

ALTER TABLE equipos DROP COLUMN IF EXISTS activo;
ALTER TABLE equipos DROP COLUMN IF EXISTS nombre;

-- 2) Checklist tipos: código corto (C01, C02...), frecuencia, y marca de "pre-operacional"
ALTER TABLE checklist_tipos
  ADD COLUMN IF NOT EXISTS codigo_corto TEXT,
  ADD COLUMN IF NOT EXISTS frecuencia TEXT NOT NULL DEFAULT 'Diaria',
  ADD COLUMN IF NOT EXISTS es_preoperacional BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE checklist_tipos SET codigo_corto = 'C' || LPAD(orden::text, 2, '0') WHERE codigo_corto IS NULL;
UPDATE checklist_tipos SET es_preoperacional = TRUE WHERE codigo = '01-01';

ALTER TABLE checklist_tipos DROP CONSTRAINT IF EXISTS checklist_tipos_codigo_corto_key;
ALTER TABLE checklist_tipos ADD CONSTRAINT checklist_tipos_codigo_corto_key UNIQUE (codigo_corto);
