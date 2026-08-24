import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ProcedimientoAccesoService } from '../procedimientos/procedimiento-acceso.service';
import { CrearVictimaDto } from './dto/crear-victima.dto';
import { ActualizarVictimaDto } from './dto/actualizar-victima.dto';

@Injectable()
export class VictimasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly acceso: ProcedimientoAccesoService,
  ) {}

  /**
   * Mismo criterio que CapturadosService.resolverEdadYTipo: a lo sumo uno
   * de fechaNacimiento/edadManual. Para víctimas la edad no determina
   * ninguna condición jurídica (no aplica Capturado/Aprehendido), así que
   * simplemente se resuelve el valor a guardar en la columna `edad`.
   */
  private resolverEdad(dto: {
    fechaNacimiento?: string;
    edadManual?: number;
  }): { edad: number | null; fechaNacimiento: Date | null } {
    if (dto.fechaNacimiento !== undefined && dto.edadManual !== undefined) {
      throw new BadRequestException(
        'No se puede enviar fecha de nacimiento y edad manual al mismo tiempo; use una de las dos opciones.',
      );
    }

    if (dto.edadManual !== undefined) {
      return { edad: dto.edadManual, fechaNacimiento: null };
    }

    if (dto.fechaNacimiento !== undefined) {
      const nacimiento = new Date(dto.fechaNacimiento);
      const hoy = new Date();
      let edad = hoy.getFullYear() - nacimiento.getFullYear();
      const aunNoCumpleAnios =
        hoy.getMonth() < nacimiento.getMonth() ||
        (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
      if (aunNoCumpleAnios) edad -= 1;
      return { edad, fechaNacimiento: nacimiento };
    }

    return { edad: null, fechaNacimiento: null };
  }

  private prepararDatos<T extends CrearVictimaDto | ActualizarVictimaDto>(dto: T) {
    const { edadManual: _edadManual, ...resto } = dto as T & { edadManual?: number };
    const { edad, fechaNacimiento } = this.resolverEdad(dto);
    return { ...resto, edad, fechaNacimiento };
  }

  async crear(
    procedimientoId: string,
    dto: CrearVictimaDto,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.acceso.verificarNoBloqueado(procedimientoId);
    await this.acceso.verificarPagoComplejoAprobado(procedimientoId);

    const datos = this.prepararDatos(dto);

    const victima = await this.prisma.victima.create({
      data: { ...datos, procedimientoId },
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: 'Crear',
      tablaAfectada: 'victimas',
      registroAfectado: victima.id,
      descripcionEvento: `Registro de víctima en el procedimiento ${procedimientoId}`,
      procedimientoId,
    });

    return victima;
  }

  async listar(procedimientoId: string, usuarioId: string, rol?: string) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);

    return this.prisma.victima.findMany({
      where: { procedimientoId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async obtener(procedimientoId: string, victimaId: string, usuarioId: string, rol?: string) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    return this.obtenerVictimaOFallar(procedimientoId, victimaId);
  }

  async actualizar(
    procedimientoId: string,
    victimaId: string,
    dto: ActualizarVictimaDto,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.acceso.verificarNoBloqueado(procedimientoId);
    await this.acceso.verificarPagoComplejoAprobado(procedimientoId);
    const existente = await this.obtenerVictimaOFallar(procedimientoId, victimaId);

    // Si el DTO no toca ni fechaNacimiento ni edadManual, se conserva lo
    // que ya había (actualización parcial), igual criterio que Capturado.
    const tocaEdad = dto.fechaNacimiento !== undefined || dto.edadManual !== undefined;
    const { edad, fechaNacimiento } = tocaEdad
      ? this.resolverEdad(dto)
      : { edad: existente.edad, fechaNacimiento: existente.fechaNacimiento };

    const { edadManual: _edadManual, ...resto } = dto as ActualizarVictimaDto & {
      edadManual?: number;
    };

    const actualizado = await this.prisma.victima.update({
      where: { id: victimaId },
      data: { ...resto, edad, fechaNacimiento },
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: 'Modificar',
      tablaAfectada: 'victimas',
      registroAfectado: actualizado.id,
      descripcionEvento: `Actualización de la víctima ${actualizado.id}`,
      procedimientoId,
    });

    return actualizado;
  }

  async eliminar(
    procedimientoId: string,
    victimaId: string,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.acceso.verificarNoBloqueado(procedimientoId);
    await this.acceso.verificarPagoComplejoAprobado(procedimientoId);
    await this.obtenerVictimaOFallar(procedimientoId, victimaId);

    // A diferencia de Capturado, eliminar una víctima no requiere
    // verificación de integridad documental (RI-002): no genera
    // documentos propios. Si tenía elementos vinculados (victimaId),
    // el onDelete: SetNull del schema los desvincula automáticamente
    // en vez de bloquear o arrastrar la eliminación -- el elemento en
    // sí permanece intacto, solo pierde el dato de a quién se le
    // hurtó.
    await this.prisma.victima.delete({ where: { id: victimaId } });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: 'Eliminar',
      tablaAfectada: 'victimas',
      registroAfectado: victimaId,
      descripcionEvento: `Eliminación de la víctima ${victimaId}`,
      procedimientoId,
    });

    return { eliminado: true };
  }

  private async obtenerVictimaOFallar(procedimientoId: string, victimaId: string) {
    const victima = await this.prisma.victima.findUnique({ where: { id: victimaId } });

    if (!victima || victima.procedimientoId !== procedimientoId) {
      throw new NotFoundException('Víctima no encontrada');
    }

    return victima;
  }
}
