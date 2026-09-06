-- Corrección 2026-09-06, a solicitud del usuario: 2 métodos de pago
-- adicionales -- Wompí (enlace externo) y Llave (Bre-B).

ALTER TABLE "public"."configuracion_pagos" ADD COLUMN "wompiHabilitado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."configuracion_pagos" ADD COLUMN "wompiLink" TEXT;
ALTER TABLE "public"."configuracion_pagos" ADD COLUMN "llaveHabilitada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."configuracion_pagos" ADD COLUMN "llaveNumero" TEXT;
