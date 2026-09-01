-- Adenda 2026-09-01: distingue "sin contestar" de "confirmado que no
-- hay elementos incautados" para el Bloque 5.

ALTER TABLE "public"."procedimientos" ADD COLUMN "sinElementosIncautados" BOOLEAN;
