-- Adenda 2026-08-23: módulo de Homicidio. Reutiliza por completo el
-- bloque de lesiones de Victima (Lesiones Personales) y el traslado a
-- centro asistencial (para Medicina Legal) -- el único campo nuevo es
-- si la víctima falleció (soporta también el caso de tentativa).

ALTER TABLE "public"."victimas" ADD COLUMN "fallecio" BOOLEAN;
