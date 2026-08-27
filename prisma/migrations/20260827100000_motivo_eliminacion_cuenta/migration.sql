-- Adenda 2026-08-27: motivo que el propio funcionario escribe al
-- eliminar su cuenta (autoservicio).

ALTER TABLE "public"."usuarios" ADD COLUMN "motivoEliminacion" TEXT;
