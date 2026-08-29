// Adenda 2026-08-29: debe ser la primera línea del archivo, mismo
// motivo que en main.ts -- Sentry necesita inicializarse antes que
// cualquier otro import.
import './instrument';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';
import { TrabajosGeneracionService } from './trabajos-generacion/trabajos-generacion.service';

const logger = new Logger('Trabajador');

/**
 * Proceso trabajador dedicado a generar documentos en segundo plano --
 * a solicitud del usuario, tras confirmar con una prueba de carga real
 * que generar un documento pesado podía dejar a otros funcionarios
 * esperando casi un minuto y medio por algo tan simple como consultar
 * su lista de procedimientos.
 *
 * NO abre ningún puerto HTTP -- createApplicationContext() arranca
 * todos los módulos (inyección de dependencias, conexión a la base de
 * datos) sin exponer ningún servidor web a nadie. Corre como su propio
 * proceso de PM2 (ver ecosystem/documentación de despliegue), separado
 * de los procesos "backend" que sí atienden peticiones -- así, generar
 * un documento nunca compite por el mismo espacio que el resto de la
 * aplicación.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const trabajos = app.get(TrabajosGeneracionService);

  logger.log('Trabajador de generación de documentos iniciado.');

  // Ciclo continuo: si había un trabajo pendiente, revisa de inmediato
  // por si hay otro (para vaciar la fila rápido si se acumuló trabajo);
  // si no había ninguno, espera 3 segundos antes de volver a
  // preguntar, para no golpear la base de datos sin necesidad.
  for (;;) {
    try {
      const habiaTrabajo = await trabajos.procesarSiguientePendiente();
      if (!habiaTrabajo) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } catch (error) {
      logger.error(
        'Error inesperado en el ciclo del trabajador -- continúa en el siguiente ciclo.',
        error instanceof Error ? error.stack : String(error),
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

void bootstrap();
