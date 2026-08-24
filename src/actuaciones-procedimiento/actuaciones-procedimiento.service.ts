import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ProcedimientoAccesoService } from '../procedimientos/procedimiento-acceso.service';
import { GuardarActuacionesDto } from './dto/guardar-actuaciones.dto';
import { calcularDemoraExistente, obtenerCapturaMasAntigua, validarOrdenFechas } from './demora.util';

@Injectable()
export class ActuacionesProcedimientoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly acceso: ProcedimientoAccesoService,
  ) {}

  async obtener(procedimientoId: string, usuarioId: string, rol?: string) {
    const procedimiento = await this.acceso.verificarPropiedad(
      procedimientoId,
      usuarioId,
      rol,
    );

    const [actuaciones, capturados] = await Promise.all([
      this.prisma.actuacionesProcedimiento.findUnique({ where: { procedimientoId } }),
      this.prisma.capturado.findMany({
        where: { procedimientoId },
        select: { fechaCaptura: true, horaCaptura: true },
      }),
    ]);

    if (!actuaciones) return null;

    // Adenda 2026-08-04: demoraExistente ya no se persiste — se calcula
    // aquí, en caliente, con las fechas/horas vigentes del procedimiento
    // en este momento. Ver demora.util.ts para el porqué.
    // Adenda 2026-08-21: la hora de captura ahora es individual por
    // interviniente (lectura de derechos) -- se usa la más antigua entre
    // todos, con el valor de creación del procedimiento como respaldo.
    const captura = obtenerCapturaMasAntigua(procedimiento, capturados);
    return {
      ...actuaciones,
      demoraExistente: calcularDemoraExistente({ ...procedimiento, ...captura }),
    };
  }

  async guardar(
    procedimientoId: string,
    dto: GuardarActuacionesDto,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    const procedimiento = await this.acceso.verificarPropiedad(
      procedimientoId,
      usuarioId,
      rol,
    );
    await this.acceso.verificarNoBloqueado(procedimientoId);
    await this.acceso.verificarPagoComplejoAprobado(procedimientoId);

    // Adenda 2026-08-21: la lectura de derechos (y la hora de captura que
    // de ahí se deriva) ya no se sincroniza aquí -- ahora es individual
    // por interviniente y se guarda directamente en Capturado (ver
    // CapturadosService). Este bloque conserva únicamente autoridad
    // receptora, demora, relato y las secciones de testigos/víctimas.
    const capturados = await this.prisma.capturado.findMany({
      where: { procedimientoId },
      select: { fechaCaptura: true, horaCaptura: true },
    });
    const captura = obtenerCapturaMasAntigua(procedimiento, capturados);

    // Valida que la puesta a disposición (si ya está diligenciada) no sea
    // anterior a la captura más antigua vigente. La demora en sí ya NO se
    // calcula ni se guarda aquí — ver obtener() y documentos.service.ts,
    // que la calculan al vuelo con demora.util.ts.
    validarOrdenFechas({ ...procedimiento, ...captura });

    const existente = await this.prisma.actuacionesProcedimiento.findUnique({
      where: { procedimientoId },
    });

    // autoridadReceptora es String NOT NULL en la base de datos (acepta
    // cadena vacía, pero no "undefined"); se normaliza aquí porque el dto
    // ya la admite opcional (borrador parcial). justificacionDemora se
    // guarda tal cual la escriba el usuario, sin importar si en este
    // momento aplica o no demora — así no se borra en silencio un texto
    // ya escrito si las fechas cambian después.
    const datos = {
      ...dto,
      autoridadReceptora: dto.autoridadReceptora ?? '',
    };

    const resultado = await this.prisma.actuacionesProcedimiento.upsert({
      where: { procedimientoId },
      create: { ...datos, procedimientoId },
      update: datos,
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: existente ? 'Modificar' : 'Crear',
      tablaAfectada: 'actuaciones_procedimiento',
      registroAfectado: resultado.id,
      descripcionEvento: `${existente ? 'Actualización' : 'Registro'} de las actuaciones procedimentales del procedimiento ${procedimientoId}`,
      procedimientoId,
    });

    return {
      ...resultado,
      demoraExistente: calcularDemoraExistente({ ...procedimiento, ...captura }),
    };
  }
}
