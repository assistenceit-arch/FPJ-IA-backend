import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { detectarTipoArchivoReal } from './validar-archivo.util';
import { ProcedimientoAccesoService } from '../procedimientos/procedimiento-acceso.service';
import { ConfiguracionPagosService } from '../configuracion-pagos/configuracion-pagos.service';
import { VerificarPagoDto } from './dto/verificar-pago.dto';

const ESTADO_INICIAL = 'Pendiente';

// El comprobante de la transferencia (adjunto obligatorio, Adenda
// 2026-08-05/06) se guarda en disco con el mismo patrón que los
// documentos generados (src/documentos/documentos.service.ts).
const CARPETA_COMPROBANTES = path.join(process.cwd(), 'storage', 'comprobantes-pago');
const TIPOS_PERMITIDOS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};
const TAMANO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class PagosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly acceso: ProcedimientoAccesoService,
    private readonly configuracionPagos: ConfiguracionPagosService,
  ) {}

  /**
   * Adenda 2026-08-06: el registro ya NO recibe ningún dato de texto del
   * funcionario (fecha/medio/referencia) -- a solicitud del usuario, el
   * único insumo es el comprobante adjunto; el administrador lee esos
   * datos directamente del archivo al revisar (ver
   * PagosController.verificar).
   */
  async registrar(
    procedimientoId: string,
    comprobante: Express.Multer.File | undefined,
    usuarioId: string,
    correoUsuario: string,
  ) {
    const procedimiento = await this.acceso.verificarPropiedad(
      procedimientoId,
      usuarioId,
    );

    if (!comprobante) {
      throw new BadRequestException(
        'Debe adjuntar el comprobante de la transferencia (imagen o PDF) donde se vea la fecha, el número de referencia y el valor del movimiento.',
      );
    }

    // Corrección 2026-09-03 (auditoría de seguridad, segunda ronda):
    // el filtro del controller solo revisa el tipo que el cliente
    // DECLARA (fácil de falsificar) -- aquí se revisa el contenido
    // REAL del archivo (sus primeros bytes), para confirmar que de
    // verdad es una imagen o un PDF, no cualquier otra cosa disfrazada.
    const tipoReal = detectarTipoArchivoReal(comprobante.buffer);
    if (!tipoReal) {
      throw new BadRequestException(
        'El archivo no parece ser una imagen (JPG, PNG) ni un PDF válido -- revisa que no esté corrupto o renombrado.',
      );
    }
    if (!TIPOS_PERMITIDOS[comprobante.mimetype]) {
      throw new BadRequestException(
        'El comprobante debe ser una imagen (JPG, PNG o WEBP) o un PDF.',
      );
    }
    if (comprobante.size > TAMANO_MAXIMO_BYTES) {
      throw new BadRequestException('El comprobante no puede superar los 10 MB.');
    }

    const existente = await this.prisma.pago.findUnique({
      where: { procedimientoId },
    });
    // Un pago Rechazado permite volver a registrar uno nuevo; solo se
    // bloquea si ya hay uno Pendiente o Verificado.
    if (existente && existente.estadoPago !== 'Rechazado') {
      throw new ConflictException(
        'Este procedimiento ya tiene un pago registrado. Consulte su estado en vez de crear uno nuevo.',
      );
    }

    const configuracion = await this.configuracionPagos.obtenerOFallar();
    const valor =
      procedimiento.tipoProcedimiento === 'COMPLEJO'
        ? configuracion.valorComplejo
        : configuracion.valorEstandar;

    const rutaComprobante = this.guardarComprobante(procedimientoId, comprobante);

    const datos = {
      valor,
      comprobantePago: rutaComprobante,
      estadoPago: ESTADO_INICIAL,
    };

    const pago = existente
      ? await this.prisma.pago.update({ where: { procedimientoId }, data: datos })
      : await this.prisma.pago.create({ data: { procedimientoId, ...datos } });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: existente ? 'Modificar' : 'Crear',
      tablaAfectada: 'pagos',
      registroAfectado: pago.id,
      descripcionEvento: `${existente ? 'Nuevo pago registrado (reintento tras rechazo anterior)' : 'Pago registrado'} por $${valor} para el procedimiento ${procedimientoId} (${procedimiento.tipoProcedimiento})`,
      procedimientoId,
    });

    return pago;
  }

  private guardarComprobante(procedimientoId: string, archivo: Express.Multer.File): string {
    const carpeta = path.join(CARPETA_COMPROBANTES, procedimientoId);
    fs.mkdirSync(carpeta, { recursive: true });
    const extension =
      path.extname(archivo.originalname) || TIPOS_PERMITIDOS[archivo.mimetype] || '';
    const nombreArchivo = `comprobante-${Date.now()}${extension}`;
    const rutaCompleta = path.join(carpeta, nombreArchivo);
    fs.writeFileSync(rutaCompleta, archivo.buffer);
    return rutaCompleta;
  }

  /**
   * Los administradores necesitan poder CONSULTAR el pago (y su
   * comprobante) de procedimientos que no son suyos para poder
   * revisarlos antes de aprobar/rechazar.
   */
  /**
   * Adenda 2026-08-08: se incluyen los datos del funcionario dueño del
   * procedimiento (nombres/apellidos/correo/telefono) para que un
   * administrador los vea también DENTRO del propio Bloque 8 del
   * procedimiento (antes solo estaban disponibles en el panel
   * centralizado /admin) -- necesarios para poder contactarlo antes de
   * aprobar/rechazar, especialmente en procedimientos complejos.
   */
  async obtener(procedimientoId: string, usuarioId: string, rol: string) {
    if (rol === 'ADMINISTRADOR') {
      await this.acceso.verificarExiste(procedimientoId);
    } else {
      await this.acceso.verificarPropiedad(procedimientoId, usuarioId);
    }
    return this.prisma.pago.findUnique({
      where: { procedimientoId },
      include: {
        procedimiento: {
          select: {
            usuario: { select: { nombres: true, apellidos: true, correo: true, telefono: true } },
          },
        },
      },
    });
  }

  async obtenerRutaComprobante(procedimientoId: string, usuarioId: string, rol: string) {
    if (rol === 'ADMINISTRADOR') {
      await this.acceso.verificarExiste(procedimientoId);
    } else {
      await this.acceso.verificarPropiedad(procedimientoId, usuarioId);
    }

    const pago = await this.prisma.pago.findUnique({ where: { procedimientoId } });
    if (!pago || !pago.comprobantePago) {
      throw new NotFoundException('Este procedimiento no tiene un comprobante de pago adjunto.');
    }
    if (!fs.existsSync(pago.comprobantePago)) {
      throw new NotFoundException('El archivo del comprobante no existe en el servidor.');
    }
    return pago.comprobantePago;
  }

  async verificar(
    procedimientoId: string,
    dto: VerificarPagoDto,
    usuarioId: string,
    correoUsuario: string,
  ) {
    await this.acceso.verificarExiste(procedimientoId);

    const pago = await this.prisma.pago.findUnique({ where: { procedimientoId } });
    if (!pago) {
      throw new NotFoundException('Este procedimiento no tiene un pago registrado.');
    }
    if (pago.estadoPago !== 'Pendiente') {
      throw new BadRequestException(
        `Este pago ya fue procesado (estado actual: ${pago.estadoPago}). No se puede verificar de nuevo.`,
      );
    }

    const actualizado = await this.prisma.pago.update({
      where: { procedimientoId },
      data: { estadoPago: dto.estadoPago },
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: 'Modificar',
      tablaAfectada: 'pagos',
      registroAfectado: actualizado.id,
      descripcionEvento: `Pago ${dto.estadoPago.toLowerCase()} para el procedimiento ${procedimientoId}${dto.observacion ? `: ${dto.observacion}` : ''}`,
      procedimientoId,
    });

    return actualizado;
  }

  /**
   * Panel de administración: vista centralizada de todos los pagos
   * Pendientes de cualquier funcionario, para no tener que entrar
   * procedimiento por procedimiento a buscarlos.
   */
  /**
   * Panel de administración: vista centralizada de todos los pagos
   * Pendientes de cualquier funcionario, para no tener que entrar
   * procedimiento por procedimiento a buscarlos. Incluye los datos de
   * contacto del funcionario (Adenda 2026-08-08: necesarios para que un
   * asesor pueda comunicarse tras aprobar un procedimiento COMPLEJO).
   */
  async listarPendientesAdmin() {
    return this.prisma.pago.findMany({
      where: { estadoPago: 'Pendiente' },
      orderBy: { createdAt: 'asc' },
      include: {
        procedimiento: {
          select: {
            id: true,
            numeroInterno: true,
            tipoProcedimiento: true,
            usuario: { select: { nombres: true, apellidos: true, correo: true, telefono: true } },
          },
        },
      },
    });
  }
}
