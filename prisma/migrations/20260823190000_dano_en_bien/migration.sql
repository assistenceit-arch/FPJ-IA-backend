-- Adenda 2026-08-23: módulo de Daño en Bien Ajeno o del Estado
-- (artículo 265 CP -- un solo delito, sin tipo penal separado para
-- bienes del Estado, confirmado con el usuario). Extiende únicamente
-- Victima (el propietario del bien) -- no se necesitan entidades
-- nuevas.

ALTER TABLE "public"."victimas" ADD COLUMN "descripcionBienDanado" TEXT;
ALTER TABLE "public"."victimas" ADD COLUMN "mecanismoDano" TEXT;
ALTER TABLE "public"."victimas" ADD COLUMN "valorEstimadoDano" TEXT;
ALTER TABLE "public"."victimas" ADD COLUMN "esBienEstatal" BOOLEAN;
ALTER TABLE "public"."victimas" ADD COLUMN "entidadPropietariaBien" TEXT;
