-- Adenda 2026-08-23: módulos de Uso de Documento Falso, Falsedad
-- Personal y Tráfico de Moneda Falsa ("delitos contra la fe pública").
-- Los tres comparten estos dos campos en ElementoIncautado -- no se
-- necesitan entidades nuevas.

ALTER TABLE "public"."elementos_incautados" ADD COLUMN "contextoExhibicion" TEXT;
ALTER TABLE "public"."elementos_incautados" ADD COLUMN "criteriosSospecha" TEXT;
