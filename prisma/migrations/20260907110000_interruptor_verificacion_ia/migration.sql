-- Adenda 2026-09-07, a solicitud del usuario: interruptor para
-- apagar la verificación automática de pagos por IA sin necesitar un
-- despliegue de código.

ALTER TABLE "public"."configuracion_pagos" ADD COLUMN "verificacionIaHabilitada" BOOLEAN NOT NULL DEFAULT true;
