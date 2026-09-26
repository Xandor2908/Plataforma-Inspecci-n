-- ESTABLO - Migración 2: equipos implicados (fijo, no variantes) y tipo de checklist
-- Pegar y ejecutar en el SQL Editor de Neon (una sola vez).

-- 1) Nuevo campo: equipos_requeridos (lista simple de tipo_codigo, sin variantes alternativas)
ALTER TABLE checklist_tipos ADD COLUMN IF NOT EXISTS equipos_requeridos JSONB;

-- Migrar desde equipos_variantes: se toma la variante MAS CORTA (la que no incluye Starlink)
-- como conjunto fijo. Si necesitas la variante con Starlink como checklist aparte, duplica
-- la plantilla desde la plataforma y agrega SST a la copia.
UPDATE checklist_tipos
SET equipos_requeridos = (
  SELECT variante
  FROM jsonb_array_elements(equipos_variantes) AS variante
  ORDER BY jsonb_array_length(variante) ASC
  LIMIT 1
)
WHERE equipos_requeridos IS NULL;

ALTER TABLE checklist_tipos ALTER COLUMN equipos_requeridos SET NOT NULL;
ALTER TABLE checklist_tipos DROP COLUMN IF EXISTS equipos_variantes;

-- 2) Tipo de checklist explícito (reemplaza el booleano es_preoperacional)
ALTER TABLE checklist_tipos ADD COLUMN IF NOT EXISTS tipo_checklist TEXT;
UPDATE checklist_tipos SET tipo_checklist = CASE WHEN es_preoperacional THEN 'preoperacional' ELSE 'mantenimiento' END
WHERE tipo_checklist IS NULL;
ALTER TABLE checklist_tipos ALTER COLUMN tipo_checklist SET NOT NULL;
ALTER TABLE checklist_tipos DROP CONSTRAINT IF EXISTS checklist_tipos_tipo_checklist_check;
ALTER TABLE checklist_tipos ADD CONSTRAINT checklist_tipos_tipo_checklist_check CHECK (tipo_checklist IN ('preoperacional', 'mantenimiento'));
ALTER TABLE checklist_tipos DROP COLUMN IF EXISTS es_preoperacional;
