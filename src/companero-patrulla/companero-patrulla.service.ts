import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ProcedimientoAccesoService } from '../procedimientos/procedimiento-acceso.service';
import { GuardarCompaneroPatrullaDto } from './dto/guardar-companero-patrulla.dto';

@Injectable()
export class CompaneroPatrullaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly acceso: ProcedimientoAccesoService,
  ) {}

  async obtener(procedimientoId: string, usuarioId: string, rol?: string) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);

    return this.prisma.companeroPatrulla.findUnique({
      where: { procedimientoId },
    });
  }

  async guardar(
    procedimientoId: string,
    dto: GuardarCompaneroPatrullaDto,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.acceso.verificarNoBloqueado(procedimientoId);
    await this.acceso.verificarPagoComplejoAprobado(procedimientoId);

    const existente = await this.prisma.companeroPatrulla.findUnique({
      where: { procedimientoId },
    });

    // Adenda 2026-08-03: dto ya es todo opcional (borrador parcial). Las
    // columnas nombreCompleto/documento/placa son NOT NULL en la base de
    // datos (aceptan cadena vacía, pero no "undefined").
    const datos = {
      nombreCompleto: dto.nombreCompleto ?? '',
      documento: dto.documento ?? '',
      placa: dto.placa ?? '',
      grado: dto.grado,
    };

    const resultado = await this.prisma.companeroPatrulla.upsert({
      where: { procedimientoId },
      create: { ...datos, procedimientoId },
      update: datos,
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: existente ? 'Modificar' : 'Crear',
      tablaAfectada: 'companero_patrulla',
      registroAfectado: resultado.id,
      descripcionEvento: `${existente ? 'Actualización' : 'Registro'} del compañero de patrulla del procedimiento ${procedimientoId}`,
      procedimientoId,
    });

    return resultado;
  }

  async eliminar(procedimientoId: string, usuarioId: string, correoUsuario: string, rol?: string) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);

    const existente = await this.prisma.companeroPatrulla.findUnique({
      where: { procedimientoId },
    });

    if (!existente) {
      return null;
    }

    await this.prisma.companeroPatrulla.delete({ where: { procedimientoId } });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: 'Eliminar',
      tablaAfectada: 'companero_patrulla',
      registroAfectado: existente.id,
      descripcionEvento: `Se retiró el compañero de patrulla del procedimiento ${procedimientoId} (UI-015: es opcional)`,
      procedimientoId,
    });

    return { eliminado: true };
  }
}
