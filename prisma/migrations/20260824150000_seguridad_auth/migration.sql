-- Adenda 2026-08-24: campos de seguridad en Usuario -- bloqueo por
-- intentos fallidos de login, segundo factor de autenticación por
-- correo, y recuperación de contraseña.

ALTER TABLE "public"."usuarios" ADD COLUMN "intentosFallidosLogin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."usuarios" ADD COLUMN "bloqueadoPorIntentos" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."usuarios" ADD COLUMN "codigo2FA" TEXT;
ALTER TABLE "public"."usuarios" ADD COLUMN "codigo2FAExpira" TIMESTAMP(3);
ALTER TABLE "public"."usuarios" ADD COLUMN "tokenRecuperacion" TEXT;
ALTER TABLE "public"."usuarios" ADD COLUMN "tokenRecuperacionExpira" TIMESTAMP(3);

CREATE UNIQUE INDEX "usuarios_tokenRecuperacion_key" ON "public"."usuarios"("tokenRecuperacion");
