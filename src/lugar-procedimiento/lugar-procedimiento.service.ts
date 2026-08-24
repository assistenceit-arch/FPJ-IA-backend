import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ProcedimientoAccesoService } from '../procedimientos/procedimiento-acceso.service';
import { GuardarLugarProcedimientoDto } from './dto/guardar-lugar-procedimiento.dto';

@Injectable()
export class LugarProcedimientoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly acceso: ProcedimientoAccesoService,
  ) {}

  async obtener(procedimientoId: string, usuarioId: string, rol?: string) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);

    return this.prisma.lugarProcedimiento.findUnique({
      where: { procedimientoId },
    });
  }

  async guardar(
    procedimientoId: string,
    dto: GuardarLugarProcedimientoDto,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.acceso.verificarNoBloqueado(procedimientoId);
    await this.acceso.verificarPagoComplejoAprobado(procedimientoId);

    const existente = await this.prisma.lugarProcedimiento.findUnique({
      where: { procedimientoId },
    });

    // Adenda 2026-08-03: dto ya es todo opcional (borrador parcial). Las
    // columnas departamento/municipio/barrio/direccion son NOT NULL en la
    // base de datos (aceptan cadena vacía, pero no "undefined"), así que
    // se rellenan con '' por si el llamador no las envía todas.
    const datos = {
      departamento: dto.departamento ?? '',
      municipio: dto.municipio ?? '',
      localidad: dto.localidad,
      barrio: dto.barrio ?? '',
      direccion: dto.direccion ?? '',
      caracteristicas: dto.caracteristicas,
    };

    const resultado = await this.prisma.lugarProcedimiento.upsert({
      where: { procedimientoId },
      create: { ...datos, procedimientoId },
      update: datos,
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: existente ? 'Modificar' : 'Crear',
      tablaAfectada: 'lugares_procedimiento',
      registroAfectado: resultado.id,
      descripcionEvento: `${existente ? 'Actualización' : 'Registro'} del lugar del procedimiento ${procedimientoId}`,
      procedimientoId,
    });

    return resultado;
  }
}
