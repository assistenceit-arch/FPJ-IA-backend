-- Adenda 2026-09-03, a solicitud del usuario: se divide el campo
-- combinado en dos. Se RENOMBRA la columna existente (en vez de
-- borrarla y crear una nueva) para no perder ningún dato ya
-- registrado en procedimientos existentes -- el texto que ya estaba
-- ahí (que hasta ahora combinaba física y vestimenta) queda
-- preservado bajo "descripcionFisica"; los funcionarios pueden
-- reorganizarlo manualmente si editan un registro viejo. La columna
-- nueva "descripcionVestimenta" empieza vacía para todos.

ALTER TABLE "public"."capturados" RENAME COLUMN "descripcionFisicaVestimenta" TO "descripcionFisica";
ALTER TABLE "public"."capturados" ADD COLUMN "descripcionVestimenta" TEXT;
