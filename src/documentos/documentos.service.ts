import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Packer } from 'docx';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ProcedimientoAccesoService } from '../procedimientos/procedimiento-acceso.service';
import { NarrativaService } from '../narrativa/narrativa.service';
import { calcularDemoraExistente, obtenerCapturaMasAntigua } from '../actuaciones-procedimiento/demora.util';
import {
  construirActaIncautacion,
  construirActaIncautacionColectiva,
} from './plantillas/acta-incautacion.plantilla';
import {
  rellenarPlantillaWord,
  rellenarPlantillaConBloqueRepetible,
  oNoAporta,
  digitosFecha,
  digitosHora,
} from './plantillas/rellenar-plantilla-word';
import { AclaracionRequeridaException } from './excepciones/aclaracion-requerida.exception';
import type { ContextoNarracionFpj5 } from '../narrativa/interfaces/contexto-narracion.interface';

// RT-005: los documentos generados se almacenan físicamente en el servidor.
const CARPETA_ALMACENAMIENTO = path.join(process.cwd(), 'storage', 'documentos-generados');
const CARPETA_ASSETS = path.join(process.cwd(), 'assets', 'documentos');
const PLANTILLA_FPJ6_CAPTURADO = path.join(CARPETA_ASSETS, 'fpj6-plantilla-capturado.docx');
const PLANTILLA_FPJ6_APREHENDIDO = path.join(CARPETA_ASSETS, 'fpj6-plantilla-aprehendido.docx');
const PLANTILLA_FPJ5_CAPTURADO = path.join(CARPETA_ASSETS, 'fpj5-plantilla-capturado.docx');
const PLANTILLA_FPJ5_APREHENDIDO = path.join(CARPETA_ASSETS, 'fpj5-plantilla-aprehendido.docx');
const PLANTILLA_FPJ7 = path.join(CARPETA_ASSETS, 'fpj7-plantilla.docx');
const PLANTILLA_FPJ8 = path.join(CARPETA_ASSETS, 'fpj8-plantilla.docx');
const OBSERVACIONES_VACIAS = '_'.repeat(94); // igual longitud que la línea original en blanco

@Injectable()
export class DocumentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly acceso: ProcedimientoAccesoService,
    private readonly narrativa: NarrativaService,
  ) {}

  /**
   * Adenda 2026-08-06: antes existía soporte deliberado de "regenerar
   * con versión" (v1, v2, v3... con estado 'Regenerado'), que permitía
   * editar los datos base y volver a generar un documento distinto al
   * ya usado oficialmente. El usuario detectó esto como un problema de
   * integridad real: una vez generado un documento, ya no se puede
   * regenerar -- solo descargar el existente. Se identifica cada
   * documento por su tipo + a quién pertenece (capturado, elemento, o
   * el procedimiento completo en el caso del FPJ-5).
   */
  /**
   * Adenda 2026-08-13: si el procedimiento tiene la edición desbloqueada
   * por un administrador (procedimiento.edicionDesbloqueada), se omite
   * esta verificación por completo -- permite regenerar un documento ya
   * generado antes, con la información ya corregida.
   */
  private async verificarDocumentoNoGeneradoAntes(
    procedimientoId: string,
    tipoDocumento: string,
    referencia: { capturadoId?: string; elementoId?: string },
    edicionDesbloqueada?: boolean,
  ) {
    if (edicionDesbloqueada) return;

    const yaGenerado = await this.prisma.documentoGenerado.findFirst({
      where: { procedimientoId, tipoDocumento, ...referencia },
    });
    if (yaGenerado) {
      throw new ConflictException(
        `El ${tipoDocumento} ya fue generado para este procedimiento y no se puede regenerar. Descárguelo desde el listado de documentos generados, o pida a un administrador que desbloquee la edición desde el panel.`,
      );
    }
  }

  /**
   * Adenda 2026-08-05: ningún documento se genera sin un pago verificado
   * para el procedimiento. Se llama al inicio de los 5 métodos de
   * generación (nunca en la descarga de un documento ya generado ni en
   * el listado — eso sigue disponible siempre).
   */
  private async verificarPagoAprobado(procedimiento: {
    id: string;
    exoneradoPago: boolean;
  }): Promise<void> {
    // Adenda 2026-08-06: un administrador puede exonerar puntualmente un
    // procedimiento del requisito de pago desde el panel de
    // administración (AdminController.exonerarPago).
    if (procedimiento.exoneradoPago) return;

    const pago = await this.prisma.pago.findUnique({
      where: { procedimientoId: procedimiento.id },
    });

    if (!pago) {
      throw new ForbiddenException(
        'Este procedimiento no tiene un pago registrado. Debe registrarse y ser verificado por un administrador antes de generar documentos.',
      );
    }

    if (pago.estadoPago !== 'Verificado') {
      throw new ForbiddenException(
        `El pago de este procedimiento está en estado "${pago.estadoPago}". Debe estar "Verificado" por un administrador antes de generar documentos.`,
      );
    }
  }

  async generarActaIncautacion(
    procedimientoId: string,
    capturadoId: string,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    const procedimiento = await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.verificarPagoAprobado(procedimiento);
    await this.verificarDocumentoNoGeneradoAntes(procedimientoId, 'ACTA', { capturadoId }, procedimiento.edicionDesbloqueada);

    const capturado = await this.prisma.capturado.findUnique({
      where: { id: capturadoId },
      include: { elementosIncautados: true },
    });
    if (!capturado || capturado.procedimientoId !== procedimientoId) {
      throw new NotFoundException('Interviniente no encontrado en este procedimiento.');
    }
    if (capturado.elementosIncautados.length === 0) {
      throw new BadRequestException(
        'Este interviniente no tiene elementos incautados registrados; no hay nada que documentar en el Acta.',
      );
    }

    const [funcionarioActuante, lugarProcedimiento] = await Promise.all([
      this.prisma.funcionarioActuante.findUnique({ where: { procedimientoId } }),
      this.prisma.lugarProcedimiento.findUnique({ where: { procedimientoId } }),
    ]);
    if (!funcionarioActuante) {
      throw new BadRequestException(
        'Debe registrar el funcionario actuante antes de generar el Acta de Incautación.',
      );
    }
    if (!lugarProcedimiento) {
      throw new BadRequestException(
        'Debe registrar el lugar del procedimiento antes de generar el Acta de Incautación.',
      );
    }

    const documento = construirActaIncautacion({
      estacionPolicia: funcionarioActuante.estacion,
      ciudad: lugarProcedimiento.municipio,
      fechaIncautacion: procedimiento.fechaCaptura,
      horaIncautacion: procedimiento.horaCaptura,
      barrio: lugarProcedimiento.barrio,
      capturado: {
        primerNombre: capturado.primerNombre,
        segundoNombre: capturado.segundoNombre,
        primerApellido: capturado.primerApellido,
        segundoApellido: capturado.segundoApellido,
        tipoDocumento: capturado.tipoDocumento,
        numeroDocumento: capturado.numeroDocumento,
        expedicionDocumento: capturado.expedicionDocumento,
        edad: capturado.edad,
        fechaNacimiento: capturado.fechaNacimiento,
        lugarNacimiento: capturado.lugarNacimiento,
        direccion: capturado.direccion,
      },
      elementos: capturado.elementosIncautados.map((e) => ({
        descripcion: e.descripcionBase,
        observaciones: e.observaciones,
      })),
      funcionario: {
        nombreCompleto: funcionarioActuante.nombreCompleto,
        placa: funcionarioActuante.placa,
        cargo: funcionarioActuante.cargo,
      },
    });

    const buffer = await Packer.toBuffer(documento);

    const version =
      (await this.prisma.documentoGenerado.count({
        where: { capturadoId, tipoDocumento: 'ACTA' },
      })) + 1;

    const carpetaDestino = path.join(CARPETA_ALMACENAMIENTO, procedimientoId);
    fs.mkdirSync(carpetaDestino, { recursive: true });
    const nombreArchivo = `ACTA-${capturado.id}-v${version}.docx`;
    const rutaArchivo = path.join(carpetaDestino, nombreArchivo);
    fs.writeFileSync(rutaArchivo, buffer);

    const documentoGenerado = await this.prisma.documentoGenerado.create({
      data: {
        procedimientoId,
        tipoDocumento: 'ACTA',
        capturadoId,
        fechaGeneracion: new Date(),
        version,
        procedimientoVersion: 1, // Simplificación inicial; se refina en una fase posterior.
        rutaArchivo,
        estado: version > 1 ? 'Regenerado' : 'Generado',
      },
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: version > 1 ? 'Regenerar' : 'Crear',
      tablaAfectada: 'documentos_generados',
      registroAfectado: documentoGenerado.id,
      descripcionEvento: `Acta de Incautación generada (v${version}) para el interviniente ${capturadoId}`,
      procedimientoId,
    });

    return documentoGenerado;
  }

  /**
   * Adenda 2026-08-14: Acta de Incautación para elementos "sin
   * individualizar" (capturadoId null en ElementoIncautado) -- hallados
   * en un lugar común (ej. interior de un vehículo) sin poder
   * atribuirse a una persona específica, pero que dieron lugar a la
   * captura de varios intervinientes a la vez. Un solo documento cubre
   * TODOS los elementos colectivos del procedimiento (mismo criterio ya
   * usado para el Acta individual: un Acta agrupa todos los elementos
   * de su "dueño", sea una persona o, en este caso, el procedimiento
   * completo), listando a todos los capturados como firmantes.
   */
  async generarActaIncautacionColectiva(
    procedimientoId: string,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    const procedimiento = await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.verificarPagoAprobado(procedimiento);
    await this.verificarDocumentoNoGeneradoAntes(
      procedimientoId,
      'ACTA_COLECTIVA',
      {},
      procedimiento.edicionDesbloqueada,
    );

    const [capturados, elementosColectivos, funcionarioActuante, lugarProcedimiento] = await Promise.all([
      this.prisma.capturado.findMany({ where: { procedimientoId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.elementoIncautado.findMany({
        where: { procedimientoId, capturadoId: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.funcionarioActuante.findUnique({ where: { procedimientoId } }),
      this.prisma.lugarProcedimiento.findUnique({ where: { procedimientoId } }),
    ]);

    if (elementosColectivos.length === 0) {
      throw new BadRequestException(
        'Este procedimiento no tiene elementos sin individualizar registrados; no hay nada que documentar en el Acta colectiva.',
      );
    }
    if (capturados.length === 0) {
      throw new BadRequestException(
        'Este procedimiento no tiene intervinientes registrados; no hay a quién atribuir el Acta colectiva.',
      );
    }
    if (!funcionarioActuante) {
      throw new BadRequestException(
        'Debe registrar el funcionario actuante antes de generar el Acta de Incautación.',
      );
    }
    if (!lugarProcedimiento) {
      throw new BadRequestException(
        'Debe registrar el lugar del procedimiento antes de generar el Acta de Incautación.',
      );
    }

    const documento = construirActaIncautacionColectiva({
      estacionPolicia: funcionarioActuante.estacion,
      ciudad: lugarProcedimiento.municipio,
      fechaIncautacion: procedimiento.fechaCaptura,
      horaIncautacion: procedimiento.horaCaptura,
      barrio: lugarProcedimiento.barrio,
      // Adenda: todos los elementos colectivos deberían compartir el
      // mismo lugar físico de hallazgo en la práctica (es lo que los
      // hace "colectivos"); se usa el del primero registrado.
      ubicacionHallazgo: elementosColectivos[0].ubicacionHallazgo,
      capturados: capturados.map((c) => ({
        primerNombre: c.primerNombre,
        segundoNombre: c.segundoNombre,
        primerApellido: c.primerApellido,
        segundoApellido: c.segundoApellido,
        numeroDocumento: c.numeroDocumento,
        expedicionDocumento: c.expedicionDocumento,
      })),
      elementos: elementosColectivos.map((e) => ({
        descripcion: e.descripcionBase,
        observaciones: e.observaciones,
      })),
      funcionario: {
        nombreCompleto: funcionarioActuante.nombreCompleto,
        placa: funcionarioActuante.placa,
        cargo: funcionarioActuante.cargo,
      },
    });

    const buffer = await Packer.toBuffer(documento);

    const version =
      (await this.prisma.documentoGenerado.count({
        where: { procedimientoId, tipoDocumento: 'ACTA_COLECTIVA' },
      })) + 1;

    const carpetaDestino = path.join(CARPETA_ALMACENAMIENTO, procedimientoId);
    fs.mkdirSync(carpetaDestino, { recursive: true });
    const nombreArchivo = `ACTA-COLECTIVA-${procedimientoId}-v${version}.docx`;
    const rutaArchivo = path.join(carpetaDestino, nombreArchivo);
    fs.writeFileSync(rutaArchivo, buffer);

    const documentoGenerado = await this.prisma.documentoGenerado.create({
      data: {
        procedimientoId,
        tipoDocumento: 'ACTA_COLECTIVA',
        fechaGeneracion: new Date(),
        version,
        procedimientoVersion: 1,
        rutaArchivo,
        estado: version > 1 ? 'Regenerado' : 'Generado',
      },
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: version > 1 ? 'Regenerar' : 'Crear',
      tablaAfectada: 'documentos_generados',
      registroAfectado: documentoGenerado.id,
      descripcionEvento: `Acta de Incautación colectiva generada (v${version}) para el procedimiento ${procedimientoId}, ${capturados.length} capturados`,
      procedimientoId,
    });

    return documentoGenerado;
  }

  async generarFpj6ActaDerechos(
    procedimientoId: string,
    capturadoId: string,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    const procedimiento = await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.verificarPagoAprobado(procedimiento);
    await this.verificarDocumentoNoGeneradoAntes(procedimientoId, 'FPJ6', { capturadoId }, procedimiento.edicionDesbloqueada);

    const capturado = await this.prisma.capturado.findUnique({
      where: { id: capturadoId },
      include: { contactoNotificacion: true },
    });
    if (!capturado || capturado.procedimientoId !== procedimientoId) {
      throw new NotFoundException('Interviniente no encontrado en este procedimiento.');
    }

    const [funcionarioActuante, lugarProcedimiento] = await Promise.all([
      this.prisma.funcionarioActuante.findUnique({ where: { procedimientoId } }),
      this.prisma.lugarProcedimiento.findUnique({ where: { procedimientoId } }),
    ]);
    if (!funcionarioActuante) {
      throw new BadRequestException('Debe registrar el funcionario actuante antes de generar el FPJ-6.');
    }
    if (!lugarProcedimiento) {
      throw new BadRequestException('Debe registrar el lugar del procedimiento antes de generar el FPJ-6.');
    }
    // Adenda 2026-08-21: la lectura de derechos (y su fecha/hora) ahora es
    // individual por interviniente -- ver Capturado en el schema. Antes
    // vivía en `actuaciones`, compartida para todo el procedimiento, lo
    // que impedía capturas/aprehensiones en momentos distintos dentro del
    // mismo procedimiento (bug real reportado tras caso en vivo).
    if (!capturado.fechaCaptura || !capturado.horaCaptura) {
      throw new BadRequestException(
        'Debe completar la fecha y hora de lectura de derechos de este interviniente antes de generar el FPJ-6.',
      );
    }

    const esAprehendido = capturado.tipoInterviniente === 'APREHENDIDO';
    const nombreCompletoCapturado = [
      capturado.primerNombre,
      capturado.segundoNombre,
      capturado.primerApellido,
      capturado.segundoApellido,
    ]
      .filter(Boolean)
      .join(' ');

    // Contacto: si no se logró obtener NINGÚN dato del acudiente/representante,
    // la hora queda en blanco y se deja la constancia en Observaciones.
    // Adenda 2026-08-21: bug real reportado tras caso en vivo -- antes se
    // usaba siempre una frase genérica fija, ignorando la justificación
    // específica que el funcionario efectivamente escribió
    // (justificacionNoComunicacion). Ahora se usa esa justificación
    // cuando existe, y solo se cae a la frase genérica si no se escribió
    // ninguna (constancia mínima, mejor que dejarlo vacío).
    const contacto = capturado.contactoNotificacion;
    const contactoDesconocido =
      !contacto ||
      (oNoAporta(contacto.nombre) === 'No aporta' &&
        oNoAporta(contacto.identificacion) === 'No aporta' &&
        oNoAporta(contacto.telefono) === 'No aporta');

    const observaciones = contactoDesconocido
      ? contacto?.justificacionNoComunicacion?.trim() ||
        `Se deja constancia de que no fue posible informar de la situación jurídica del ${esAprehendido ? 'aprehendido' : 'capturado'}(a) al no lograr obtener información del acudiente, representante o persona indicada por él/ella.`
      : OBSERVACIONES_VACIAS;

    const fechaDig = digitosFecha(capturado.fechaCaptura);
    const horaDig = digitosHora(capturado.horaCaptura);
    const fechaBt = capturado.fechaCaptura;

    const datos: Record<string, string> = {
      ...fechaDig,
      ...horaDig,
      LUGAR_PROCEDIMIENTO: lugarProcedimiento.direccion,
      TRANS: '',
      NOMBRES: nombreCompletoCapturado,
      IDENTIFICACION: capturado.numeroDocumento
        ? `${capturado.tipoDocumento ?? ''} ${capturado.numeroDocumento}`.trim()
        : 'No aporta',
      FECHA_NAC: capturado.fechaNacimiento
        ? capturado.fechaNacimiento.toLocaleDateString('es-CO')
        : 'No aporta',
      LUGAR_NAC: oNoAporta(capturado.lugarNacimiento),
      PADRES: oNoAporta(capturado.nombrePadres),
      // Adenda 2026-08-21: teléfono de los padres, faltaba por completo en
      // este documento (bug real reportado tras caso en vivo) -- el
      // token PADRES solo traía el nombre.
      PADRES_TELEFONO: oNoAporta(capturado.telefonoPadres),
      // Adenda 2026-08-21: escolaridad, faltaba por completo en este
      // documento.
      ESCOLARIDAD: oNoAporta(capturado.escolaridad),
      ESTADO_CIVIL: oNoAporta(capturado.estadoCivil),
      OCUPACION: oNoAporta(capturado.ocupacion),
      DIR_TEL_INTERVINIENTE: oNoAporta(
        [capturado.direccion, capturado.telefono].filter(Boolean).join(' - ') || undefined,
      ),
      CORREO: oNoAporta(capturado.correo),
      REDES: oNoAporta(capturado.redesSociales),
      COMPRENDE: capturado.comprendeDerechos ? '(SÍ)' : '(NO)',
      C_NOMBRES: oNoAporta(contacto?.nombre),
      C_IDENTIFICACION: oNoAporta(contacto?.identificacion),
      C_TELEFONO: oNoAporta(contacto?.telefono),
      C_HORA: contactoDesconocido ? '' : oNoAporta(contacto?.horaComunicacion),
      OBSERVACIONES: observaciones,
      FUNCIONARIO_INFO: `${funcionarioActuante.cargo} ${funcionarioActuante.nombreCompleto} - Placa ${funcionarioActuante.placa}`,
      BT_CIUDAD: lugarProcedimiento.municipio,
      BT_DIA: String(fechaBt.getUTCDate()),
      BT_MES: fechaBt.toLocaleDateString('es-CO', { month: 'long' }),
      BT_ANIO: String(fechaBt.getUTCFullYear()),
      BT_HORA: capturado.horaCaptura,
      BT_NOMBRE: nombreCompletoCapturado,
      BT_CEDULA: oNoAporta(capturado.numeroDocumento),
      BT_FECHA_NAC: capturado.fechaNacimiento
        ? capturado.fechaNacimiento.toLocaleDateString('es-CO')
        : 'No aporta',
      BT_EDAD: String(capturado.edad),
      BT_ESTADO_CIVIL: oNoAporta(capturado.estadoCivil),
      BT_INDICIADO: '',
      BT_IMPUTADO: '',
      BT_DELITO: procedimiento.delito,
    };

    const plantilla = esAprehendido ? PLANTILLA_FPJ6_APREHENDIDO : PLANTILLA_FPJ6_CAPTURADO;
    const buffer = rellenarPlantillaWord(plantilla, datos);

    const version =
      (await this.prisma.documentoGenerado.count({
        where: { capturadoId, tipoDocumento: 'FPJ6' },
      })) + 1;

    const carpetaDestino = path.join(CARPETA_ALMACENAMIENTO, procedimientoId);
    fs.mkdirSync(carpetaDestino, { recursive: true });
    const nombreArchivo = `FPJ6-${capturado.id}-v${version}.docx`;
    const rutaArchivo = path.join(carpetaDestino, nombreArchivo);
    fs.writeFileSync(rutaArchivo, buffer);

    const documentoGenerado = await this.prisma.documentoGenerado.create({
      data: {
        procedimientoId,
        tipoDocumento: 'FPJ6',
        capturadoId,
        fechaGeneracion: new Date(),
        version,
        procedimientoVersion: 1,
        rutaArchivo,
        estado: version > 1 ? 'Regenerado' : 'Generado',
      },
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: version > 1 ? 'Regenerar' : 'Crear',
      tablaAfectada: 'documentos_generados',
      registroAfectado: documentoGenerado.id,
      descripcionEvento: `FPJ-6 (Acta de Derechos del ${capturado.tipoInterviniente}) generado (v${version}) para el interviniente ${capturadoId}`,
      procedimientoId,
    });

    return documentoGenerado;
  }

  /**
   * Genera el FPJ-5 (Informe de Captura en Flagrancia). RN-001 / REGLA
   * INV-FPJ5-003: se genera UN ÚNICO FPJ-5 por procedimiento, relacionando
   * a todos los intervinientes (no uno por cada capturado, a diferencia
   * del FPJ-6 y del Acta de Incautación).
   *
   * La sección 9 (narración de los hechos) se genera automáticamente por
   * IA. Si el modelo detecta información faltante o inconsistente según
   * las reglas del CORE (CORE_TRANSVERSAL + ESTUPEFACIENTES), este método
   * lanza AclaracionRequeridaException (409) con la pregunta exacta, SIN
   * generar ni guardar ningún documento. El cliente debe reenviar la
   * solicitud agregando la respuesta del funcionario en `aclaraciones`.
   */
  async generarFpj5Informe(
    procedimientoId: string,
    usuarioId: string,
    correoUsuario: string,
    aclaraciones: string[] = [],
    rol?: string,
  ) {
    const procedimiento = await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.verificarPagoAprobado(procedimiento);
    await this.verificarDocumentoNoGeneradoAntes(procedimientoId, 'FPJ5', {}, procedimiento.edicionDesbloqueada);

    const [funcionarioActuante, companeroPatrulla, lugarProcedimiento, actuaciones, capturados, elementosColectivos, testigos, victimas] =
      await Promise.all([
        this.prisma.funcionarioActuante.findUnique({ where: { procedimientoId } }),
        this.prisma.companeroPatrulla.findUnique({ where: { procedimientoId } }),
        this.prisma.lugarProcedimiento.findUnique({ where: { procedimientoId } }),
        this.prisma.actuacionesProcedimiento.findUnique({ where: { procedimientoId } }),
        this.prisma.capturado.findMany({
          where: { procedimientoId },
          include: { elementosIncautados: true, contactoNotificacion: true },
          orderBy: { createdAt: 'asc' },
        }),
        // Adenda 2026-08-14: elementos "sin individualizar" -- ver
        // comentario en ContextoNarracionFpj5.
        this.prisma.elementoIncautado.findMany({
          where: { procedimientoId, capturadoId: null },
          orderBy: { createdAt: 'asc' },
        }),
        // Adenda 2026-08-20: testigos de los hechos -- ver comentario en
        // ContextoNarracionFpj5. Se consultan sin importar el valor de
        // actuaciones.existenTestigos: si el funcionario respondió "No"
        // pero de todas formas hay registros huérfanos (p. ej. cambió de
        // opinión sin borrarlos), igual deben reflejarse en el informe.
        this.prisma.testigo.findMany({
          where: { procedimientoId },
          orderBy: { createdAt: 'asc' },
        }),
        // Adenda 2026-08-21 (módulo Hurto): víctimas -- mismo criterio
        // que testigos, con sus elementos hurtados incluidos para poder
        // narrar qué le sustrajeron a cada una y si fue recuperado.
        this.prisma.victima.findMany({
          where: { procedimientoId },
          include: { elementosIncautados: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

    if (!funcionarioActuante) {
      throw new BadRequestException('Debe registrar el funcionario actuante antes de generar el FPJ-5.');
    }
    if (!lugarProcedimiento) {
      throw new BadRequestException('Debe registrar el lugar del procedimiento antes de generar el FPJ-5.');
    }
    if (!actuaciones) {
      throw new BadRequestException(
        'Debe registrar las actuaciones procedimentales antes de generar el FPJ-5.',
      );
    }
    // Adenda 2026-08-21: la lectura de derechos (y su fecha/hora) ahora es
    // individual por interviniente -- ver Capturado en el schema. Antes
    // vivía en `actuaciones`, compartida para todo el procedimiento, lo
    // que impedía capturas/aprehensiones en momentos distintos dentro del
    // mismo procedimiento (bug real reportado tras caso en vivo).
    const intervinienteSinDerechos = capturados.find((c) => !c.fechaCaptura || !c.horaCaptura);
    if (intervinienteSinDerechos) {
      throw new BadRequestException(
        `Debe completar la fecha y hora de lectura de derechos de ${intervinienteSinDerechos.primerNombre} ${intervinienteSinDerechos.primerApellido} antes de generar el FPJ-5.`,
      );
    }
    if (capturados.length === 0) {
      throw new BadRequestException('Debe registrar al menos un interviniente antes de generar el FPJ-5.');
    }
    // fechaDisposicion/horaDisposicion son opcionales en el modelo (Adenda
    // 2026-08-01: no se conocen al crear el procedimiento), pero el FPJ-5 sí
    // las necesita para la sección 9. Si aún no se completaron, se pide
    // explícitamente en vez de fallar con un error críptico más abajo.
    if (!procedimiento.fechaDisposicion || !procedimiento.horaDisposicion) {
      throw new BadRequestException(
        'Debe registrar la fecha y hora de puesta a disposición del procedimiento antes de generar el FPJ-5.',
      );
    }

    // Adenda 2026-08-21: la hora de captura ya no es un solo valor del
    // procedimiento -- se usa la más antigua entre los intervinientes,
    // con el valor de creación del procedimiento como respaldo (ver
    // demora.util.ts).
    const capturaMasAntigua = obtenerCapturaMasAntigua(procedimiento, capturados);

    const contexto: ContextoNarracionFpj5 = {
      procedimiento: {
        delito: procedimiento.delito,
        tipoProcedimiento: procedimiento.tipoProcedimiento,
        fechaCaptura: capturaMasAntigua.fechaCaptura.toISOString(),
        horaCaptura: capturaMasAntigua.horaCaptura,
        fechaDisposicion: procedimiento.fechaDisposicion.toISOString(),
        horaDisposicion: procedimiento.horaDisposicion,
      },
      funcionario: {
        nombreCompleto: funcionarioActuante.nombreCompleto,
        cargo: funcionarioActuante.cargo,
        placa: funcionarioActuante.placa,
        servicio: funcionarioActuante.servicio,
        estacion: funcionarioActuante.estacion,
        cai: funcionarioActuante.cai,
      },
      companero: companeroPatrulla
        ? {
            nombreCompleto: companeroPatrulla.nombreCompleto,
            placa: companeroPatrulla.placa,
            grado: companeroPatrulla.grado,
          }
        : null,
      lugar: {
        departamento: lugarProcedimiento.departamento,
        municipio: lugarProcedimiento.municipio,
        barrio: lugarProcedimiento.barrio,
        direccion: lugarProcedimiento.direccion,
        caracteristicas: lugarProcedimiento.caracteristicas,
        existenCamaras: lugarProcedimiento.existenCamaras,
        descripcionCamaras: lugarProcedimiento.descripcionCamaras,
      },
      intervinientes: capturados.map((c) => ({
        tipoInterviniente: c.tipoInterviniente,
        nombreCompleto: [c.primerNombre, c.segundoNombre, c.primerApellido, c.segundoApellido]
          .filter(Boolean)
          .join(' '),
        edad: c.edad,
        tipoDocumento: c.tipoDocumento,
        numeroDocumento: c.numeroDocumento,
        elementos: c.elementosIncautados.map((e) => ({
          tipoElemento: e.tipoElemento,
          descripcionBase: e.descripcionBase,
          ubicacionHallazgo: e.ubicacionHallazgo,
          direccionIncautacion: e.direccionIncautacion,
          observaciones: e.observaciones,
          fuenteVerificacionHurto: e.fuenteVerificacionHurto,
          nombreAplicativo: e.nombreAplicativo,
          numeroReporteAplicativo: e.numeroReporteAplicativo,
          numeroDenuncia: e.numeroDenuncia,
          entidadDenuncia: e.entidadDenuncia,
          fechaDenuncia: e.fechaDenuncia ? e.fechaDenuncia.toISOString() : null,
          denuncianteNombre: e.denuncianteNombre,
          denuncianteDocumento: e.denuncianteDocumento,
          denuncianteTelefono: e.denuncianteTelefono,
          contextoExhibicion: e.contextoExhibicion,
          criteriosSospecha: e.criteriosSospecha,
        })),
        participacionHechos: c.participacionHechos,
        comportamientoAbordaje: c.comportamientoAbordaje,
        identificacionPlena: c.identificacionPlena,
        formaIdentificacion: c.formaIdentificacion,
        escolaridad: c.escolaridad,
        derechosLeidos: c.derechosLeidos,
        fechaCaptura: c.fechaCaptura ? c.fechaCaptura.toISOString() : null,
        horaCaptura: c.horaCaptura,
        comprendeDerechos: c.comprendeDerechos,
        usoEsposas: c.usoEsposas,
        justificacionEsposas: c.justificacionEsposas,
        tiempoEsposado: c.tiempoEsposado,
        motivoRetiroEsposas: c.motivoRetiroEsposas,
        presentaLesiones: c.presentaLesiones,
        descripcionLesiones: c.descripcionLesiones,
        parteCuerpoLesion: c.parteCuerpoLesion,
        motivoLesion: c.motivoLesion,
        causanteLesion: c.causanteLesion,
        elementoCausante: c.elementoCausante,
        trasladoCentroAsistencial: c.trasladoCentroAsistencial,
        centroAsistencial: c.centroAsistencial,
        motivoTraslado: c.motivoTraslado,
        tipoPermisoArma: c.tipoPermisoArma,
        contacto: c.contactoNotificacion
          ? {
              nombre: c.contactoNotificacion.nombre,
              parentesco: c.contactoNotificacion.parentesco,
              telefono: c.contactoNotificacion.telefono,
              comunicacionExitosa: c.contactoNotificacion.comunicacionExitosa,
              horaComunicacion: c.contactoNotificacion.horaComunicacion,
              justificacionNoComunicacion: c.contactoNotificacion.justificacionNoComunicacion,
            }
          : null,
      })),
      // Adenda 2026-08-14: elementos "sin individualizar".
      elementosSinIndividualizar: elementosColectivos.map((e) => ({
        tipoElemento: e.tipoElemento,
        descripcionBase: e.descripcionBase,
        ubicacionHallazgo: e.ubicacionHallazgo,
        direccionIncautacion: e.direccionIncautacion,
        observaciones: e.observaciones,
        fuenteVerificacionHurto: e.fuenteVerificacionHurto,
        nombreAplicativo: e.nombreAplicativo,
        numeroReporteAplicativo: e.numeroReporteAplicativo,
        numeroDenuncia: e.numeroDenuncia,
        entidadDenuncia: e.entidadDenuncia,
        fechaDenuncia: e.fechaDenuncia ? e.fechaDenuncia.toISOString() : null,
        denuncianteNombre: e.denuncianteNombre,
        denuncianteDocumento: e.denuncianteDocumento,
        denuncianteTelefono: e.denuncianteTelefono,
        contextoExhibicion: e.contextoExhibicion,
        criteriosSospecha: e.criteriosSospecha,
      })),
      // Adenda 2026-08-20: testigos de los hechos (Sección 5).
      testigos: testigos.map((t) => ({
        nombreCompleto: [t.primerNombre, t.segundoNombre, t.primerApellido, t.segundoApellido]
          .filter(Boolean)
          .join(' '),
        tipoDocumento: t.tipoDocumento,
        numeroDocumento: t.numeroDocumento,
        edad: t.edad,
        genero: t.genero,
      })),
      // Adenda 2026-08-21 (módulo Hurto): víctimas (Sección 4).
      victimas: victimas.map((v) => ({
        nombreCompleto: [v.primerNombre, v.segundoNombre, v.primerApellido, v.segundoApellido]
          .filter(Boolean)
          .join(' '),
        tipoDocumento: v.tipoDocumento,
        numeroDocumento: v.numeroDocumento,
        edad: v.edad,
        genero: v.genero,
        relacionIndiciado: v.relacionIndiciado,
        elementosHurtados: v.elementosIncautados.map((e) => ({
          descripcionBase: e.descripcionBase,
          recuperado: e.recuperado,
          recuperadoPor: e.recuperadoPor,
          fuenteVerificacionHurto: e.fuenteVerificacionHurto,
          nombreAplicativo: e.nombreAplicativo,
          numeroReporteAplicativo: e.numeroReporteAplicativo,
          numeroDenuncia: e.numeroDenuncia,
          entidadDenuncia: e.entidadDenuncia,
          fechaDenuncia: e.fechaDenuncia ? e.fechaDenuncia.toISOString() : null,
          denuncianteNombre: e.denuncianteNombre,
          denuncianteDocumento: e.denuncianteDocumento,
          denuncianteTelefono: e.denuncianteTelefono,
        })),
        // Adenda 2026-08-22 (módulo Lesiones Personales): estado físico.
        presentaLesiones: v.presentaLesiones,
        descripcionLesiones: v.descripcionLesiones,
        parteCuerpoLesion: v.parteCuerpoLesion,
        causanteLesion: v.causanteLesion,
        elementoCausante: v.elementoCausante,
        trasladoCentroAsistencial: v.trasladoCentroAsistencial,
        centroAsistencial: v.centroAsistencial,
        motivoTraslado: v.motivoTraslado,
        // Adenda 2026-08-23 (módulo Homicidio).
        fallecio: v.fallecio,
        // Adenda 2026-08-22 (módulo Violencia contra Servidor Público).
        entidadServidorPublico: v.entidadServidorPublico,
        cargoServidorPublico: v.cargoServidorPublico,
        uniformado: v.uniformado,
        enEjercicioFunciones: v.enEjercicioFunciones,
        indiciadoConocioCalidad: v.indiciadoConocioCalidad,
        // Adenda 2026-08-22 (módulo Violencia Intrafamiliar).
        relacionFamiliar: v.relacionFamiliar,
        existenMedidasProteccion: v.existenMedidasProteccion,
        descripcionMedidasProteccion: v.descripcionMedidasProteccion,
        existenAntecedentesViolencia: v.existenAntecedentesViolencia,
        descripcionAntecedentesViolencia: v.descripcionAntecedentesViolencia,
        // Adenda 2026-08-23 (módulo Secuestro).
        fechaInicioPrivacionLibertad: v.fechaInicioPrivacionLibertad
          ? v.fechaInicioPrivacionLibertad.toISOString()
          : null,
        horaInicioPrivacionLibertad: v.horaInicioPrivacionLibertad,
        finalidadPrivacionLibertad: v.finalidadPrivacionLibertad,
        lugaresRetencion: v.lugaresRetencion,
        // Adenda 2026-08-23 (módulo Extorsión).
        montoExigido: v.montoExigido,
        motivoExigencia: v.motivoExigencia,
        medioExigencia: v.medioExigencia,
        existenAmenazas: v.existenAmenazas,
        descripcionAmenazas: v.descripcionAmenazas,
        lugarEntregaExigido: v.lugarEntregaExigido,
        // Adenda 2026-08-23 (módulo Daño en Bien Ajeno o del Estado).
        descripcionBienDanado: v.descripcionBienDanado,
        mecanismoDano: v.mecanismoDano,
        valorEstimadoDano: v.valorEstimadoDano,
        esBienEstatal: v.esBienEstatal,
        entidadPropietariaBien: v.entidadPropietariaBien,
      })),
      actuaciones: {
        autoridadReceptora: actuaciones.autoridadReceptora,
        autoridadReceptoraAdultos: actuaciones.autoridadReceptoraAdultos,
        autoridadReceptoraMenores: actuaciones.autoridadReceptoraMenores,
        demoraExistente: calcularDemoraExistente({ ...procedimiento, ...capturaMasAntigua }),
        justificacionDemora: actuaciones.justificacionDemora,
        observacionInicial: actuaciones.observacionInicial,
        desarrolloIntervencion: actuaciones.desarrolloIntervencion,
        circunstanciaRelevante: actuaciones.tieneCircunstanciaRelevante
          ? actuaciones.circunstanciaRelevante
          : null,
        observacionAdicional: actuaciones.tieneObservacionAdicional
          ? actuaciones.observacionAdicional
          : null,
      },
    };

    const resultado = await this.narrativa.generarNarracion(contexto, aclaraciones);

    if (resultado.tipo === 'aclaracion_requerida') {
      throw new AclaracionRequeridaException(resultado.pregunta);
    }

    // Selección de plantilla (decisión del usuario, 2026-07-22): en
    // procedimientos MIXTOS (adultos + adolescentes) se usa siempre el
    // texto genérico de CAPTURADO. Solo se usa APREHENDIDO cuando TODOS
    // los intervinientes son adolescentes.
    const esAprehendido = capturados.every((c) => c.tipoInterviniente === 'APREHENDIDO');
    const plantilla = esAprehendido ? PLANTILLA_FPJ5_APREHENDIDO : PLANTILLA_FPJ5_CAPTURADO;

    const hoy = new Date();
    const anexos = await this.prisma.documentoGenerado.groupBy({
      by: ['tipoDocumento'],
      where: { procedimientoId },
      _count: { _all: true },
    });
    const contarAnexo = (tipo: string) =>
      String(anexos.find((a) => a.tipoDocumento === tipo)?._count._all ?? 0);

    // Adenda 2026-08-20: bug real encontrado por el usuario -- faltaban
    // los elementos "sin individualizar" (ver Adenda 2026-08-14), que
    // solo se estaban incluyendo en la narrativa (prosa de la IA) pero
    // NO en este listado estructurado del punto 7 del formato oficial.
    const elementosGlobales = [
      ...capturados.flatMap((c) => c.elementosIncautados),
      ...elementosColectivos,
    ];
    const descripcionElementos =
      elementosGlobales.length > 0
        ? elementosGlobales.map((e, i) => `${i + 1}. ${e.descripcionBase}`).join('\n')
        : 'No se registraron elementos incautados.';

    // Adenda 2026-08-20: en procedimientos mixtos (adultos y
    // adolescentes a la vez), la autoridad receptora puede ser
    // distinta para cada grupo -- a solicitud del usuario. Si el
    // procedimiento tiene ambos tipos de interviniente Y se
    // diligenciaron los dos campos individualizados, se combinan en un
    // solo texto; si no, se usa el campo único de siempre
    // (autoridadReceptora) sin cambios.
    const hayAdultos = capturados.some((c) => c.tipoInterviniente === 'CAPTURADO');
    const hayMenores = capturados.some((c) => c.tipoInterviniente === 'APREHENDIDO');
    const esMixto = hayAdultos && hayMenores;
    const destinoInforme =
      esMixto && actuaciones.autoridadReceptoraAdultos && actuaciones.autoridadReceptoraMenores
        ? `Mayores de edad: ${actuaciones.autoridadReceptoraAdultos}. Menores de edad: ${actuaciones.autoridadReceptoraMenores}.`
        : actuaciones.autoridadReceptora;

    const digitosPrefijados = (
      obj: Record<string, string>,
      prefijo: string,
    ): Record<string, string> =>
      Object.fromEntries(Object.entries(obj).map(([k, v]) => [`${prefijo}_${k}`, v]));

    const datosGlobales: Record<string, string> = {
      DEPARTAMENTO: lugarProcedimiento.departamento,
      MUNICIPIO: lugarProcedimiento.municipio,
      FECHA_INFORME_ANIO: String(hoy.getUTCFullYear()),
      FECHA_INFORME_MES: String(hoy.getUTCMonth() + 1).padStart(2, '0'),
      FECHA_INFORME_DIA: String(hoy.getUTCDate()).padStart(2, '0'),
      DESTINO_INFORME: destinoInforme,
      // Adenda 2026-08-20: bug real encontrado por el usuario -- el
      // texto de este campo estaba fijo en la plantilla como
      // "1. Tráfico, Fabricación o Porte de Estupefacientes", sin
      // importar el delito real del procedimiento. Ahora usa el delito
      // real, sin un número de catálogo antepuesto (no se conoce la
      // numeración oficial completa de delitos; si el usuario la
      // suministra más adelante, se puede mapear aquí).
      CONDUCTA_PUNIBLE: procedimiento.delito,
      DIRECCION: lugarProcedimiento.direccion,
      BARRIO: lugarProcedimiento.barrio,
      LOCALIDAD: oNoAporta(lugarProcedimiento.localidad),
      VEREDA: '', // N/A si no aplica (Mapa Documental FPJ5, sección 3)
      CARACTERISTICAS_LUGAR: oNoAporta(lugarProcedimiento.caracteristicas),
      DESCRIPCION_ELEMENTOS: descripcionElementos,
      NARRACION_HECHOS: resultado.texto,
      ANEXO_FPJ6_CANTIDAD: contarAnexo('FPJ6'),
      ANEXO_FPJ7_CANTIDAD: contarAnexo('FPJ7'),
      ANEXO_FPJ8_CANTIDAD: contarAnexo('FPJ8'),
      ANEXO_ACTA_CANTIDAD: contarAnexo('ACTA'),
      FUNCIONARIO_NOMBRE: funcionarioActuante.nombreCompleto,
      FUNCIONARIO_IDENTIFICACION: funcionarioActuante.documento,
      FUNCIONARIO_ENTIDAD: funcionarioActuante.entidad,
      FUNCIONARIO_CARGO: funcionarioActuante.cargo,
      FUNCIONARIO_TELEFONO: funcionarioActuante.telefono,
      FUNCIONARIO_CORREO: funcionarioActuante.correo,
      ...digitosPrefijados(digitosFecha(procedimiento.fechaCaptura), 'CAP'),
      ...digitosPrefijados(digitosHora(procedimiento.horaCaptura), 'CAP'),
      ...digitosPrefijados(digitosFecha(procedimiento.fechaDisposicion), 'DISP'),
      ...digitosPrefijados(digitosHora(procedimiento.horaDisposicion), 'DISP'),
    };

    const bloquesIntervinientes = capturados.map((c, i) => {
      const tipoDocNormalizado = (c.tipoDocumento ?? '').toUpperCase();
      const esCC = tipoDocNormalizado.includes('CC') || tipoDocNormalizado.includes('C.C');
      const generoM = (c.genero ?? '').toUpperCase().startsWith('M');

      return {
        ETIQUETA_INTERVINIENTE:
          capturados.length > 1
            ? `Interviniente ${i + 1} de ${capturados.length}`
            : '',
        PRIMER_NOMBRE: c.primerNombre,
        SEGUNDO_NOMBRE: oNoAporta(c.segundoNombre) === 'No aporta' ? '' : c.segundoNombre!,
        PRIMER_APELLIDO: c.primerApellido,
        SEGUNDO_APELLIDO: oNoAporta(c.segundoApellido) === 'No aporta' ? '' : c.segundoApellido!,
        ALIAS: c.alias ?? '',
        DOC_CHECK_CC: c.tipoDocumento ? (esCC ? 'X' : '') : '',
        DOC_CHECK_OTRA: c.tipoDocumento ? (esCC ? '' : 'X') : '',
        NUMERO_DOCUMENTO: oNoAporta(c.numeroDocumento),
        LUGAR_EXPEDICION: oNoAporta(c.expedicionDocumento),
        ...digitosPrefijados({ D1: String(c.edad).padStart(2, '0')[0], D2: String(c.edad).padStart(2, '0')[1] }, 'EDAD'),
        GENERO_CHECK_M: generoM ? 'X' : '',
        GENERO_CHECK_F: generoM ? '' : 'X',
        ...digitosPrefijados(
          c.fechaNacimiento
            ? digitosFecha(c.fechaNacimiento)
            : { D1: '', D2: '', M1: '', M2: '', A1: '', A2: '', A3: '', A4: '' },
          'FN',
        ),
        LUGAR_NACIMIENTO: oNoAporta(c.lugarNacimiento),
        ESTADO_CIVIL: oNoAporta(c.estadoCivil),
        ESCOLARIDAD: oNoAporta(c.escolaridad),
        OCUPACION: oNoAporta(c.ocupacion),
        CORREO_REDES: oNoAporta(
          [c.correo, c.redesSociales].filter(Boolean).join(' / ') || undefined,
        ),
        SENALES_PARTICULARES: c.senalesParticulares ?? '', // en blanco si no se capturó (excepción a "No aporta")
        NOMBRE_PADRES: oNoAporta(c.nombrePadres),
        PADRES_CONTACTO: oNoAporta(c.telefonoPadres),
      };
    });

    // Adenda 2026-08-20: Sección 5 (Testigos de los Hechos). Si no hay
    // testigos registrados, se usa un único bloque con los mismos
    // valores fijos que ya traía la plantilla ("NO APLICA" / casillas en
    // blanco) para no cambiar la apariencia de los informes existentes
    // (Regla automática FPJ5 #4: "Testigos solo si existen").
    const SIN_TESTIGOS_BLOQUE: Record<string, string> = {
      TESTIGO_PRIMER_NOMBRE: 'NO APLICA',
      TESTIGO_SEGUNDO_NOMBRE: 'NO APLICA',
      TESTIGO_PRIMER_APELLIDO: 'NO APLICA',
      TESTIGO_SEGUNDO_APELLIDO: 'NO APLICA',
      TESTIGO_DOC_CHECK_CC: '',
      TESTIGO_DOC_CHECK_OTRA: '',
      TESTIGO_NUMERO_DOCUMENTO: '',
      TESTIGO_LUGAR_EXPEDICION: '',
      TESTIGO_EDAD_D1: '',
      TESTIGO_EDAD_D2: '',
      TESTIGO_GENERO_CHECK_M: '',
      TESTIGO_GENERO_CHECK_F: '',
      TESTIGO_FN_D1: '',
      TESTIGO_FN_D2: '',
      TESTIGO_FN_M1: '',
      TESTIGO_FN_M2: '',
      TESTIGO_FN_A1: '',
      TESTIGO_FN_A2: '',
      TESTIGO_FN_A3: '',
      TESTIGO_FN_A4: '',
      TESTIGO_PAIS_NACIMIENTO: 'NO APLICA',
      TESTIGO_DEPARTAMENTO_NACIMIENTO: 'NO APLICA',
      TESTIGO_MUNICIPIO_NACIMIENTO: 'NO APLICA',
      TESTIGO_PROFESION_OFICIO: 'NO APLICA',
      TESTIGO_ESTADO_CIVIL: 'NO APLICA',
      TESTIGO_DIRECCION: 'NO APLICA',
      TESTIGO_TELEFONO: 'NO APLICA',
      TESTIGO_CORREO: 'NO APLICA',
    };

    const bloquesTestigos: Record<string, string>[] =
      testigos.length > 0
        ? testigos.map((t) => {
            const tipoDocNormalizado = (t.tipoDocumento ?? '').toUpperCase();
            const esCC = tipoDocNormalizado.includes('CC') || tipoDocNormalizado.includes('C.C');
            const generoM = (t.genero ?? '').toUpperCase().startsWith('M');
            const digitosEdad =
              t.edad !== null && t.edad !== undefined
                ? String(t.edad).padStart(2, '0')
                : '  ';

            return {
              TESTIGO_PRIMER_NOMBRE: t.primerNombre,
              TESTIGO_SEGUNDO_NOMBRE: oNoAporta(t.segundoNombre) === 'No aporta' ? '' : t.segundoNombre!,
              TESTIGO_PRIMER_APELLIDO: t.primerApellido,
              TESTIGO_SEGUNDO_APELLIDO: oNoAporta(t.segundoApellido) === 'No aporta' ? '' : t.segundoApellido!,
              TESTIGO_DOC_CHECK_CC: t.tipoDocumento ? (esCC ? 'X' : '') : '',
              TESTIGO_DOC_CHECK_OTRA: t.tipoDocumento ? (esCC ? '' : 'X') : '',
              TESTIGO_NUMERO_DOCUMENTO: oNoAporta(t.numeroDocumento),
              TESTIGO_LUGAR_EXPEDICION: oNoAporta(t.expedicionDocumento),
              TESTIGO_EDAD_D1: digitosEdad[0] ?? '',
              TESTIGO_EDAD_D2: digitosEdad[1] ?? '',
              TESTIGO_GENERO_CHECK_M: t.genero ? (generoM ? 'X' : '') : '',
              TESTIGO_GENERO_CHECK_F: t.genero ? (generoM ? '' : 'X') : '',
              ...digitosPrefijados(
                t.fechaNacimiento
                  ? digitosFecha(t.fechaNacimiento)
                  : { D1: '', D2: '', M1: '', M2: '', A1: '', A2: '', A3: '', A4: '' },
                'TESTIGO_FN',
              ),
              TESTIGO_PAIS_NACIMIENTO: oNoAporta(t.paisNacimiento),
              TESTIGO_DEPARTAMENTO_NACIMIENTO: oNoAporta(t.departamentoNacimiento),
              TESTIGO_MUNICIPIO_NACIMIENTO: oNoAporta(t.municipioNacimiento),
              TESTIGO_PROFESION_OFICIO: oNoAporta(t.profesionOficio),
              TESTIGO_ESTADO_CIVIL: oNoAporta(t.estadoCivil),
              TESTIGO_DIRECCION: oNoAporta(t.direccion),
              TESTIGO_TELEFONO: oNoAporta(t.telefono),
              TESTIGO_CORREO: oNoAporta(t.correo),
            };
          })
        : [SIN_TESTIGOS_BLOQUE];

    // Adenda 2026-08-21 (módulo Hurto): Sección 4 (Víctimas). Si no hay
    // víctimas registradas, se usa un único bloque con los mismos
    // valores fijos que ya traía la plantilla ("NO APLICA" / casillas en
    // blanco) -- esto es lo que mantiene intacta la Regla automática de
    // Estupefacientes ("la víctima corresponde al bien jurídico
    // protegido Salud Pública"), ya que ese módulo nunca registra
    // víctimas y por lo tanto siempre cae en este fallback.
    const SIN_VICTIMAS_BLOQUE: Record<string, string> = {
      VICTIMA_PRIMER_NOMBRE: 'NO APLICA',
      VICTIMA_SEGUNDO_NOMBRE: 'NO APLICA',
      VICTIMA_PRIMER_APELLIDO: 'NO APLICA',
      VICTIMA_SEGUNDO_APELLIDO: 'NO APLICA',
      VICTIMA_DOC_CHECK_CC: '',
      VICTIMA_DOC_CHECK_OTRA: '',
      VICTIMA_NUMERO_DOCUMENTO: '',
      VICTIMA_LUGAR_EXPEDICION: '',
      VICTIMA_EDAD_D1: '',
      VICTIMA_EDAD_D2: '',
      VICTIMA_GENERO_CHECK_M: '',
      VICTIMA_GENERO_CHECK_F: '',
      VICTIMA_FN_D1: '',
      VICTIMA_FN_D2: '',
      VICTIMA_FN_M1: '',
      VICTIMA_FN_M2: '',
      VICTIMA_FN_A1: '',
      VICTIMA_FN_A2: '',
      VICTIMA_FN_A3: '',
      VICTIMA_FN_A4: '',
      VICTIMA_PAIS_NACIMIENTO: 'NO APLICA',
      VICTIMA_DEPARTAMENTO_NACIMIENTO: 'NO APLICA',
      VICTIMA_MUNICIPIO_NACIMIENTO: 'NO APLICA',
      VICTIMA_PROFESION_OFICIO: 'NO APLICA',
      VICTIMA_ESTADO_CIVIL: 'NO APLICA',
      VICTIMA_DIRECCION: 'NO APLICA',
      VICTIMA_TELEFONO: 'NO APLICA',
      VICTIMA_CORREO: 'NO APLICA',
      VICTIMA_RELACION_INDICIADO: 'NO APLICA',
    };

    const bloquesVictimas: Record<string, string>[] =
      victimas.length > 0
        ? victimas.map((v) => {
            const tipoDocNormalizado = (v.tipoDocumento ?? '').toUpperCase();
            const esCC = tipoDocNormalizado.includes('CC') || tipoDocNormalizado.includes('C.C');
            const generoM = (v.genero ?? '').toUpperCase().startsWith('M');
            const digitosEdad =
              v.edad !== null && v.edad !== undefined
                ? String(v.edad).padStart(2, '0')
                : '  ';

            return {
              VICTIMA_PRIMER_NOMBRE: v.primerNombre,
              VICTIMA_SEGUNDO_NOMBRE: oNoAporta(v.segundoNombre) === 'No aporta' ? '' : v.segundoNombre!,
              VICTIMA_PRIMER_APELLIDO: v.primerApellido,
              VICTIMA_SEGUNDO_APELLIDO: oNoAporta(v.segundoApellido) === 'No aporta' ? '' : v.segundoApellido!,
              VICTIMA_DOC_CHECK_CC: v.tipoDocumento ? (esCC ? 'X' : '') : '',
              VICTIMA_DOC_CHECK_OTRA: v.tipoDocumento ? (esCC ? '' : 'X') : '',
              VICTIMA_NUMERO_DOCUMENTO: oNoAporta(v.numeroDocumento),
              VICTIMA_LUGAR_EXPEDICION: oNoAporta(v.expedicionDocumento),
              VICTIMA_EDAD_D1: digitosEdad[0] ?? '',
              VICTIMA_EDAD_D2: digitosEdad[1] ?? '',
              VICTIMA_GENERO_CHECK_M: v.genero ? (generoM ? 'X' : '') : '',
              VICTIMA_GENERO_CHECK_F: v.genero ? (generoM ? '' : 'X') : '',
              ...digitosPrefijados(
                v.fechaNacimiento
                  ? digitosFecha(v.fechaNacimiento)
                  : { D1: '', D2: '', M1: '', M2: '', A1: '', A2: '', A3: '', A4: '' },
                'VICTIMA_FN',
              ),
              VICTIMA_PAIS_NACIMIENTO: oNoAporta(v.paisNacimiento),
              VICTIMA_DEPARTAMENTO_NACIMIENTO: oNoAporta(v.departamentoNacimiento),
              VICTIMA_MUNICIPIO_NACIMIENTO: oNoAporta(v.municipioNacimiento),
              VICTIMA_PROFESION_OFICIO: oNoAporta(v.profesionOficio),
              VICTIMA_ESTADO_CIVIL: oNoAporta(v.estadoCivil),
              VICTIMA_DIRECCION: oNoAporta(v.direccion),
              VICTIMA_TELEFONO: oNoAporta(v.telefono),
              VICTIMA_CORREO: oNoAporta(v.correo),
              VICTIMA_RELACION_INDICIADO: oNoAporta(v.relacionIndiciado),
            };
          })
        : [SIN_VICTIMAS_BLOQUE];

    const buffer = rellenarPlantillaConBloqueRepetible(
      plantilla,
      datosGlobales,
      bloquesIntervinientes,
      {
        bloquesAdicionales: [
          {
            marcadorInicio: '%%%BLOQUE_TESTIGO_INICIO%%%',
            marcadorFin: '%%%BLOQUE_TESTIGO_FIN%%%',
            bloques: bloquesTestigos,
          },
          {
            marcadorInicio: '%%%BLOQUE_VICTIMA_INICIO%%%',
            marcadorFin: '%%%BLOQUE_VICTIMA_FIN%%%',
            bloques: bloquesVictimas,
          },
        ],
      },
    );

    const version =
      (await this.prisma.documentoGenerado.count({
        where: { procedimientoId, tipoDocumento: 'FPJ5' },
      })) + 1;

    const carpetaDestino = path.join(CARPETA_ALMACENAMIENTO, procedimientoId);
    fs.mkdirSync(carpetaDestino, { recursive: true });
    const nombreArchivo = `FPJ5-${procedimientoId}-v${version}.docx`;
    const rutaArchivo = path.join(carpetaDestino, nombreArchivo);
    fs.writeFileSync(rutaArchivo, buffer);

    const documentoGenerado = await this.prisma.documentoGenerado.create({
      data: {
        procedimientoId,
        tipoDocumento: 'FPJ5',
        fechaGeneracion: new Date(),
        version,
        procedimientoVersion: 1,
        rutaArchivo,
        estado: version > 1 ? 'Regenerado' : 'Generado',
      },
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: version > 1 ? 'Regenerar' : 'Crear',
      tablaAfectada: 'documentos_generados',
      registroAfectado: documentoGenerado.id,
      descripcionEvento: `FPJ-5 generado (v${version}) para el procedimiento ${procedimientoId} con narración automática por IA.`,
      procedimientoId,
    });

    return documentoGenerado;
  }

  /**
   * Genera el FPJ-7 (Rótulo de Elemento Material Probatorio y Evidencia
   * Física). REGLA INV-FPJ7-001/010/011: un único FPJ-7 por elemento
   * incautado, independientemente del número de intervinientes.
   */
  async generarFpj7Rotulo(
    procedimientoId: string,
    elementoId: string,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    const procedimiento = await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.verificarPagoAprobado(procedimiento);
    await this.verificarDocumentoNoGeneradoAntes(procedimientoId, 'FPJ7', { elementoId }, procedimiento.edicionDesbloqueada);

    const elemento = await this.prisma.elementoIncautado.findUnique({
      where: { id: elementoId },
      include: { capturado: true },
    });
    if (!elemento || elemento.procedimientoId !== procedimientoId) {
      throw new NotFoundException('Elemento no encontrado en este procedimiento.');
    }

    const [funcionarioActuante, lugarProcedimiento, elementosDelProcedimiento] =
      await Promise.all([
        this.prisma.funcionarioActuante.findUnique({ where: { procedimientoId } }),
        this.prisma.lugarProcedimiento.findUnique({ where: { procedimientoId } }),
        this.prisma.elementoIncautado.findMany({
          where: { procedimientoId },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
    if (!funcionarioActuante) {
      throw new BadRequestException('Debe registrar el funcionario actuante antes de generar el FPJ-7.');
    }
    if (!lugarProcedimiento) {
      throw new BadRequestException('Debe registrar el lugar del procedimiento antes de generar el FPJ-7.');
    }

    // REGLA (Sección 2, Mapa Documental FPJ-7): numeración EMP-001, EMP-002...
    // secuencial y consecutiva entre TODOS los elementos del procedimiento,
    // en el orden en que fueron registrados (no solo los del mismo interviniente).
    const indice = elementosDelProcedimiento.findIndex((e) => e.id === elementoId);
    const numeroEmpEf = `EMP-${String(indice + 1).padStart(3, '0')}`;

    const capturado = elemento.capturado;
    // Adenda 2026-08-14: elemento "sin individualizar" (capturado ===
    // null) -- hallado en un lugar común, sin poder atribuirse a una
    // persona específica. A solicitud del usuario: en este campo del
    // FPJ-7 se deja claridad del lugar exacto donde se halló (vehículo,
    // suelo, etc. -- lo que el funcionario haya escrito en
    // ubicacionHallazgo/direccionIncautacion), en vez de un nombre.
    const nombrePersonaHallazgo = capturado
      ? `${[capturado.primerNombre, capturado.segundoNombre, capturado.primerApellido, capturado.segundoApellido]
          .filter(Boolean)
          .join(' ')} (${oNoAporta(capturado.numeroDocumento)})`
      : `No fue posible individualizar a una persona específica. Hallado en: ${oNoAporta(elemento.ubicacionHallazgo)}, ${elemento.direccionIncautacion}.`;

    // REGLA (Sección 1, Mapa Documental FPJ-7): fecha/hora = captura o
    // aprehensión oficial. NUNCA derechos, comunicación ni disposición.
    const digitosFechaRecoleccion = digitosFecha(procedimiento.fechaCaptura);
    const digitosHoraRecoleccion = digitosHora(procedimiento.horaCaptura);

    const datos: Record<string, string> = {
      NUMERO_EMP_EF: numeroEmpEf,
      CANTIDAD_ELEMENTO: String(
        elemento.tipoElemento === 'SUSTANCIA'
          ? await this.contarEmpaques(elementoId)
          : 1,
      ),
      DIRECCION_HALLAZGO: elemento.direccionIncautacion,
      UBICACION_HALLAZGO: oNoAporta(elemento.ubicacionHallazgo),
      NOMBRE_PERSONA_HALLAZGO: nombrePersonaHallazgo,
      DESCRIPCION_ELEMENTO: elemento.descripcionBase,
      FUNCIONARIO_NOMBRE: funcionarioActuante.nombreCompleto,
      FUNCIONARIO_DOCUMENTO: funcionarioActuante.documento,
      FUNCIONARIO_ENTIDAD: funcionarioActuante.entidad,
      FUNCIONARIO_CARGO: funcionarioActuante.cargo,
      REC_A1: digitosFechaRecoleccion.A1,
      REC_A2: digitosFechaRecoleccion.A2,
      REC_A3: digitosFechaRecoleccion.A3,
      REC_A4: digitosFechaRecoleccion.A4,
      REC_M1: digitosFechaRecoleccion.M1,
      REC_M2: digitosFechaRecoleccion.M2,
      REC_D1: digitosFechaRecoleccion.D1,
      REC_D2: digitosFechaRecoleccion.D2,
      REC_H1: digitosHoraRecoleccion.H1,
      REC_H2: digitosHoraRecoleccion.H2,
      REC_H3: digitosHoraRecoleccion.H3,
      REC_H4: digitosHoraRecoleccion.H4,
    };

    const buffer = rellenarPlantillaWord(PLANTILLA_FPJ7, datos);

    const version =
      (await this.prisma.documentoGenerado.count({
        where: { elementoId, tipoDocumento: 'FPJ7' },
      })) + 1;

    const carpetaDestino = path.join(CARPETA_ALMACENAMIENTO, procedimientoId);
    fs.mkdirSync(carpetaDestino, { recursive: true });
    const nombreArchivo = `FPJ7-${elemento.id}-v${version}.docx`;
    const rutaArchivo = path.join(carpetaDestino, nombreArchivo);
    fs.writeFileSync(rutaArchivo, buffer);

    const documentoGenerado = await this.prisma.documentoGenerado.create({
      data: {
        procedimientoId,
        tipoDocumento: 'FPJ7',
        elementoId,
        fechaGeneracion: new Date(),
        version,
        procedimientoVersion: 1,
        rutaArchivo,
        estado: version > 1 ? 'Regenerado' : 'Generado',
      },
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: version > 1 ? 'Regenerar' : 'Crear',
      tablaAfectada: 'documentos_generados',
      registroAfectado: documentoGenerado.id,
      descripcionEvento: `FPJ-7 (${numeroEmpEf}) generado (v${version}) para el elemento ${elementoId}.`,
      procedimientoId,
    });

    return documentoGenerado;
  }

  /** Suma la cantidad de empaques cuando el elemento es una sustancia. */
  private async contarEmpaques(elementoId: string): Promise<number> {
    const detalle = await this.prisma.detalleSustancia.findUnique({
      where: { elementoId },
    });
    return detalle?.cantidadEmpaques ?? 1;
  }

  /**
   * Genera el FPJ-8 (Registro de Cadena de Custodia). REGLA
   * INV-FPJ8-001/002/003: un único FPJ-8 por elemento incautado, con
   * correspondencia directa con el FPJ-7 del mismo elemento (misma
   * numeración EMP-XXX, misma descripción). Solo se diligencia el
   * anverso (página 1); el reverso (página 2, registro de continuidad y
   * PIPH) queda en blanco para diligenciamiento manual posterior
   * (REGLA INV-FPJ8-014/015).
   */
  async generarFpj8CadenaCustodia(
    procedimientoId: string,
    elementoId: string,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    const procedimiento = await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    await this.verificarPagoAprobado(procedimiento);
    await this.verificarDocumentoNoGeneradoAntes(procedimientoId, 'FPJ8', { elementoId }, procedimiento.edicionDesbloqueada);

    const elemento = await this.prisma.elementoIncautado.findUnique({
      where: { id: elementoId },
      include: { capturado: true },
    });
    if (!elemento || elemento.procedimientoId !== procedimientoId) {
      throw new NotFoundException('Elemento no encontrado en este procedimiento.');
    }

    const funcionarioActuante = await this.prisma.funcionarioActuante.findUnique({
      where: { procedimientoId },
    });
    if (!funcionarioActuante) {
      throw new BadRequestException('Debe registrar el funcionario actuante antes de generar el FPJ-8.');
    }

    // REGLA INV-FPJ8-008/009: únicamente fecha de captura/aprehensión,
    // sin hora (el formato FPJ-8 no utiliza hora).
    const fecha = procedimiento.fechaCaptura;
    const fechaRecoleccion = [
      fecha.getUTCFullYear(),
      String(fecha.getUTCMonth() + 1).padStart(2, '0'),
      String(fecha.getUTCDate()).padStart(2, '0'),
    ].join('-');

    const datos: Record<string, string> = {
      FUNCIONARIO_NOMBRE: funcionarioActuante.nombreCompleto,
      FUNCIONARIO_DOCUMENTO: funcionarioActuante.documento,
      FUNCIONARIO_ENTIDAD: funcionarioActuante.entidad,
      FECHA_RECOLECCION: fechaRecoleccion,
      DESCRIPCION_ELEMENTO: elemento.descripcionBase,
    };

    const buffer = rellenarPlantillaWord(PLANTILLA_FPJ8, datos);

    const version =
      (await this.prisma.documentoGenerado.count({
        where: { elementoId, tipoDocumento: 'FPJ8' },
      })) + 1;

    const carpetaDestino = path.join(CARPETA_ALMACENAMIENTO, procedimientoId);
    fs.mkdirSync(carpetaDestino, { recursive: true });
    const nombreArchivo = `FPJ8-${elemento.id}-v${version}.docx`;
    const rutaArchivo = path.join(carpetaDestino, nombreArchivo);
    fs.writeFileSync(rutaArchivo, buffer);

    const documentoGenerado = await this.prisma.documentoGenerado.create({
      data: {
        procedimientoId,
        tipoDocumento: 'FPJ8',
        elementoId,
        fechaGeneracion: new Date(),
        version,
        procedimientoVersion: 1,
        rutaArchivo,
        estado: version > 1 ? 'Regenerado' : 'Generado',
      },
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: version > 1 ? 'Regenerar' : 'Crear',
      tablaAfectada: 'documentos_generados',
      registroAfectado: documentoGenerado.id,
      descripcionEvento: `FPJ-8 generado (v${version}) para el elemento ${elementoId}.`,
      procedimientoId,
    });

    return documentoGenerado;
  }

  async obtenerArchivo(documentoId: string, usuarioId: string, rol?: string) {
    const documento = await this.prisma.documentoGenerado.findUnique({
      where: { id: documentoId },
    });
    if (!documento) {
      throw new NotFoundException('Documento no encontrado.');
    }
    await this.acceso.verificarPropiedad(documento.procedimientoId, usuarioId, rol);

    if (!fs.existsSync(documento.rutaArchivo)) {
      throw new NotFoundException('El archivo físico del documento no existe en el servidor.');
    }

    return documento;
  }

  async listar(procedimientoId: string, usuarioId: string, rol?: string) {
    await this.acceso.verificarPropiedad(procedimientoId, usuarioId, rol);
    return this.prisma.documentoGenerado.findMany({
      where: { procedimientoId },
      orderBy: { fechaGeneracion: 'desc' },
    });
  }
}
