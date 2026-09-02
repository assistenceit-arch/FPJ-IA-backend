// Adenda 2026-08-24: debe ser la primera línea del archivo -- Sentry
// necesita inicializarse antes que cualquier otro import para poder
// instrumentar correctamente los módulos de Node.js.
import './instrument';

import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Corrección 2026-09-03 (auditoría de seguridad de la PWA): cabeceras
  // HTTP de seguridad estándar (X-Content-Type-Options, X-Frame-Options,
  // etc.) -- esta es una API JSON pura (nunca sirve HTML), así que se
  // desactiva contentSecurityPolicy aquí (esa protección real vive en
  // el frontend, en next.config.mjs, que es quien sirve las páginas que
  // el navegador renderiza).
  app.use(helmet({ contentSecurityPolicy: false }));

  // Corrección 2026-09-03 (auditoría de seguridad de la PWA): necesario
  // para que la estrategia JWT pueda leer el token desde la cookie
  // HttpOnly (req.cookies), en vez de depender únicamente del header
  // Authorization -- sin este middleware, req.cookies llega undefined.
  app.use(cookieParser());

  // Corrección 2026-08-24: SentryGlobalFilter extiende BaseExceptionFilter
  // de NestJS, que internamente necesita una referencia al httpAdapter
  // para poder completar la respuesta HTTP (`applicationRef.isHeadersSent`,
  // `applicationRef.reply`, etc.). Construirlo con `new SentryGlobalFilter()`
  // sin argumentos deja esa referencia en undefined -- el filtro reportaba
  // el error a Sentry correctamente, pero después fallaba al intentar
  // responderle al usuario, convirtiendo CUALQUIER error controlado de la
  // aplicación (401, 400, 403, 404, 409...) en un 500 genérico. Afectaba a
  // toda la aplicación, no solo al login -- se obtiene el httpAdapter real
  // vía HttpAdapterHost, que sí está disponible en este punto del arranque.
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryGlobalFilter(httpAdapter));

  app.setGlobalPrefix('api');

  // CORS: el frontend (Next.js) corre en un puerto distinto al backend, así
  // que el navegador exige que el backend autorice explícitamente el
  // origen. En desarrollo local Next.js suele usar 3000 o 3001 (el que
  // esté libre); en producción se agrega la URL real vía FRONTEND_URL.
  const origenesPermitidos = [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.FRONTEND_URL,
  ].filter((origen): origen is string => Boolean(origen));

  app.enableCors({
    origin: origenesPermitidos,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
