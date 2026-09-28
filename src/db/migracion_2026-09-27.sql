-- ESTABLO - Migración: observación adicional no prevista en checklists
-- Pegar y ejecutar en el SQL Editor de Neon (una sola vez).
--
-- Nota: NO se requiere ninguna columna nueva para esto. La observación adicional
-- se guarda como una respuesta más en "inspeccion_respuestas", con checklist_item_id
-- en NULL (ya lo permite la migración anterior) y categoria_snapshot = 'Observación adicional'.
-- Este archivo solo confirma/asegura que esa migración anterior ya esté aplicada.

ALTER TABLE inspeccion_respuestas
  ADD COLUMN IF NOT EXISTS categoria_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS descripcion_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS orden_snapshot INTEGER;

ALTER TABLE inspeccion_respuestas ALTER COLUMN checklist_item_id DROP NOT NULL;
ALTER TABLE inspeccion_respuestas DROP CONSTRAINT IF EXISTS inspeccion_respuestas_checklist_item_id_fkey;
ALTER TABLE inspeccion_respuestas
  ADD CONSTRAINT inspeccion_respuestas_checklist_item_id_fkey
  FOREIGN KEY (checklist_item_id) REFERENCES checklist_items(id) ON DELETE SET NULL;

-- Permitir que cada checklist tenga una imagen representativa (se muestra en la
-- pantalla de seleccion de checklist del operador). Se sube desde el editor de plantilla.
ALTER TABLE checklist_tipos ADD COLUMN IF NOT EXISTS imagen_url TEXT;
-- (la observacion adicional tambien puede generar una incidencia)
ALTER TABLE incidencias ALTER COLUMN inspeccion_respuesta_id DROP NOT NULL;
ALTER TABLE incidencias DROP CONSTRAINT IF EXISTS incidencias_inspeccion_respuesta_id_fkey;
ALTER TABLE incidencias
  ADD CONSTRAINT incidencias_inspeccion_respuesta_id_fkey
  FOREIGN KEY (inspeccion_respuesta_id) REFERENCES inspeccion_respuestas(id) ON DELETE SET NULL;
