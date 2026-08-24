-- Adenda 2026-08-24: agrega procedimientoId y numeroInterno a
-- auditoria_eventos (para poder identificar el número de caso de cada
-- evento sin depender del texto libre de la descripción, que hasta
-- ahora era inconsistente entre los distintos módulos), e índices
-- sobre fechaEvento, usuario, procedimientoId y numeroInterno (para que
-- la búsqueda del panel de administración no requiera un recorrido
-- completo de la tabla a medida que crece).
--
-- Los registros ya existentes quedan con estos dos campos en NULL --
-- no hay forma de reconstruir con certeza a cuál procedimiento
-- pertenecía cada evento histórico sin volver a parsear el texto libre
-- de cada descripción, que es exactamente lo que este cambio busca
-- dejar de necesitar hacia adelante.

ALTER TABLE "public"."auditoria_eventos" ADD COLUMN "procedimientoId" TEXT;
ALTER TABLE "public"."auditoria_eventos" ADD COLUMN "numeroInterno" TEXT;

CREATE INDEX "auditoria_eventos_fechaEvento_idx" ON "public"."auditoria_eventos"("fechaEvento");
CREATE INDEX "auditoria_eventos_usuario_idx" ON "public"."auditoria_eventos"("usuario");
CREATE INDEX "auditoria_eventos_procedimientoId_idx" ON "public"."auditoria_eventos"("procedimientoId");
CREATE INDEX "auditoria_eventos_numeroInterno_idx" ON "public"."auditoria_eventos"("numeroInterno");
