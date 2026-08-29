import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SentryModule } from '@sentry/nestjs/setup';
import { PrismaModule } from './prisma/prisma.module';
import { TrabajosGeneracionModule } from './trabajos-generacion/trabajos-generacion.module';
import { environmentValidationSchema } from './config/environment.validation';

/**
 * Adenda 2026-08-29: módulo dedicado exclusivamente al proceso
 * trabajador (ver src/worker.ts) -- deliberadamente NO reutiliza
 * AppModule completo, porque este último trae consigo cosas que NO
 * tienen sentido (o serían activamente dañinas) en un proceso sin
 * servidor HTTP:
 *
 * - ScheduleModule/LimpiezaAutomaticaModule: la purga automática por
 *   retención ya corre en el proceso "backend" (instancia 0, ver la
 *   guarda en limpieza-automatica.service.ts) -- si el trabajador
 *   también la cargara, correría una TERCERA vez en paralelo.
 * - ThrottlerModule: el límite de peticiones no aplica a un proceso
 *   que nunca recibe peticiones HTTP de nadie.
 *
 * Sí se mantiene SentryModule (útil para monitorear errores de este
 * proceso también) y ConfigModule (para que las mismas variables de
 * entorno se validen igual aquí).
 */
@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: environmentValidationSchema,
    }),
    PrismaModule,
    TrabajosGeneracionModule,
  ],
})
export class WorkerModule {}
