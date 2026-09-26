-- ESTABLO - Migración: historial de inspecciones independiente de la plantilla
-- Pegar y ejecutar en el SQL Editor de Neon (una sola vez).
--
-- Problema que corrige: al editar una plantilla que YA tiene inspecciones reales
-- registradas, guardar los pasos fallaba con "violates foreign key constraint...
-- on table inspeccion_respuestas" porque el sistema borraba los pasos viejos para
-- reemplazarlos, y la base de datos lo bloqueaba para no perder el historial.
--
-- Solución: cada respuesta de una inspección guarda su propia "foto" (snapshot) del
-- texto del paso tal como era en el momento de completarse. Así, editar la plantilla
-- después (agregar, quitar o modificar pasos) nunca choca con inspecciones ya hechas.

ALTER TABLE inspeccion_respuestas
  ADD COLUMN IF NOT EXISTS categoria_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS descripcion_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS orden_snapshot INTEGER;

-- Rellenar el snapshot de respuestas ya existentes con los datos actuales del item
UPDATE inspeccion_respuestas r
SET categoria_snapshot = ci.categoria,
    descripcion_snapshot = ci.descripcion,
    orden_snapshot = ci.orden
FROM checklist_items ci
WHERE ci.id = r.checklist_item_id AND r.categoria_snapshot IS NULL;

-- Permitir que checklist_item_id quede en NULL si el paso original se elimina de la
-- plantilla, sin borrar la respuesta histórica (ya tiene su propio snapshot de texto)
ALTER TABLE inspeccion_respuestas ALTER COLUMN checklist_item_id DROP NOT NULL;
ALTER TABLE inspeccion_respuestas DROP CONSTRAINT IF EXISTS inspeccion_respuestas_checklist_item_id_fkey;
ALTER TABLE inspeccion_respuestas
  ADD CONSTRAINT inspeccion_respuestas_checklist_item_id_fkey
  FOREIGN KEY (checklist_item_id) REFERENCES checklist_items(id) ON DELETE SET NULL;
