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

  // Adenda 2026-08-06: envío de correo de verificación para el registro
  // autónomo (src/correo). Opcionales -- si no están configuradas, el
  // enlace de verificación queda en el log del servidor en vez de
  // enviarse por correo real (útil en desarrollo).
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  SMTP_FROM: Joi.string().optional(),
  FRONTEND_URL: Joi.string().optional(),

  // Adenda 2026-08-24: monitoreo y alertas de errores (Sentry).
  // Opcional -- si no está configurada, Sentry simplemente no se
  // activa (mismo criterio que SMTP_HOST).
  SENTRY_DSN: Joi.string().optional(),
});