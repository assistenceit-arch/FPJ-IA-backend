import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ProcedimientoAccesoService } from '../procedimientos/procedimiento-acceso.service';
import { CrearTestigoDto } from './dto/crear-testigo.dto';
import { ActualizarTestigoDto } from './dto/actualizar-testigo.dto';

@Injectable()
export class TestigosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly acceso: ProcedimientoAccesoService,
  ) {}

  /**
   * Mismo criterio que CapturadosService.resolverEdadYTipo: a lo sumo uno
   * de fechaNacimiento/edadManual. Para testigos la edad no determina
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

  private prepararDatos<T extends CrearTestigoDto | ActualizarTestigoDto>(dto: T) {
    const { edadManual: _edadManual, ...resto } = dto as T & { edadManual?: number };
    const { edad, fechaNacimiento } = this.resolverEdad(dto);
    return { ...resto, edad, fechaNacimiento };
  }

  async crear(
    procedimientoId: string,
    dto: CrearTestigoDto,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.acceso.verificarNoBloqueado(procedimientoId);
    await this.acceso.verificarPagoComplejoAprobado(procedimientoId);

    const datos = this.prepararDatos(dto);

    const testigo = await this.prisma.testigo.create({
      data: { ...datos, procedimientoId },
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: 'Crear',
      tablaAfectada: 'testigos',
      registroAfectado: testigo.id,
      descripcionEvento: `Registro de testigo en el procedimiento ${procedimientoId}`,
      procedimientoId,
    });

    return testigo;
  }

  async listar(procedimientoId: string, usuarioId: string, rol?: string) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);

    return this.prisma.testigo.findMany({
      where: { procedimientoId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async obtener(procedimientoId: string, testigoId: string, usuarioId: string, rol?: string) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    return this.obtenerTestigoOFallar(procedimientoId, testigoId);
  }

  async actualizar(
    procedimientoId: string,
    testigoId: string,
    dto: ActualizarTestigoDto,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.acceso.verificarNoBloqueado(procedimientoId);
    await this.acceso.verificarPagoComplejoAprobado(procedimientoId);
    const existente = await this.obtenerTestigoOFallar(procedimientoId, testigoId);

    // Si el DTO no toca ni fechaNacimiento ni edadManual, se conserva lo
    // que ya había (actualización parcial), igual criterio que Capturado.
    const tocaEdad = dto.fechaNacimiento !== undefined || dto.edadManual !== undefined;
    const { edad, fechaNacimiento } = tocaEdad
      ? this.resolverEdad(dto)
      : { edad: existente.edad, fechaNacimiento: existente.fechaNacimiento };

    const { edadManual: _edadManual, ...resto } = dto as ActualizarTestigoDto & {
      edadManual?: number;
    };

    const actualizado = await this.prisma.testigo.update({
      where: { id: testigoId },
      data: { ...resto, edad, fechaNacimiento },
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: 'Modificar',
      tablaAfectada: 'testigos',
      registroAfectado: actualizado.id,
      descripcionEvento: `Actualización del testigo ${actualizado.id}`,
      procedimientoId,
    });

    return actualizado;
  }

  async eliminar(
    procedimientoId: string,
    testigoId: string,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.acceso.verificarNoBloqueado(procedimientoId);
    await this.acceso.verificarPagoComplejoAprobado(procedimientoId);
    await this.obtenerTestigoOFallar(procedimientoId, testigoId);

    // A diferencia de Capturado, un testigo nunca tiene elementos ni
    // documentos generados asociados directamente -- no hay verificación
    // de integridad equivalente a la RI-002 de intervinientes.
    await this.prisma.testigo.delete({ where: { id: testigoId } });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: 'Eliminar',
      tablaAfectada: 'testigos',
      registroAfectado: testigoId,
      descripcionEvento: `Eliminación del testigo ${testigoId}`,
      procedimientoId,
    });

    return { eliminado: true };
  }

  private async obtenerTestigoOFallar(procedimientoId: string, testigoId: string) {
    const testigo = await this.prisma.testigo.findUnique({ where: { id: testigoId } });

    if (!testigo || testigo.procedimientoId !== procedimientoId) {
      throw new NotFoundException('Testigo no encontrado');
    }

    return testigo;
  }
}
