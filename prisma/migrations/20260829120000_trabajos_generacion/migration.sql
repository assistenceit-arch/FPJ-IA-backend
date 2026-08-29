-- Adenda 2026-08-29: cola de generación de documentos en segundo plano.

CREATE TABLE "public"."trabajos_generacion" (
    "id" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "procedimientoId" TEXT NOT NULL,
    "capturadoId" TEXT,
    "elementoId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Pendiente',
    "preguntaAclaracion" TEXT,
    "aclaraciones" TEXT,
    "documentoGeneradoId" TEXT,
    "mensajeError" TEXT,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trabajos_generacion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trabajos_generacion_estado_createdAt_idx" ON "public"."trabajos_generacion"("estado", "createdAt");
