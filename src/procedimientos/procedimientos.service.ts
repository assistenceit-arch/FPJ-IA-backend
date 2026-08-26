import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ProcedimientoAccesoService } from './procedimiento-acceso.service';

import { CreateProcedimientoDto } from './dto/create-procedimiento.dto';
import { UpdateProcedimientoDto } from './dto/update-procedimiento.dto';
import { calcularDemoraExistente, obtenerCapturaMasAntigua, validarOrdenFechas } from '../actuaciones-procedimiento/demora.util';

// Adenda 2026-08-23: política de retención -- todo procedimiento se
// borra físicamente 7 días después de fechaCreacion (ver
// LimpiezaAutomaticaService, que ejecuta el borrado real). Esta función
// solo calcula cuántos días faltan para que eso ocurra, para que el
// frontend pueda mostrar el aviso a partir del día 5 (cuando quedan 2
// días o menos). Puede devolver un número negativo en el borde exacto
// entre que se cumple el plazo y que la purga horaria todavía no ha
// corrido -- el frontend debe tratar cualquier valor <= 0 igual que 0.
function diasParaEliminacion(fechaCreacion: Date): number {
  const limite = new Date(fechaCreacion);
  limite.setDate(limite.getDate() + 7);
  const msPorDia = 1000 * 60 * 60 * 24;
  return Math.ceil((limite.getTime() - Date.now()) / msPorDia);
}

@Injectable()
export class ProcedimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly acceso: ProcedimientoAccesoService,
  ) {}

  /**
   * WF-M1-001: genera el número interno EST-AAAA-CONSECUTIVO.
   * Consecutivo simple basado en el conteo de procedimientos del año.
   * (Para producción con alta concurrencia, esto debería ir en una
   * secuencia/transacción dedicada; queda documentado como mejora futura.)
   */
  /**
   * Corrección 2026-08-26: bug real reportado tras prueba en vivo --
   * "Unique constraint failed on the fields: (numeroInterno)".
   *
   * Antes se calculaba el siguiente número CONTANDO cuántos
   * procedimientos existen ahora mismo (`count()` + 1). Eso se rompe
   * en cuanto existe algún borrado -- y desde que existe la política
   * de retención (los procedimientos se borran automáticamente a los
   * 7 días de creados), siempre hay borrados ocurriendo en segundo
   * plano. Ejemplo real: se llegó a crear hasta el número 000015, pero
   * los primeros 10 ya se borraron por retención -- el conteo ve solo
   * 5 restantes y genera "000006", que ya existe entre los 5 que
   * quedan (del 000006 al 000015). Choque de restricción única.
   *
   * Corregido para buscar el número MÁS ALTO que realmente existe
   * (no cuántos quedan) y sumarle 1 -- esto es correcto sin importar
   * cuántos de los números anteriores se hayan borrado, porque los
   * procedimientos más nuevos (los de número más alto) son
   * precisamente los que la retención tarda más en alcanzar.
   */
  private async generarNumeroInterno(): Promise<string> {
    const anio = new Date().getFullYear();
    const ultimo = await this.prisma.procedimiento.findFirst({
      where: { numeroInterno: { startsWith: `EST-${anio}-` } },
      orderBy: { numeroInterno: 'desc' },
      select: { numeroInterno: true },
    });
    // El orden lexicográfico de string coincide con el numérico aquí
    // porque todos los consecutivos tienen el mismo relleno de 6
    // dígitos (padStart) -- "000010" sí ordena después de "000009".
    const ultimoConsecutivo = ultimo?.numeroInterno
      ? parseInt(ultimo.numeroInterno.split('-')[2] ?? '0', 10) || 0
      : 0;
    const consecutivo = String(ultimoConsecutivo + 1).padStart(6, '0');
    return `EST-${anio}-${consecutivo}`;
  }

  async create(dto: CreateProcedimientoDto, usuarioId: string, correoUsuario: string) {
    // Corrección 2026-08-26: protección adicional, independiente de la
    // corrección anterior -- si dos procedimientos se crean casi al
    // mismo instante (dos funcionarios distintos, o cualquier otra
    // coincidencia de tiempo), ambos podrían calcular el mismo
    // "siguiente número" antes de que el primero termine de guardarse.
    // En vez de fallar con un error 500 ante el usuario, se reintenta
    // automáticamente con el siguiente número disponible, hasta 3
    // veces -- suficiente para cualquier coincidencia real, sin
    // arriesgar un bucle infinito ante un problema distinto.
    const MAX_INTENTOS = 3;
    let ultimoError: unknown;

    for (let intento = 0; intento < MAX_INTENTOS; intento++) {
      const numeroInterno = await this.generarNumeroInterno();
      try {
        const procedimiento = await this.prisma.procedimiento.create({
          data: {
            ...dto,
            estado: 'Borrador', // VF-006: el estado inicial lo controla el sistema, no el cliente.
            numeroInterno,
            usuarioId,
          },
        });

        await this.auditoria.registrar({
          usuario: correoUsuario,
          accion: 'Crear',
          tablaAfectada: 'procedimientos',
          registroAfectado: procedimiento.id,
          descripcionEvento: `Creación del procedimiento ${numeroInterno}`,
          procedimientoId: procedimiento.id,
          numeroInterno: numeroInterno ?? undefined,
        });

        return procedimiento;
      } catch (error) {
        const esChoqueDeNumero =
          error instanceof PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          (error.meta?.target as string[] | undefined)?.includes('numeroInterno');

        if (!esChoqueDeNumero) {
          throw error;
        }
        ultimoError = error;
        // Se reintenta el bucle -- generarNumeroInterno() vuelve a
        // consultar el máximo real, que ya incluye el procedimiento
        // que acaba de chocar.
      }
    }

    throw ultimoError;
  }

  // WF-AUT-005: cada usuario ve únicamente sus propios procedimientos.
  async findAll(usuarioId: string) {
    const procedimientos = await this.prisma.procedimiento.findMany({
      where: { usuarioId, activo: true },
      orderBy: { fechaCreacion: 'desc' },
    });
    return procedimientos.map((p) => ({ ...p, diasParaEliminacion: diasParaEliminacion(p.fechaCreacion) }));
  }

  async findOne(id: string, usuarioId: string, rol?: string) {
    const procedimiento = await this.prisma.procedimiento.findUnique({
      where: { id },
    });

    if (!procedimiento || !procedimiento.activo) {
      throw new NotFoundException('Procedimiento no encontrado');
    }
    this.verificarPropiedad(procedimiento, usuarioId, rol);

    // Adenda 2026-08-06: "Borrador"/"Finalizado" se recalcula cada vez
    // que se consulta el procedimiento (patrón "recompute-on-read"),
    // en vez de intentar sincronizarlo en cada uno de los muchos
    // endpoints que podrían afectar alguno de los 8 bloques. Como el
    // frontend consulta este endpoint en cada navegación entre bloques,
    // en la práctica queda al día. Decisión del usuario: Finalizado
    // cuando los 8 bloques del formulario único están en verde.
    const completo = await this.todosLosBloquesCompletos(procedimiento);
    const estadoCorrecto = completo ? 'Finalizado' : 'Borrador';
    if (procedimiento.estado !== estadoCorrecto) {
      const actualizado = await this.prisma.procedimiento.update({
        where: { id },
        data: { estado: estadoCorrecto },
      });
      return { ...actualizado, diasParaEliminacion: diasParaEliminacion(actualizado.fechaCreacion) };
    }

    return { ...procedimiento, diasParaEliminacion: diasParaEliminacion(procedimiento.fechaCreacion) };
  }

  private textoCompleto(v: string | null | undefined): boolean {
    return Boolean(v && v.trim());
  }

  /**
   * Corrección 2026-08-26: bug real reportado tras prueba en vivo --
   * un procedimiento con documentos ya generados quedaba bloqueado
   * para siempre en este endpoint específico (PATCH /procedimientos/:id,
   * donde se guarda la puesta a disposición), incluso DESPUÉS de que un
   * administrador desbloqueara la edición desde el panel. Causa: esta
   * clase tenía su propia copia privada de "verificarNoBloqueado" que
   * nunca revisaba el campo `edicionDesbloqueada` -- a diferencia de
   * ProcedimientoAccesoService.verificarNoBloqueado (ya usado
   * correctamente por el resto del sistema, ej. DocumentosService), que
   * sí lo revisa. Se elimina la copia duplicada y desactualizada; ahora
   * se usa directamente la versión compartida y correcta.
   */

  /**
   * Adenda 2026-08-08: en un procedimiento COMPLEJO, los Bloques 1 a 7
   * quedan deshabilitados hasta que un administrador verifique el pago.
   * Aquí cubre la puesta a disposición (parte del Bloque 5), que se
   * guarda a través de este mismo endpoint.
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

  /**
   * Replica en el backend el mismo criterio de "completo" que ya usa el
   * frontend (src/lib/estados.ts) para pintar los 8 puntos de color del
   * menú lateral, para no depender de que el cliente reporte
   * honestamente si terminó o no.
   */
  private async todosLosBloquesCompletos(procedimiento: {
    id: string;
    fechaCaptura: Date;
    horaCaptura: string;
    fechaDisposicion: Date | null;
    horaDisposicion: string | null;
    exoneradoPago: boolean;
  }): Promise<boolean> {
    const [funcionario, lugar, capturados, actuaciones, documentosCount, pago] = await Promise.all([
      this.prisma.funcionarioActuante.findUnique({ where: { procedimientoId: procedimiento.id } }),
      this.prisma.lugarProcedimiento.findUnique({ where: { procedimientoId: procedimiento.id } }),
      this.prisma.capturado.findMany({
        where: { procedimientoId: procedimiento.id },
      }),
      this.prisma.actuacionesProcedimiento.findUnique({ where: { procedimientoId: procedimiento.id } }),
      this.prisma.documentoGenerado.count({ where: { procedimientoId: procedimiento.id } }),
      this.prisma.pago.findUnique({ where: { procedimientoId: procedimiento.id } }),
    ]);

    // 1. Funcionario
    const funcionarioOk =
      !!funcionario &&
      [
        funcionario.nombreCompleto,
        funcionario.documento,
        funcionario.entidad,
        funcionario.cargo,
        funcionario.telefono,
        funcionario.correo,
        funcionario.placa,
        funcionario.zonaAtencion,
        funcionario.estacion,
        funcionario.servicio,
        funcionario.cai,
      ].every((v) => this.textoCompleto(v));

    // 2. Intervinientes (binario, igual que Elementos)
    const intervinientesOk = capturados.length > 0;

    // 3. Lugar
    const lugarOk =
      !!lugar &&
      [lugar.departamento, lugar.municipio, lugar.barrio, lugar.direccion].every((v) =>
        this.textoCompleto(v),
      );

    // 4. Elementos incautados (Adenda 2026-08-22: antes exigía al menos
    // uno -- bug real reportado tras caso en vivo de Hurto: no hay
    // ninguna razón operativa para bloquear un procedimiento que
    // válidamente no incautó nada. Una vez se sabe con certeza cuántos
    // elementos hay (la consulta ya se ejecutó), cero es tan válido
    // como cualquier otra cantidad -- mismo criterio que el frontend en
    // estadoElementos, src/lib/estados.ts).
    const elementosOk = true;

    // 5. Actuaciones procedimentales
    let actuacionesOk = false;
    if (actuaciones) {
      // Adenda 2026-08-20: en procedimientos mixtos, la autoridad
      // receptora se pide individualizada por grupo (mayores/menores)
      // en vez del campo único.
      const esMixto =
        capturados.some((c) => c.tipoInterviniente === 'CAPTURADO') &&
        capturados.some((c) => c.tipoInterviniente === 'APREHENDIDO');

      const requeridos = esMixto
        ? [
            this.textoCompleto(actuaciones.autoridadReceptoraAdultos),
            this.textoCompleto(actuaciones.autoridadReceptoraMenores),
          ]
        : [this.textoCompleto(actuaciones.autoridadReceptora)];
      requeridos.push(
        procedimiento.fechaDisposicion != null,
        this.textoCompleto(procedimiento.horaDisposicion),
      );
      // Adenda 2026-08-21: la hora de captura ya no es un solo valor del
      // procedimiento -- se usa la más antigua entre los intervinientes,
      // con el valor de creación del procedimiento como respaldo (ver
      // demora.util.ts).
      const capturaMasAntigua = obtenerCapturaMasAntigua(procedimiento, capturados);
      if (calcularDemoraExistente({ ...procedimiento, ...capturaMasAntigua })) {
        requeridos.push(this.textoCompleto(actuaciones.justificacionDemora));
      }

      // Adenda 2026-08-21: lectura de derechos individual por
      // interviniente (antes era una sola respuesta en Actuaciones para
      // todo el procedimiento) -- bug real reportado tras caso en vivo:
      // no permitía capturas/aprehensiones en horas distintas dentro de
      // un mismo procedimiento. Mismo criterio de "sin responder" que
      // esposas/lesiones.
      const derechosOk = capturados.every((c) => {
        if (c.derechosLeidos === null || c.derechosLeidos === undefined) return false;
        if (c.derechosLeidos === true) {
          if (c.fechaCaptura === null || !this.textoCompleto(c.horaCaptura)) return false;
          return c.comprendeDerechos !== null && c.comprendeDerechos !== undefined;
        }
        return true;
      });

      const aprehendidos = capturados.filter((c) => c.tipoInterviniente === 'APREHENDIDO');
      const esposasOk = aprehendidos.every((a) => {
        if (a.usoEsposas === null || a.usoEsposas === undefined) return false;
        if (a.usoEsposas === true) return this.textoCompleto(a.justificacionEsposas);
        return true;
      });

      // Adenda 2026-08-11: lesiones pasa a ser individual por
      // interviniente (antes vivía en actuaciones, general para todo el
      // procedimiento), mismo criterio ya aplicado a esposas.
      const lesionesOk = capturados.every((c) => {
        if (c.presentaLesiones === null || c.presentaLesiones === undefined) return false;
        if (c.presentaLesiones === true) {
          if (!this.textoCompleto(c.descripcionLesiones)) return false;
          if (c.trasladoCentroAsistencial === null || c.trasladoCentroAsistencial === undefined) return false;
          if (c.trasladoCentroAsistencial === true) {
            return this.textoCompleto(c.centroAsistencial) && this.textoCompleto(c.motivoTraslado);
          }
        }
        return true;
      });

      actuacionesOk = requeridos.every(Boolean) && derechosOk && esposasOk && lesionesOk;
    }

    // 6. Relato de los hechos (comparte registro con Actuaciones)
    let relatoOk = false;
    if (actuaciones) {
      const requeridos = [
        this.textoCompleto(actuaciones.observacionInicial),
        this.textoCompleto(actuaciones.desarrolloIntervencion),
      ];
      if (actuaciones.tieneCircunstanciaRelevante) {
        requeridos.push(this.textoCompleto(actuaciones.circunstanciaRelevante));
      }
      if (actuaciones.tieneObservacionAdicional) {
        requeridos.push(this.textoCompleto(actuaciones.observacionAdicional));
      }
      relatoOk = requeridos.every(Boolean);
    }

    // 7. Documentos (al menos uno generado)
    const documentosOk = documentosCount > 0;

    // 8. Pago (verificado, o el procedimiento fue exonerado por un administrador)
    const pagoOk = procedimiento.exoneradoPago || pago?.estadoPago === 'Verificado';

    return (
      funcionarioOk &&
      intervinientesOk &&
      lugarOk &&
      elementosOk &&
      actuacionesOk &&
      relatoOk &&
      documentosOk &&
      pagoOk
    );
  }

  async update(
    id: string,
    dto: UpdateProcedimientoDto,
    usuarioId: string,
    correoUsuario: string,
    rol?: string,
  ) {
    const existente = await this.findOne(id, usuarioId, rol);
    await this.acceso.verificarNoBloqueado(id);
    await this.verificarPagoComplejoAprobado(id);

    // Corrección 2026-08-26: bug real reportado tras prueba en vivo --
    // guardar la puesta a disposición al final del Bloque 4 fallaba
    // (el autoguardado no lograba completarse). Causa: esta validación
    // comparaba contra `existente.fechaCaptura`/`horaCaptura`, que es
    // únicamente la ESTIMACIÓN inicial capturada al crear el
    // procedimiento (antes de que existiera ningún interviniente) --
    // no la hora real y precisa de la lectura de derechos de cada
    // persona, que se registra después, individualmente (ver
    // demora.util.ts). Si la estimación inicial quedó más tarde que la
    // hora real de captura de la persona (por ejemplo, un funcionario
    // que crea el procedimiento con una hora aproximada y luego
    // registra la hora exacta más temprano), cualquier puesta a
    // disposición posterior a la hora REAL, pero anterior a la
    // ESTIMACIÓN, se rechazaba por error como "anterior a la captura".
    // Se corrige usando obtenerCapturaMasAntigua(), el mismo criterio
    // ya usado correctamente en actuaciones-procedimiento.service.ts y
    // en todosLosBloquesCompletos() de este mismo archivo.
    const capturados = await this.prisma.capturado.findMany({
      where: { procedimientoId: id },
      select: { fechaCaptura: true, horaCaptura: true },
    });
    const capturaMasAntigua = obtenerCapturaMasAntigua(existente, capturados);

    // Adenda 2026-08-04: la puesta a disposición también puede llegar
    // por aquí (PATCH /procedimientos/:id, desde el formulario de
    // disposición del Bloque 5), así que la validación de orden de
    // fechas se repite aquí — antes solo se comprobaba al guardar
    // Actuaciones, y se podía guardar una disposición anterior a la
    // captura sin que nada lo detectara si nunca se volvía a tocar el
    // Bloque 5. Ver demora.util.ts.
    const fechaDisposicionNueva =
      dto.fechaDisposicion !== undefined
        ? dto.fechaDisposicion
          ? new Date(dto.fechaDisposicion)
          : null
        : existente.fechaDisposicion;
    const horaDisposicionNueva =
      dto.horaDisposicion !== undefined ? dto.horaDisposicion : existente.horaDisposicion;

    validarOrdenFechas({
      fechaCaptura: capturaMasAntigua.fechaCaptura,
      horaCaptura: capturaMasAntigua.horaCaptura,
      fechaDisposicion: fechaDisposicionNueva,
      horaDisposicion: horaDisposicionNueva,
    });

    const actualizado = await this.prisma.procedimiento.update({
      where: { id: existente.id },
      data: dto,
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: 'Modificar',
      tablaAfectada: 'procedimientos',
      registroAfectado: actualizado.id,
      descripcionEvento: `Actualización del procedimiento ${actualizado.numeroInterno ?? actualizado.id}`,
      procedimientoId: actualizado.id,
      numeroInterno: actualizado.numeroInterno ?? undefined,
    });

    return actualizado;
  }

  /**
   * RT-006 / AT-005: eliminación lógica, nunca física.
   * RI-005: no puede eliminarse un procedimiento con documentos generados.
   * Adenda 2026-08-08: un ADMINISTRADOR puede eliminar el procedimiento
   * de cualquier funcionario (mismo bypass de propiedad), pero la
   * restricción de RI-005 (no eliminar si ya generó documentos) aplica
   * igual, incluso para administradores -- se preserva el registro
   * oficial ya emitido.
   */
  async remove(id: string, usuarioId: string, correoUsuario: string, rol?: string) {
    const existente = await this.findOne(id, usuarioId, rol);

    const documentosGenerados = await this.prisma.documentoGenerado.count({
      where: { procedimientoId: existente.id },
    });

    if (documentosGenerados > 0) {
      throw new BadRequestException(
        'No se puede eliminar un procedimiento que ya tiene documentos generados (RI-005).',
      );
    }

    const eliminado = await this.prisma.procedimiento.update({
      where: { id: existente.id },
      data: { activo: false, eliminadoEn: new Date() },
    });

    await this.auditoria.registrar({
      usuario: correoUsuario,
      accion: 'Eliminar',
      tablaAfectada: 'procedimientos',
      registroAfectado: eliminado.id,
      descripcionEvento: `Eliminación lógica del procedimiento ${eliminado.numeroInterno ?? eliminado.id}`,
      procedimientoId: eliminado.id,
      numeroInterno: eliminado.numeroInterno ?? undefined,
    });

    return eliminado;
  }

  private verificarPropiedad(
    procedimiento: { usuarioId: string },
    usuarioId: string,
    rol?: string,
  ) {
    if (rol !== 'ADMINISTRADOR' && procedimiento.usuarioId !== usuarioId) {
      throw new ForbiddenException(
        'No tiene autorización para acceder a este procedimiento.',
      );
    }
  }

  /**
   * Panel de administración: lista PAGINADA de todos los procedimientos
   * (de cualquier funcionario), con búsqueda opcional por número
   * interno, para poder ubicar uno puntual y exonerarlo del pago.
   */
  async listarTodosAdmin(busqueda?: string, pagina = 1, porPagina = 10) {
    const where = {
      activo: true,
      ...(busqueda ? { numeroInterno: { contains: busqueda, mode: 'insensitive' as const } } : {}),
    };

    const [datos, total] = await Promise.all([
      this.prisma.procedimiento.findMany({
        where,
        select: {
          id: true,
          numeroInterno: true,
          tipoProcedimiento: true,
          estado: true,
          exoneradoPago: true,
          edicionDesbloqueada: true,
          fechaCreacion: true,
          usuario: { select: { nombres: true, apellidos: true, correo: true } },
          pago: { select: { estadoPago: true } },
        },
        orderBy: { fechaCreacion: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.procedimiento.count({ where }),
    ]);

    return { datos, total, pagina, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) };
  }

  /**
   * Adenda 2026-08-06: permite a un administrador exonerar (o revertir
   * la exoneración de) un procedimiento puntual del requisito de pago
   * para generar documentos. Decisión del usuario: sin motivo
   * obligatorio, queda igual registrado en auditoría.
   */
  async exonerarPago(id: string, exonerado: boolean, correoAdministrador: string) {
    const procedimiento = await this.prisma.procedimiento.findUnique({ where: { id } });
    if (!procedimiento || !procedimiento.activo) {
      throw new NotFoundException('Procedimiento no encontrado');
    }

    const actualizado = await this.prisma.procedimiento.update({
      where: { id },
      data: { exoneradoPago: exonerado },
    });

    await this.auditoria.registrar({
      usuario: correoAdministrador,
      accion: 'Modificar',
      tablaAfectada: 'procedimientos',
      registroAfectado: id,
      descripcionEvento: `${exonerado ? 'Exoneración' : 'Reversión de exoneración'} de pago para el procedimiento ${procedimiento.numeroInterno ?? id}`,
      procedimientoId: id,
      numeroInterno: procedimiento.numeroInterno ?? undefined,
    });

    return actualizado;
  }

  /**
   * Adenda 2026-08-13: un administrador puede desbloquear puntualmente
   * la edición y regeneración de documentos de un procedimiento ya
   * congelado (ver ProcedimientoAccesoService.verificarNoBloqueado y
   * DocumentosService.verificarDocumentoNoGeneradoAntes) -- necesario
   * cuando hace falta corregir o completar información para que los
   * documentos queden completos. Interruptor manual, mismo criterio que
   * exonerarPago.
   */
  async cambiarDesbloqueoEdicion(id: string, desbloqueada: boolean, correoAdministrador: string) {
    const procedimiento = await this.prisma.procedimiento.findUnique({ where: { id } });
    if (!procedimiento || !procedimiento.activo) {
      throw new NotFoundException('Procedimiento no encontrado');
    }

    const actualizado = await this.prisma.procedimiento.update({
      where: { id },
      data: { edicionDesbloqueada: desbloqueada },
    });

    await this.auditoria.registrar({
      usuario: correoAdministrador,
      accion: 'Modificar',
      tablaAfectada: 'procedimientos',
      registroAfectado: id,
      descripcionEvento: `${desbloqueada ? 'Desbloqueo' : 'Rebloqueo'} de edición y regeneración de documentos para el procedimiento ${procedimiento.numeroInterno ?? id}`,
      procedimientoId: id,
      numeroInterno: procedimiento.numeroInterno ?? undefined,
    });

    return actualizado;
  }
}
