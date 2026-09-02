import * as Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().required(),

  JWT_SECRET: Joi.string().required(),

  // Requerida por el módulo de narrativa (generación IA de la narración de
  // los hechos del FPJ-5). Se crea en console.anthropic.com.
  ANTHROPIC_API_KEY: Joi.string().required(),

  // Corrección 2026-08-31: se reemplaza SMTP directo por Resend (envío
  // de correo vía API HTTP) -- DigitalOcean, como la mayoría de
  // proveedores de nube, bloquea por defecto los puertos SMTP (25, 465,
  // 587) en todos sus servidores para prevenir spam. Esto hacía que
  // cualquier envío directo por SMTP fallara con "Connection timeout",
  // sin importar qué tan bien estuvieran las credenciales -- no era un
  // problema de configuración, era una política de la plataforma.
  // Opcionales -- si no están configuradas, el enlace/código queda en
  // el log del servidor en vez de enviarse por correo real (útil en
  // desarrollo).
  RESEND_API_KEY: Joi.string().optional(),
  RESEND_FROM: Joi.string().optional(),
  FRONTEND_URL: Joi.string().optional(),

  // Adenda 2026-08-24: monitoreo y alertas de errores (Sentry).
  // Opcional -- si no está configurada, Sentry simplemente no se
  // activa (mismo criterio que SMTP_HOST).
  SENTRY_DSN: Joi.string().optional(),

  // Corrección 2026-09-03 (auditoría de seguridad de la PWA): controla
  // si la cookie de sesión exige HTTPS real (flag "Secure"). Por
  // defecto sigue el mismo valor que NODE_ENV=production -- solo hace
  // falta definirla explícitamente en un servidor que corre en modo
  // "production" pero SIN HTTPS real (ej. el servidor de pruebas, que
  // se accede directo por IP sin dominio ni certificado) -- ahí debe
  // ser 'false', o el navegador rechaza silenciosamente guardar la
  // cookie y el login nunca queda realmente iniciado.
  COOKIE_SECURE: Joi.string().valid('true', 'false').optional(),
});