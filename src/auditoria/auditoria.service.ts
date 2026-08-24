import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AccionAuditoria =
  | 'Crear'
  | 'Modificar'
  | 'Eliminar'
  | 'Regenerar'
  | 'Anular';

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un evento de auditoría. RT-007: toda modificación debe generar
   * registro de auditoría. Esta tabla nunca se borra (AUDITORIA_EVENTOS).
   *
   * Adenda 2026-08-24: procedimientoId y numeroInterno identifican el
   * número de caso (ej. EST-2026-000015) del evento -- a solicitud del
   * usuario, para no depender del texto libre de descripcionEvento
   * (hasta ahora inconsistente entre los distintos módulos: algunos
   * mencionaban el numeroInterno, otros solo el id técnico). Si el
   * llamador ya conoce numeroInterno (por ejemplo, LimpiezaAutomaticaService
   * ya lo trae cargado), puede pasarlo directamente y se evita una
   * consulta adicional; si solo tiene procedimientoId, aquí se resuelve
   * automáticamente con una consulta a Procedimiento.
   */
  async registrar(params: {
    usuario: string; // correo o id del usuario que ejecuta la acción
    accion: AccionAuditoria;
    tablaAfectada: string;
    registroAfectado: string;
    descripcionEvento: string;
    procedimientoId?: string;
    numeroInterno?: string;
  }) {
    let numeroInterno = params.numeroInterno ?? null;
    if (!numeroInterno && params.procedimientoId) {
      const procedimiento = await this.prisma.procedimiento.findUnique({
        where: { id: params.procedimientoId },
        select: { numeroInterno: true },
      });
      numeroInterno = procedimiento?.numeroInterno ?? null;
    }

    return this.prisma.auditoriaEvento.create({
      data: {
        usuario: params.usuario,
        accion: params.accion,
        tablaAfectada: params.tablaAfectada,
        registroAfectado: params.registroAfectado,
        descripcionEvento: params.descripcionEvento,
        procedimientoId: params.procedimientoId ?? null,
        numeroInterno,
      },
    });
  }

  // Adenda 2026-08-24: consulta paginada para el panel de administración
  // -- hasta ahora la única forma de ver estos registros era una
  // consulta SQL directa a la base de datos. `busqueda` filtra por
  // coincidencia parcial (insensible a mayúsculas) contra el número de
  // caso, el identificador del registro afectado, el usuario que
  // ejecutó la acción, o la descripción del evento -- cubre el caso más
  // común de "quiero ver todo lo que pasó con el procedimiento
  // EST-2026-000015" sin necesitar filtros separados.
  async listarPaginado(busqueda?: string, pagina = 1, porPagina = 20) {
    const where = busqueda
      ? {
          OR: [
            { numeroInterno: { contains: busqueda, mode: 'insensitive' as const } },
            { registroAfectado: { contains: busqueda, mode: 'insensitive' as const } },
            { usuario: { contains: busqueda, mode: 'insensitive' as const } },
            { descripcionEvento: { contains: busqueda, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [datos, total] = await Promise.all([
      this.prisma.auditoriaEvento.findMany({
        where,
        orderBy: { fechaEvento: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.auditoriaEvento.count({ where }),
    ]);

    return { datos, total, pagina, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) };
  }
}
