import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConsultarEstadisticasDto } from './dto/consultar-estadisticas.dto';

/**
 * Estadísticas agregadas para el panel de administrador -- a solicitud
 * del usuario (03-sep, segunda versión, reemplaza la primera): 6
 * métricas exactas, ni una más -- departamento, municipio,
 * localidad/comuna, estación, delito, y tipo de procedimiento
 * (estándar/complejo). Todo filtrable por un rango de fechas.
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

    const [porDelito, porTipo, procedimientosConEstacion, procedimientosConLugar] =
      await Promise.all([
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
        // La estación vive en FuncionarioActuante (1:1 con Procedimiento,
        // llenada en el Bloque 1), no directamente en Procedimiento --
        // Prisma no permite agrupar por un campo de una relación en
        // groupBy(), así que se trae la lista y se agrupa a mano abajo.
        this.prisma.procedimiento.findMany({
          where,
          select: { funcionarioActuante: { select: { estacion: true } } },
        }),
        // Mismo caso para departamento/municipio/localidad -- viven en
        // LugarProcedimiento (1:1, llenada en el Bloque de "Lugar") --
        // se traen los 3 campos de una sola vez, en vez de 3 consultas
        // separadas.
        this.prisma.procedimiento.findMany({
          where,
          select: {
            lugarProcedimiento: {
              select: { departamento: true, municipio: true, localidad: true },
            },
          },
        }),
      ]);

    const conteoEstaciones = new Map<string, number>();
    for (const p of procedimientosConEstacion) {
      // Bloque 1 puede no estar diligenciado todavía (es opcional hasta
      // que el funcionario lo llena) -- esos procedimientos cuentan
      // como "Sin especificar" en vez de desaparecer de la estadística.
      const estacion = p.funcionarioActuante?.estacion ?? 'Sin especificar';
      conteoEstaciones.set(estacion, (conteoEstaciones.get(estacion) ?? 0) + 1);
    }

    // Mismo criterio "Sin especificar" para los 3 campos de ubicación
    // -- el Bloque de Lugar también es opcional hasta que se
    // diligencia. localidad además puede quedar vacía aun con el
    // bloque lleno (es opcional dentro del propio bloque).
    const conteoDepartamentos = new Map<string, number>();
    const conteoMunicipios = new Map<string, number>();
    const conteoLocalidades = new Map<string, number>();
    for (const p of procedimientosConLugar) {
      const lugar = p.lugarProcedimiento;
      const departamento = lugar?.departamento ?? 'Sin especificar';
      const municipio = lugar?.municipio ?? 'Sin especificar';
      const localidad = lugar?.localidad ?? 'Sin especificar';
      conteoDepartamentos.set(departamento, (conteoDepartamentos.get(departamento) ?? 0) + 1);
      conteoMunicipios.set(municipio, (conteoMunicipios.get(municipio) ?? 0) + 1);
      conteoLocalidades.set(localidad, (conteoLocalidades.get(localidad) ?? 0) + 1);
    }

    const aArregloOrdenado = (mapa: Map<string, number>, clave: string) =>
      Array.from(mapa.entries())
        .map(([valor, cantidad]) => ({ [clave]: valor, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);

    const total = porDelito.reduce((suma, d) => suma + d._count._all, 0);

    return {
      total,
      porDelito: porDelito.map((d) => ({ delito: d.delito, cantidad: d._count._all })),
      porTipo: porTipo.map((t) => ({ tipo: t.tipoProcedimiento, cantidad: t._count._all })),
      porEstacion: Array.from(conteoEstaciones.entries())
        .map(([estacion, cantidad]) => ({ estacion, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad),
      porDepartamento: aArregloOrdenado(conteoDepartamentos, 'departamento'),
      porMunicipio: aArregloOrdenado(conteoMunicipios, 'municipio'),
      porLocalidad: aArregloOrdenado(conteoLocalidades, 'localidad'),
    };
  }
}
