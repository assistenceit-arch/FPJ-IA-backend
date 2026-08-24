import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { GuardarFuncionarioActuanteDto } from './dto/guardar-funcionario-actuante.dto';

@Injectable()
export class FuncionarioActuanteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Confirma que el procedimiento existe, está activo y pertenece al
   * usuario autenticado. Reutilizado por todos los submódulos del
   * procedimiento (funcionario, compañero, lugar, capturados, etc.).
   *
   * Adenda 2026-08-08: un ADMINISTRADOR puede entrar a cualquier
   * procedimiento, no solo a los propios.
   */
  private async verificarProcedimiento(procedimientoId: string, usuarioId: string, rol?: string) {
    const procedimiento = await this.prisma.procedimiento.findUnique({
      where: { id: procedimientoId },
    });

    if (!procedimiento || !procedimiento.activo) {
      throw new NotFoundException('Procedimiento no encontrado');
    }
    if (rol !== 'ADMINISTRADOR' && procedimiento.usuarioId !== usuarioId) {
      throw new ForbiddenException(
        'No tiene autorización para modificar este procedimiento.',
      );
    }
    return procedimiento;
  }

  /**
   * Adenda 2026-08-06: en cuanto el procedimiento generó al menos un
   * documento oficial, se congela esta información -- de lo contrario
   * se podía editar y volver a generar documentos con contenido
   * distinto al ya usado oficialmente.
   */
  private async verificarNoBloqueado(procedimientoId: string) {
    const cantidadGenerados = await this.prisma.documentoGenerado.count({
      where: { procedimientoId },
    });
    if (cantidadGenerados > 0) {
      throw new ForbiddenException(
        'Este procedimiento ya generó documentos oficiales y quedó bloqueado para edición. Solo se pueden descargar los documentos existentes.',
      );
    }
  }

  /**
   * Adenda 2026-08-08: en un procedimiento COMPLEJO, los Bloques 1 a 7
   * quedan deshabilitados hasta que un administrador verifique el pago.
   */
  private async verificarPagoComplejoAprobado(procedimientoId: string) {
    const procedimiento = await this.prisma.procedimiento.findUnique({
      where: { id: procedimientoId },
    });
    if (!procedimiento) return;
    if (procedimiento.tipoProcedimiento !== 'COMPLEJO' || procedimiento.exoneradoPago) return;

    const pago = await this.prisma.pago.findUnique({ where: { procedimientoId } });
    if (!pago || pago.estadoPago !== 'Verificado') {
      throw new ForbiddenException(
        'Este es un procedimiento complejo: debe quedar el pago Verificado por un administrador antes de poder diligenciar el resto de la información. Adjunte el comprobante en el Bloque 8.',
      );
    }
  }

  async obtener(procedimientoId: string, usuarioId: string, rol?: string) {
    await this.verificarProcedimiento(procedimientoId, usuarioId, rol);

    return this.prisma.funcionarioActuante.findUnique({
      where: { procedimientoId },
    });
  }

  /**
   * WF-M1-004/005: no existen botones manuales de guardado. Este método
   * crea el registro si no existe, o lo actualiza si ya existe.
   */
  async guardar(
    procedimientoId: string,
    dto: GuardarFuncionarioActuanteDto,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    await this.verificarProcedimiento(procedimientoId, usuarioId, rol);
    await this.verificarNoBloqueado(procedimientoId);
    await this.verificarPagoComplejoAprobado(procedimientoId);

    const existente = await this.prisma.funcionarioActuante.findUnique({
      where: { procedimientoId },
    });

    // Adenda 2026-08-03: dto ya es todo opcional (borrador parcial). Las
    // columnas de texto son NOT NULL en la base de datos (aceptan cadena
    // vacía, pero no "undefined"), así que se rellenan con '' por si el
    // llamador no las envía todas. correo/cai sí admiten null en la BD.
    const datos = {
      nombreCompleto: dto.nombreCompleto ?? '',
      documento: dto.documento ?? '',
      entidad: dto.entidad ?? '',
      cargo: dto.cargo ?? '',
      telefono: dto.telefono ?? '',
      correo: dto.correo ?? '',
      placa: dto.placa ?? '',
      zonaAtencion: dto.zonaAtencion ?? '',
      estacion: dto.estacion ?? '',
      servicio: dto.servicio ?? '',
      cai: dto.cai || null,
    };

    const resultado = await this.prisma.funcionarioActuante.upsert({
      where: { procedimientoId },
      create: { ...datos, procedimientoId },
      update: datos,
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: existente ? 'Modificar' : 'Crear',
      tablaAfectada: 'funcionario_actuante',
      registroAfectado: resultado.id,
      descripcionEvento: `${existente ? 'Actualización' : 'Registro'} del funcionario actuante del procedimiento ${procedimientoId}`,
      procedimientoId,
    });

    return resultado;
  }
}
