import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentosService } from '../documentos/documentos.service';
import { ProcedimientoAccesoService } from '../procedimientos/procedimiento-acceso.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AclaracionRequeridaException } from '../documentos/excepciones/aclaracion-requerida.exception';
import { CrearTrabajoGeneracionDto } from './dto/crear-trabajo-generacion.dto';

@Injectable()
export class TrabajosGeneracionService {
  private readonly logger = new Logger(TrabajosGeneracionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: ProcedimientoAccesoService,
    private readonly documentos: DocumentosService,
    private readonly usuarios: UsuariosService,
  ) {}

  /**
   * Crea el trabajo pendiente y responde de inmediato -- la generación
   * real la hace el proceso trabajador (ver src/worker.ts), no esta
   * misma petición HTTP. Se verifica la propiedad del procedimiento
   * aquí también (no solo cuando el trabajador lo procese), para poder
   * rechazar de inmediato una solicitud que claramente no debería
   * proceder, en vez de dejar que el funcionario espere por nada.
   */
  async crear(procedimientoId: string, dto: CrearTrabajoGeneracionDto, usuarioId: string, rol?: string) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);

    const trabajo = await this.prisma.trabajoGeneracion.create({
      data: {
        tipoDocumento: dto.tipoDocumento,
        procedimientoId,
        capturadoId: dto.capturadoId,
        elementoId: dto.elementoId,
        aclaraciones: dto.aclaraciones ? JSON.stringify(dto.aclaraciones) : null,
        usuarioId,
        estado: 'Pendiente',
      },
    });

    return { id: trabajo.id, estado: trabajo.estado };
  }

  /**
   * Consulta de estado (polling) -- el frontend llama esto cada pocos
   * segundos hasta ver "Completado", "Fallido", o "RequiereAclaracion".
   */
  async consultar(id: string, usuarioId: string, rol?: string) {
    const trabajo = await this.prisma.trabajoGeneracion.findUnique({ where: { id } });
    if (!trabajo) {
      throw new NotFoundException('Trabajo de generación no encontrado.');
    }
    if (trabajo.usuarioId !== usuarioId && rol !== 'ADMINISTRADOR') {
      throw new ForbiddenException('No tienes acceso a este trabajo de generación.');
    }

    return {
      id: trabajo.id,
      estado: trabajo.estado,
      preguntaAclaracion: trabajo.preguntaAclaracion,
      documentoGeneradoId: trabajo.documentoGeneradoId,
      mensajeError: trabajo.mensajeError,
    };
  }

  /**
   * Exclusivo del FPJ-5: el funcionario responde la pregunta de
   * aclaración, la respuesta se agrega (en orden) al arreglo ya
   * acumulado, y el trabajo vuelve a "Pendiente" para que el
   * trabajador lo reintente con esa información nueva.
   */
  async responderAclaracion(id: string, respuesta: string, usuarioId: string, rol?: string) {
    const trabajo = await this.prisma.trabajoGeneracion.findUnique({ where: { id } });
    if (!trabajo) {
      throw new NotFoundException('Trabajo de generación no encontrado.');
    }
    if (trabajo.usuarioId !== usuarioId && rol !== 'ADMINISTRADOR') {
      throw new ForbiddenException('No tienes acceso a este trabajo de generación.');
    }
    if (trabajo.estado !== 'RequiereAclaracion') {
      throw new ForbiddenException('Este trabajo no está esperando ninguna aclaración en este momento.');
    }

    const aclaracionesPrevias: string[] = trabajo.aclaraciones ? JSON.parse(trabajo.aclaraciones) : [];
    const aclaracionesNuevas = [...aclaracionesPrevias, respuesta];

    await this.prisma.trabajoGeneracion.update({
      where: { id },
      data: {
        estado: 'Pendiente',
        aclaraciones: JSON.stringify(aclaracionesNuevas),
        preguntaAclaracion: null,
      },
    });

    return { id, estado: 'Pendiente' };
  }

  /**
   * El corazón del trabajador (ver src/worker.ts, que llama esto en un
   * ciclo continuo). Toma el pendiente MÁS VIEJO, lo marca como
   * "Procesando" de forma segura (si otro proceso ya lo tomó primero,
   * updateMany afecta 0 filas y este ciclo simplemente no hace nada),
   * y lo procesa.
   */
  async procesarSiguientePendiente(): Promise<boolean> {
    const candidato = await this.prisma.trabajoGeneracion.findFirst({
      where: { estado: 'Pendiente' },
      orderBy: { createdAt: 'asc' },
    });
    if (!candidato) return false;

    const reclamado = await this.prisma.trabajoGeneracion.updateMany({
      where: { id: candidato.id, estado: 'Pendiente' },
      data: { estado: 'Procesando' },
    });
    if (reclamado.count === 0) return false; // otro proceso ya lo tomó

    this.logger.log(`Procesando trabajo ${candidato.id} (${candidato.tipoDocumento})...`);

    try {
      const usuario = await this.usuarios.buscarPorId(candidato.usuarioId);
      const correoUsuario = usuario?.correo ?? candidato.usuarioId;
      const aclaraciones: string[] = candidato.aclaraciones ? JSON.parse(candidato.aclaraciones) : [];

      const documento = await this.generarSegunTipo(candidato, correoUsuario, aclaraciones);

      await this.prisma.trabajoGeneracion.update({
        where: { id: candidato.id },
        data: { estado: 'Completado', documentoGeneradoId: documento.id },
      });
      this.logger.log(`Trabajo ${candidato.id} completado -- documento ${documento.id}.`);
    } catch (error) {
      if (error instanceof AclaracionRequeridaException) {
        const respuesta = error.getResponse() as { pregunta?: string };
        await this.prisma.trabajoGeneracion.update({
          where: { id: candidato.id },
          data: { estado: 'RequiereAclaracion', preguntaAclaracion: respuesta.pregunta ?? 'Se requiere una aclaración.' },
        });
        this.logger.log(`Trabajo ${candidato.id} requiere aclaración del funcionario.`);
      } else {
        const mensaje = error instanceof Error ? error.message : 'Error desconocido al generar el documento.';
        await this.prisma.trabajoGeneracion.update({
          where: { id: candidato.id },
          data: { estado: 'Fallido', mensajeError: mensaje },
        });
        this.logger.error(`Trabajo ${candidato.id} falló: ${mensaje}`, error instanceof Error ? error.stack : undefined);
      }
    }

    return true; // había un trabajo, sea cual sea el resultado -- seguir revisando de inmediato
  }

  private async generarSegunTipo(
    trabajo: { tipoDocumento: string; procedimientoId: string; capturadoId: string | null; elementoId: string | null; usuarioId: string },
    correoUsuario: string,
    aclaraciones: string[],
  ) {
    switch (trabajo.tipoDocumento) {
      case 'FPJ5':
        return this.documentos.generarFpj5Informe(trabajo.procedimientoId, trabajo.usuarioId, correoUsuario, aclaraciones);
      case 'FPJ6':
        return this.documentos.generarFpj6ActaDerechos(trabajo.procedimientoId, trabajo.capturadoId!, trabajo.usuarioId, correoUsuario);
      case 'ACTA':
        return this.documentos.generarActaIncautacion(trabajo.procedimientoId, trabajo.capturadoId!, trabajo.usuarioId, correoUsuario);
      case 'ACTA_COLECTIVA':
        return this.documentos.generarActaIncautacionColectiva(trabajo.procedimientoId, trabajo.usuarioId, correoUsuario);
      case 'FPJ7':
        return this.documentos.generarFpj7Rotulo(trabajo.procedimientoId, trabajo.elementoId!, trabajo.usuarioId, correoUsuario);
      case 'FPJ8':
        return this.documentos.generarFpj8CadenaCustodia(trabajo.procedimientoId, trabajo.elementoId!, trabajo.usuarioId, correoUsuario);
      default:
        throw new Error(`Tipo de documento desconocido: ${trabajo.tipoDocumento}`);
    }
  }
}
