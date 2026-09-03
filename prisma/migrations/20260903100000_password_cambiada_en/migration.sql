-- Corrección 2026-09-03 (auditoría de seguridad, segunda ronda):
-- permite invalidar sesiones activas cuando se cambia la contraseña.

ALTER TABLE "public"."usuarios" ADD COLUMN "passwordCambiadaEn" TIMESTAMP(3);
