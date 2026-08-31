import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Adenda 2026-08-24: monitoreo y alertas de errores, a solicitud del
// usuario. Este archivo debe importarse ANTES que cualquier otro en
// main.ts -- Sentry necesita "parchar" los módulos de Node.js (http,
// etc.) antes de que se importen en cualquier otro lugar para poder
// instrumentarlos correctamente.
//
// Se activa solo si SENTRY_DSN está configurado -- en desarrollo local,
// sin esa variable, Sentry simplemente no hace nada (mismo criterio ya
// usado en CorreoService con RESEND_API_KEY: no fallar por falta de
// credenciales de un servicio externo opcional).
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    integrations: [nodeProfilingIntegration()],
    // Para el volumen actual de la aplicación, capturar el 100% del
    // tráfico es razonable. Si el uso crece mucho, bajar estos dos
    // valores para no agotar la cuota gratuita de Sentry demasiado
    // rápido (ej. 0.2 = 20% del tráfico).
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
  });
}
