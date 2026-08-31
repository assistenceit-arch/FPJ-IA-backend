import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

// Adenda 2026-08-24: el nombre del usuario se insertaba directamente en
// el HTML del correo (`${nombre}`) sin escapar -- si alguien registrara
// su nombre con contenido tipo `<script>` o etiquetas HTML, se
// renderizaría tal cual en el cliente de correo de quien lo reciba (a
// ellos mismos, en el caso de estos correos, pero es el mismo patrón
// que se reutilizaría si en el futuro se envía un correo mencionando a
// un tercero). Se aplica al insertar cualquier valor que provenga de un
// campo de texto libre del usuario.
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Envío de correos transaccionales, vía la API de Resend (HTTPS, puerto
 * 443).
 *
 * Corrección 2026-08-31: antes se usaba SMTP directo (nodemailer,
 * cualquier proveedor genérico) -- pero DigitalOcean, como la mayoría
 * de proveedores de nube, bloquea por defecto los puertos SMTP (25,
 * 465, 587) en todos sus servidores para prevenir spam y abuso de su
 * plataforma. Cualquier intento de conexión SMTP directa desde el
 * servidor fallaba con "Connection timeout" (ETIMEDOUT), sin importar
 * qué tan bien estuvieran las credenciales -- no era un problema de
 * configuración, era una política de la plataforma, y no es exclusivo
 * de DigitalOcean (AWS, GCP y Azure tienen restricciones similares).
 * Resend evita esto por completo: la aplicación llama a su API por
 * HTTPS (nunca abre una conexión SMTP saliente), y es el propio Resend
 * quien se encarga de la entrega real del correo.
 *
 * Si no hay Resend configurado (típicamente en desarrollo), el
 * enlace/código se deja en el log del servidor en vez de fallar, para
 * poder seguir probando el flujo sin credenciales reales.
 */
@Injectable()
export class CorreoService {
  private readonly logger = new Logger(CorreoService.name);
  private cliente: Resend | null = null;

  constructor() {
    if (process.env.RESEND_API_KEY) {
      this.cliente = new Resend(process.env.RESEND_API_KEY);
    }
  }

  private remitente(): string {
    return process.env.RESEND_FROM ?? 'PJ | Gestión Digital <onboarding@resend.dev>';
  }

  async enviarVerificacion(destino: string, nombre: string, token: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    const enlace = `${frontendUrl}/verificar-correo?token=${token}`;

    if (!this.cliente) {
      this.logger.warn(
        `Resend no configurado — enlace de verificación para ${destino}: ${enlace}`,
      );
      return;
    }

    await this.cliente.emails.send({
      from: this.remitente(),
      to: destino,
      subject: 'Verifica tu correo — PJ | Gestión Digital',
      html: `
        <p>Hola ${escaparHtml(nombre)},</p>
        <p>Gracias por crear tu cuenta en PJ | Gestión Digital. Confirma tu correo institucional haciendo clic en el siguiente enlace:</p>
        <p><a href="${enlace}">${enlace}</a></p>
        <p>Este enlace vence en 24 horas. Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
      `,
    });
  }

  // Adenda 2026-08-24: segundo factor de autenticación -- código de 6
  // dígitos, obligatorio para todos los funcionarios en cada inicio de
  // sesión.
  async enviarCodigo2FA(destino: string, nombre: string, codigo: string): Promise<void> {
    if (!this.cliente) {
      this.logger.warn(`Resend no configurado — código de verificación para ${destino}: ${codigo}`);
      return;
    }

    await this.cliente.emails.send({
      from: this.remitente(),
      to: destino,
      subject: 'Tu código de verificación — PJ | Gestión Digital',
      html: `
        <p>Hola ${escaparHtml(nombre)},</p>
        <p>Tu código de verificación para iniciar sesión es:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${codigo}</p>
        <p>Este código vence en 10 minutos. Si no intentaste iniciar sesión, cambia tu contraseña de inmediato y contacta a un administrador.</p>
      `,
    });
  }

  // Adenda 2026-08-24: recuperación de contraseña -- mismo patrón que
  // enviarVerificacion, enlace vence en 1 hora.
  async enviarRecuperacion(destino: string, nombre: string, token: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    const enlace = `${frontendUrl}/restablecer-password?token=${token}`;

    if (!this.cliente) {
      this.logger.warn(`Resend no configurado — enlace de recuperación para ${destino}: ${enlace}`);
      return;
    }

    await this.cliente.emails.send({
      from: this.remitente(),
      to: destino,
      subject: 'Recupera tu contraseña — PJ | Gestión Digital',
      html: `
        <p>Hola ${escaparHtml(nombre)},</p>
        <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el siguiente enlace para crear una nueva:</p>
        <p><a href="${enlace}">${enlace}</a></p>
        <p>Este enlace vence en 1 hora. Si no solicitaste este cambio, puedes ignorar este mensaje — tu contraseña actual sigue funcionando.</p>
      `,
    });
  }

  // Adenda 2026-08-26: envío de un documento generado por correo, a
  // solicitud del usuario -- alternativa a la descarga directa, útil
  // sobre todo desde el celular. Sin Resend configurado, no hay a dónde
  // "dejar el enlace en el log" como con los otros correos (aquí el
  // contenido es el archivo adjunto en sí) -- se lanza un error claro
  // en su lugar, para no fingir un envío que nunca ocurrió.
  async enviarDocumento(
    destino: string,
    nombreFuncionario: string,
    nombreArchivo: string,
    contenido: Buffer,
  ): Promise<void> {
    if (!this.cliente) {
      throw new Error(
        'El envío de documentos por correo no está disponible: el servidor no tiene Resend configurado.',
      );
    }

    await this.cliente.emails.send({
      from: this.remitente(),
      to: destino,
      subject: `Documento generado — PJ | Gestión Digital`,
      html: `
        <p>Hola ${escaparHtml(nombreFuncionario)},</p>
        <p>Adjunto encontrarás el documento que solicitaste enviar por correo: <strong>${escaparHtml(nombreArchivo)}</strong>.</p>
        <p style="color:#666; font-size: 13px;">Recuerda que este documento puede contener información sensible. Verifica que el destinatario sea el correcto antes de compartirlo con terceros.</p>
      `,
      attachments: [
        {
          filename: nombreArchivo,
          content: contenido,
        },
      ],
    });
  }
}
