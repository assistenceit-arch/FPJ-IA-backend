import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Adenda 2026-09-07, a solicitud del usuario: verificación automática
 * de comprobantes de pago mediante IA -- misma cuenta de Anthropic ya
 * usada para la narrativa del FPJ-5 (src/narrativa/narrativa.service.ts),
 * mismo patrón de inicialización.
 *
 * Principio de diseño central, deliberado: la IA nunca decide sola si
 * un pago "está bien" en términos generales -- solo REPORTA hechos
 * puntuales y verificables sobre lo que ve en la imagen (el valor, la
 * fecha, el destino, si se ve auténtico). La decisión final de si eso
 * es suficiente para aprobar automáticamente la toma el código de este
 * mismo servicio, comparando esos hechos contra los criterios exactos
 * -- así la lógica de aprobación queda determinística y auditable, en
 * vez de depender de un juicio agregado y menos transparente del
 * modelo.
 */

export interface CriteriosVerificacionPago {
  valorEsperado: number;
  destinosValidos: string[]; // números/cuentas de los métodos de pago habilitados
  fechaMinima: Date; // no debe ser anterior a la fecha de captura del procedimiento
}

export interface ResultadoVerificacionIA {
  aprobadoAutomaticamente: boolean;
  analisis: string;
}

const HERRAMIENTA_VEREDICTO = {
  name: 'reportar_hallazgos_comprobante',
  description:
    'Reporta los hallazgos objetivos al examinar un comprobante de pago -- no decide si aprobar, solo reporta hechos verificables.',
  input_schema: {
    type: 'object' as const,
    properties: {
      valorDetectado: {
        type: ['number', 'null'],
        description: 'El valor exacto de la transacción que aparece en el comprobante, en pesos colombianos. null si no es legible.',
      },
      fechaDetectada: {
        type: ['string', 'null'],
        description: 'La fecha de la transacción tal como aparece en el comprobante, formato AAAA-MM-DD. null si no es legible.',
      },
      destinoDetectado: {
        type: ['string', 'null'],
        description: 'El número de cuenta, Nequi, Llave, o nombre del destinatario/beneficiario que aparece en el comprobante. null si no es legible.',
      },
      coincideValor: {
        type: 'boolean',
        description: 'true si el valor detectado es igual o mayor al valor esperado indicado.',
      },
      coincideDestino: {
        type: 'boolean',
        description: 'true si el destino detectado coincide con alguno de los destinos válidos indicados.',
      },
      fechaEsPlausible: {
        type: 'boolean',
        description: 'true si la fecha detectada es igual o posterior a la fecha mínima indicada, y no es una fecha futura.',
      },
      pareceAutentico: {
        type: 'boolean',
        description: 'true si el comprobante se ve genuino -- sin señales evidentes de edición, manipulación digital, capturas de pantalla recortadas de forma sospechosa, o inconsistencias visuales.',
      },
      observaciones: {
        type: 'string',
        description: 'Explicación breve (1-3 frases) de cualquier discrepancia, duda, o -- si todo coincide -- una confirmación breve de que el comprobante es coherente.',
      },
    },
    required: [
      'valorDetectado',
      'fechaDetectada',
      'destinoDetectado',
      'coincideValor',
      'coincideDestino',
      'fechaEsPlausible',
      'pareceAutentico',
      'observaciones',
    ],
  },
};

@Injectable()
export class VerificacionPagoIaService {
  private readonly logger = new Logger(VerificacionPagoIaService.name);
  private readonly cliente: Anthropic;
  private readonly modelo: string;

  constructor(private readonly config: ConfigService) {
    this.cliente = new Anthropic({
      apiKey: this.config.get<string>('anthropicApiKey'),
    });
    this.modelo = this.config.get<string>('anthropicModel') ?? 'claude-sonnet-5';
  }

  /**
   * Nunca lanza una excepción -- si la verificación por IA falla por
   * cualquier motivo (red, límite de la API, respuesta inesperada), el
   * pago simplemente queda Pendiente para revisión humana, tal como
   * funcionaba antes de esta funcionalidad. Un funcionario nunca debe
   * quedar bloqueado por un problema de la IA al registrar su pago.
   */
  async verificar(
    imagenBuffer: Buffer,
    tipoMime: string,
    criterios: CriteriosVerificacionPago,
  ): Promise<ResultadoVerificacionIA> {
    try {
      // Los PDF no se pueden enviar como bloque "image" -- se envían
      // como documento, el modelo los procesa igual de bien.
      const esPdf = tipoMime === 'application/pdf';
      const bloqueArchivo = esPdf
        ? {
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: imagenBuffer.toString('base64') },
          }
        : {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: tipoMime as 'image/jpeg' | 'image/png' | 'image/webp',
              data: imagenBuffer.toString('base64'),
            },
          };

      const respuesta = await this.cliente.messages.create({
        model: this.modelo,
        max_tokens: 1024,
        system:
          'Eres un asistente que examina comprobantes de pago (transferencias, Nequi, Bre-B/Llave) para una plataforma de gestión documental policial en Colombia. Tu única tarea es reportar hechos objetivos y verificables sobre lo que ves en la imagen, usando la herramienta proporcionada. No decides si el pago se aprueba -- solo reportas lo que observas, con honestidad, incluyendo cuándo algo no es legible o genera duda.',
        tools: [HERRAMIENTA_VEREDICTO],
        tool_choice: { type: 'tool', name: HERRAMIENTA_VEREDICTO.name },
        messages: [
          {
            role: 'user',
            content: [
              bloqueArchivo,
              {
                type: 'text',
                text: [
                  'Examina este comprobante de pago y reporta tus hallazgos.',
                  '',
                  `Valor esperado (el comprobante debe mostrar este valor o uno mayor): $${criterios.valorEsperado.toLocaleString('es-CO')} COP`,
                  `Destinos válidos (el comprobante debe mostrar el pago hacia alguno de estos): ${criterios.destinosValidos.join(', ') || 'ninguno configurado'}`,
                  `Fecha mínima válida (el comprobante no debe ser anterior a esta fecha): ${criterios.fechaMinima.toISOString().slice(0, 10)}`,
                ].join('\n'),
              },
            ],
          },
        ],
      });

      const bloqueHerramienta = respuesta.content.find((b) => b.type === 'tool_use');
      if (!bloqueHerramienta || bloqueHerramienta.type !== 'tool_use') {
        throw new Error('La respuesta de la IA no incluyó el veredicto esperado.');
      }

      const hallazgos = bloqueHerramienta.input as {
        valorDetectado: number | null;
        fechaDetectada: string | null;
        destinoDetectado: string | null;
        coincideValor: boolean;
        coincideDestino: boolean;
        fechaEsPlausible: boolean;
        pareceAutentico: boolean;
        observaciones: string;
      };

      // La decisión final es del código, no de la IA -- ver
      // comentario al inicio del archivo.
      const aprobadoAutomaticamente =
        hallazgos.coincideValor &&
        hallazgos.coincideDestino &&
        hallazgos.fechaEsPlausible &&
        hallazgos.pareceAutentico;

      const analisis = [
        `Valor detectado: ${hallazgos.valorDetectado !== null ? `$${hallazgos.valorDetectado.toLocaleString('es-CO')}` : 'no legible'} (${hallazgos.coincideValor ? 'coincide' : 'NO coincide'})`,
        `Fecha detectada: ${hallazgos.fechaDetectada ?? 'no legible'} (${hallazgos.fechaEsPlausible ? 'coherente' : 'NO coherente'})`,
        `Destino detectado: ${hallazgos.destinoDetectado ?? 'no legible'} (${hallazgos.coincideDestino ? 'coincide' : 'NO coincide'})`,
        `Apariencia: ${hallazgos.pareceAutentico ? 'sin señales de manipulación' : 'genera dudas de autenticidad'}`,
        `Observaciones de la IA: ${hallazgos.observaciones}`,
      ].join('\n');

      return { aprobadoAutomaticamente, analisis };
    } catch (error) {
      this.logger.warn(
        `No se pudo completar la verificación automática por IA -- el pago queda Pendiente para revisión humana. Detalle: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        aprobadoAutomaticamente: false,
        analisis:
          'No fue posible completar la verificación automática (error técnico) -- requiere revisión manual de un administrador.',
      };
    }
  }
}
