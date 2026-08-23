import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

// Adenda 2026-08-23: política de retención de datos definida con el
// usuario -- todo procedimiento se elimina físicamente 7 días
// calendario después de su fecha de creación (fechaCreacion), sin
// excepción: sin importar si quedó en Borrador o Finalizado, y sin que
// un desbloqueo de edición por un administrador reinicie o extienda el
// plazo. Las cuentas de usuario (Usuario) NO se ven afectadas -- esto
// solo borra Procedimiento y todo lo que cuelga de él en cascada
// (funcionario, compañero, lugar, actuaciones, capturados, testigos,
// víctimas, elementos incautados, documentos generados, pago).
//
// Esto reemplaza, para Procedimiento específicamente, el principio
// AT-005/RT-006 de "no eliminación física" que rige el resto del
// sistema -- es un cambio de política consciente y explícito del
// usuario, no un descuido: los datos de un procedimiento (identidad de
// capturados, víctimas, menores de edad) son demasiado sensibles para
// conservarlos indefinidamente en la plataforma, que es una
// herramienta de generación documental, no el archivo oficial
// permanente.
//
// El registro de auditoría (AuditoriaEvento) SÍ sigue la regla de no
// eliminación -- y como nunca tuvo una relación de llave foránea real
// hacia Procedimiento (registroAfectado es un string plano, no una FK),
// el borrado en cascada de este documento nunca lo toca. Se deja
// constancia de cada borrado automático con un evento de auditoría
// antes de ejecutarlo, igual que cualquier otra eliminación en el
// sistema.
const DIAS_RETENCION = 7;
const USUARIO_SISTEMA = 'sistema (borrado automático por política de retención)';

@Injectable()
export class LimpiezaAutomaticaService {
  private readonly logger = new Logger(LimpiezaAutomaticaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // Corre cada hora -- suficiente precisión para que un procedimiento no
  // sobreviva más de ~1 hora de más allá de su plazo de 7 días exactos,
  // sin ser una carga real para la base de datos (la consulta es
  // liviana: un solo filtro por fecha).
  @Cron(CronExpression.EVERY_HOUR)
  async purgarProcedimientosVencidos() {
    const limite = new Date();
    limite.setDate(limite.getDate() - DIAS_RETENCION);

    const vencidos = await this.prisma.procedimiento.findMany({
      where: { fechaCreacion: { lte: limite } },
      select: { id: true, numeroInterno: true, delito: true, estado: true },
    });

    if (vencidos.length === 0) return;

    this.logger.log(`Purga automática: ${vencidos.length} procedimiento(s) vencido(s) por retención de 7 días.`);

    for (const procedimiento of vencidos) {
      try {
        // Se registra ANTES de borrar (mismo orden que RN-007 exige para
        // cualquier otra acción: constancia de que la acción ocurrió).
        // No se incluye ningún dato personal -- solo el identificador,
        // el delito (no es dato personal) y el estado en que se
        // encontraba, igual que el resto de descripciones de auditoría
        // del sistema.
        await this.auditoria.registrar({
          usuario: USUARIO_SISTEMA,
          accion: 'Eliminar',
          tablaAfectada: 'procedimientos',
          registroAfectado: procedimiento.id,
          descripcionEvento: `Borrado automático por política de retención (7 días): procedimiento ${procedimiento.numeroInterno ?? procedimiento.id}, delito ${procedimiento.delito}, estado ${procedimiento.estado} al momento del borrado.`,
        });

        await this.prisma.procedimiento.delete({ where: { id: procedimiento.id } });
      } catch (error) {
        // Un fallo en un procedimiento no debe detener la purga de los
        // demás -- se registra y se continúa con el resto.
        this.logger.error(
          `No fue posible borrar el procedimiento ${procedimiento.id} en la purga automática.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
