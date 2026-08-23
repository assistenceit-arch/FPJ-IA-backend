-- Adenda 2026-08-23: módulos de Secuestro y Extorsión. Ambos extienden
-- únicamente el modelo Victima (núcleo común) con campos exclusivos de
-- cada delito -- ninguno necesita nuevas entidades ni cambios en las
-- plantillas .docx (100% narrativo).

-- Secuestro (cubre simple y extorsivo, art. 168/169 CP -- sin campo de
-- clasificación).
ALTER TABLE "public"."victimas" ADD COLUMN "fechaInicioPrivacionLibertad" TIMESTAMP(3);
ALTER TABLE "public"."victimas" ADD COLUMN "horaInicioPrivacionLibertad" TEXT;
ALTER TABLE "public"."victimas" ADD COLUMN "finalidadPrivacionLibertad" TEXT;
ALTER TABLE "public"."victimas" ADD COLUMN "lugaresRetencion" TEXT;

-- Extorsión (art. 244 CP).
ALTER TABLE "public"."victimas" ADD COLUMN "montoExigido" TEXT;
ALTER TABLE "public"."victimas" ADD COLUMN "motivoExigencia" TEXT;
ALTER TABLE "public"."victimas" ADD COLUMN "medioExigencia" TEXT;
ALTER TABLE "public"."victimas" ADD COLUMN "existenAmenazas" BOOLEAN;
ALTER TABLE "public"."victimas" ADD COLUMN "descripcionAmenazas" TEXT;
ALTER TABLE "public"."victimas" ADD COLUMN "lugarEntregaExigido" TEXT;
