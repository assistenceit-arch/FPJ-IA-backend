-- Adenda 2026-08-23: módulo de Receptación. Todos los campos nuevos
-- viven en ElementoIncautado (uso operativo exclusivo de este delito) --
-- no se necesitan entidades nuevas.

ALTER TABLE "public"."elementos_incautados" ADD COLUMN "fuenteVerificacionHurto" TEXT;
ALTER TABLE "public"."elementos_incautados" ADD COLUMN "nombreAplicativo" TEXT;
ALTER TABLE "public"."elementos_incautados" ADD COLUMN "numeroReporteAplicativo" TEXT;
ALTER TABLE "public"."elementos_incautados" ADD COLUMN "numeroDenuncia" TEXT;
ALTER TABLE "public"."elementos_incautados" ADD COLUMN "entidadDenuncia" TEXT;
ALTER TABLE "public"."elementos_incautados" ADD COLUMN "fechaDenuncia" TIMESTAMP(3);
ALTER TABLE "public"."elementos_incautados" ADD COLUMN "denuncianteNombre" TEXT;
ALTER TABLE "public"."elementos_incautados" ADD COLUMN "denuncianteDocumento" TEXT;
ALTER TABLE "public"."elementos_incautados" ADD COLUMN "denuncianteTelefono" TEXT;
