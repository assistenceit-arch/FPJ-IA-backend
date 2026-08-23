-- Adenda 2026-08-23: agrega ON DELETE CASCADE a las relaciones de
-- DocumentoGenerado y Pago con Procedimiento -- eran las dos únicas
-- relaciones de todo el schema que NO cascadaban, y son justamente las
-- que casi cualquier procedimiento real tendrá (documentos generados,
-- pago registrado). Sin esto, el borrado automático a los 7 días
-- (ver LimpiezaAutomaticaService) fallaría por violación de llave
-- foránea en el caso más común.
--
-- El nombre exacto de la restricción existente puede variar según el
-- historial de migraciones real de cada entorno, así que se busca
-- dinámicamente en vez de asumir un nombre fijo.

DO $$
DECLARE
  nombre_restriccion text;
BEGIN
  SELECT tc.constraint_name INTO nombre_restriccion
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'documentos_generados'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'procedimiento_id';

  IF nombre_restriccion IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "public"."documentos_generados" DROP CONSTRAINT %I', nombre_restriccion);
  END IF;
END $$;

ALTER TABLE "public"."documentos_generados"
  ADD CONSTRAINT "documentos_generados_procedimiento_id_fkey"
  FOREIGN KEY ("procedimiento_id") REFERENCES "public"."procedimientos"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
DECLARE
  nombre_restriccion text;
BEGIN
  SELECT tc.constraint_name INTO nombre_restriccion
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'pagos'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'procedimientoId';

  IF nombre_restriccion IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "public"."pagos" DROP CONSTRAINT %I', nombre_restriccion);
  END IF;
END $$;

ALTER TABLE "public"."pagos"
  ADD CONSTRAINT "pagos_procedimientoId_fkey"
  FOREIGN KEY ("procedimientoId") REFERENCES "public"."procedimientos"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
