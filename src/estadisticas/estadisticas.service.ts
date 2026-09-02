import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConsultarEstadisticasDto } from './dto/consultar-estadisticas.dto';

/**
 * Estadísticas agregadas para el panel de administrador -- delitos más
 * generados, casos por funcionario, casos por estación, y
 * estándar vs. complejos, todo filtrable por un rango de fechas.
 *
 * Exclusivo de administradores (el guard vive en AdminController, que
 * es quien expone estos métodos).
 */
@Injectable()
export class EstadisticasService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(dto: ConsultarEstadisticasDto) {
    // RT-006/AT-005: los procedimientos nunca se eliminan físicamente,
    // solo se marcan `activo=false` -- las estadísticas deben excluir
    // esos, igual que el resto de la aplicación los excluye de las
    // listas normales.
    const where: {
      activo: boolean;
      fechaCreacion?: { gte?: Date; lte?: Date };
    } = { activo: true };

    if (dto.desde || dto.hasta) {
      where.fechaCreacion = {
        ...(dto.desde && { gte: new Date(dto.desde) }),
        ...(dto.hasta && { lte: new Date(dto.hasta) }),
      };
    }

    const [porDelito, porTipo, porFuncionario, procedimientosConEstacion] = await Promise.all([
      this.prisma.procedimiento.groupBy({
        by: ['delito'],
        where,
        _count: { _all: true },
        orderBy: { _count: { delito: 'desc' } },
      }),
      this.prisma.procedimiento.groupBy({
        by: ['tipoProcedimiento'],
        where,
        _count: { _all: true },
      }),
      this.prisma.procedimiento.groupBy({
        by: ['usuarioId'],
        where,
        _count: { _all: true },
        orderBy: { _count: { usuarioId: 'desc' } },
      }),
      // La estación vive en FuncionarioActuante (1:1 con Procedimiento,
      // llenada en el Bloque 1), no directamente en Procedimiento --
      // Prisma no permite agrupar por un campo de una relación en
      // groupBy(), así que se trae la lista y se agrupa a mano abajo.
      this.prisma.procedimiento.findMany({
        where,
        select: { funcionarioActuante: { select: { estacion: true } } },
      }),
    ]);

    // Nombres de funcionarios -- porFuncionario solo trae el usuarioId,
    // se resuelven los nombres en una segunda consulta puntual (más
    // simple y explícito que un join manual con groupBy).
    const idsFuncionarios = porFuncionario.map((f) => f.usuarioId);
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: idsFuncionarios } },
      select: { id: true, nombres: true, apellidos: true },
    });
    const nombrePorId = new Map(
      usuarios.map((u) => [u.id, `${u.nombres} ${u.apellidos ?? ''}`.trim()]),
    );

    const conteoEstaciones = new Map<string, number>();
    for (const p of procedimientosConEstacion) {
      // Bloque 1 puede no estar diligenciado todavía (es opcional hasta
      // que el funcionario lo llena) -- esos procedimientos cuentan
      // como "Sin especificar" en vez de desaparecer de la estadística.
      const estacion = p.funcionarioActuante?.estacion ?? 'Sin especificar';
      conteoEstaciones.set(estacion, (conteoEstaciones.get(estacion) ?? 0) + 1);
    }

    const total = porDelito.reduce((suma, d) => suma + d._count._all, 0);

    return {
      total,
      porDelito: porDelito.map((d) => ({ delito: d.delito, cantidad: d._count._all })),
      porTipo: porTipo.map((t) => ({ tipo: t.tipoProcedimiento, cantidad: t._count._all })),
      porFuncionario: porFuncionario
        .map((f) => ({
          funcionario: nombrePorId.get(f.usuarioId) ?? 'Desconocido',
          cantidad: f._count._all,
        }))
        .sort((a, b) => b.cantidad - a.cantidad),
      porEstacion: Array.from(conteoEstaciones.entries())
        .map(([estacion, cantidad]) => ({ estacion, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad),
    };
  }
}
