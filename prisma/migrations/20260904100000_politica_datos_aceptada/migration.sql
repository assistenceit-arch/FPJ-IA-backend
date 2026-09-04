-- Corrección 2026-09-04, a solicitud del usuario: registro con valor
-- legal real de la aceptación de la Política de Tratamiento de Datos
-- al momento del registro.

ALTER TABLE "public"."usuarios" ADD COLUMN "politicaDatosAceptadaEn" TIMESTAMP(3);
