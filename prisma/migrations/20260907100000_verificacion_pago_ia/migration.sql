-- Adenda 2026-09-07, a solicitud del usuario: verificación automática
-- de pagos mediante IA.

ALTER TABLE "public"."pagos" ADD COLUMN "verificadoPorIA" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."pagos" ADD COLUMN "analisisIA" TEXT;
