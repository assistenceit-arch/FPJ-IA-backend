import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { RegistrarPublicoDto } from './dto/registrar-publico.dto';
import { CorreoService } from '../correo/correo.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import * as bcrypt from 'bcrypt';

const HORAS_VALIDEZ_TOKEN = 24;
// Adenda 2026-08-24: constantes de seguridad definidas con el usuario.
const MAX_INTENTOS_FALLIDOS_LOGIN = 5;
const HORAS_VALIDEZ_TOKEN_RECUPERACION = 1;

@Injectable()
export class UsuariosService {
  constructor(
    private prisma: PrismaService,
    private readonly correo: CorreoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Creación por un administrador (panel de administración). Queda
   * verificada de inmediato -- ya hay un administrador vouching por la
   * cuenta, no necesita confirmar el correo.
   */
  async crear(createUsuarioDto: CreateUsuarioDto) {
    const existente = await this.buscarPorCorreo(createUsuarioDto.correo);
    if (existente) {
      throw new ConflictException('Ya existe un usuario con ese correo.');
    }

    const passwordHash = await bcrypt.hash(
      createUsuarioDto.password,
      10,
    );

    return this.prisma.usuario.create({
      data: {
        nombres: createUsuarioDto.nombres,
        apellidos: createUsuarioDto.apellidos,
        identificacion: createUsuarioDto.identificacion,
        correo: createUsuarioDto.correo,
        telefono: createUsuarioDto.telefono,
        password: passwordHash,
        rol: createUsuarioDto.rol,
        correoVerificado: true,
      },
    });
  }

  /**
   * Adenda 2026-08-06: registro autónomo desde la pantalla de login. El
   * rol siempre queda en FUNCIONARIO (nunca se acepta del cliente) y la
   * cuenta queda inactiva para iniciar sesión hasta que se verifique el
   * correo mediante el enlace enviado.
   */
  async registrarPublico(dto: RegistrarPublicoDto) {
    const existente = await this.buscarPorCorreo(dto.correo);
    if (existente) {
      throw new ConflictException('Ya existe una cuenta con ese correo.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const token = crypto.randomUUID();
    const expira = new Date(Date.now() + HORAS_VALIDEZ_TOKEN * 60 * 60 * 1000);

    const usuario = await this.prisma.usuario.create({
      data: {
        nombres: dto.nombres,
        correo: dto.correo,
        telefono: dto.telefono,
        password: passwordHash,
        rol: 'FUNCIONARIO',
        correoVerificado: false,
        tokenVerificacion: token,
        tokenVerificacionExpira: expira,
      },
    });

    await this.correo.enviarVerificacion(usuario.correo, usuario.nombres, token);

    return { correo: usuario.correo };
  }

  /**
   * Confirma el correo a partir del token enviado por email. El token
   * vence a las 24 horas (HORAS_VALIDEZ_TOKEN); pasado ese tiempo hay que
   * volver a registrarse (no hay reenvío automático por ahora).
   */
  async verificarCorreo(token: string) {
    if (!token) {
      throw new BadRequestException('Falta el token de verificación.');
    }

    const usuario = await this.prisma.usuario.findUnique({ where: { tokenVerificacion: token } });
    if (!usuario) {
      throw new BadRequestException('El enlace de verificación no es válido.');
    }
    if (usuario.correoVerificado) {
      return { mensaje: 'Este correo ya estaba verificado.' };
    }
    if (!usuario.tokenVerificacionExpira || usuario.tokenVerificacionExpira < new Date()) {
      throw new BadRequestException(
        'El enlace de verificación venció. Vuelve a registrarte para recibir uno nuevo.',
      );
    }

    // Adenda 2026-08-06: ya no se limpia tokenVerificacion aquí. Antes,
    // una segunda visita al mismo enlace (React Strict Mode en
    // desarrollo lo dispara dos veces; en producción algunos clientes de
    // correo "previsualizan" los enlaces automáticamente y los consumen
    // antes de que la persona haga clic de verdad) encontraba el token
    // ya nulo y caía en "enlace no válido" en vez de en la respuesta
    // amigable de arriba ("ya estaba verificado"). El campo
    // correoVerificado es suficiente por sí solo para no volver a
    // verificar dos veces.
    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        correoVerificado: true,
      },
    });

    return { mensaje: 'Correo verificado correctamente.' };
  }

  async buscarPorCorreo(correo: string) {
    return this.prisma.usuario.findUnique({
      where: {
        correo,
      },
    });
  }

  async buscarPorId(id: string) {
    return this.prisma.usuario.findUnique({
      where: {
        id,
      },
    });
  }

  /**
   * Panel de administración: lista paginada de todos los usuarios del
   * sistema, para gestionar roles y bloqueo/desbloqueo de acceso.
   */
  async listarTodos(pagina = 1, porPagina = 10) {
    const where = { eliminado: false };
    const [datos, total] = await Promise.all([
      this.prisma.usuario.findMany({
        where,
        select: {
          id: true,
          nombres: true,
          apellidos: true,
          identificacion: true,
          correo: true,
          telefono: true,
          rol: true,
          activo: true,
          correoVerificado: true,
          bloqueadoPorIntentos: true,
          createdAt: true,
        },
        orderBy: { nombres: 'asc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.usuario.count({ where }),
    ]);

    return { datos, total, pagina, totalPaginas: Math.max(1, Math.ceil(total / porPagina)) };
  }

  /**
   * Adenda 2026-08-06: no se permite dejar el sistema sin ningún
   * administrador activo -- si el usuario objetivo es el único
   * ADMINISTRADOR activo y se le intenta quitar el rol, se rechaza.
   */
  async cambiarRol(id: string, nuevoRol: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    if (usuario.rol === 'ADMINISTRADOR' && nuevoRol !== 'ADMINISTRADOR') {
      await this.exigirNoEsUltimoAdministrador(id);
    }

    return this.prisma.usuario.update({
      where: { id },
      data: { rol: nuevoRol },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        correo: true,
        rol: true,
        activo: true,
      },
    });
  }

  /**
   * Bloquea o desbloquea el acceso de un usuario (uso irregular de la
   * aplicación, Adenda 2026-08-06). Misma protección que cambiarRol: no
   * se puede dejar el sistema sin ningún administrador activo.
   */
  async cambiarEstado(id: string, activo: boolean) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    if (usuario.rol === 'ADMINISTRADOR' && !activo) {
      await this.exigirNoEsUltimoAdministrador(id);
    }

    return this.prisma.usuario.update({
      where: { id },
      data: { activo },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        correo: true,
        rol: true,
        activo: true,
      },
    });
  }

  /**
   * RT-006/AT-005: eliminación lógica, nunca física -- igual que
   * Procedimiento. No se toca `activo` (bloqueo), son conceptos
   * separados; un usuario eliminado simplemente deja de aparecer en el
   * listado y no puede iniciar sesión (ver AuthService.validarUsuario).
   * Misma protección que cambiarRol/cambiarEstado: no se puede dejar el
   * sistema sin ningún administrador activo.
   */
  async eliminar(id: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    if (usuario.eliminado) {
      return usuario;
    }

    if (usuario.rol === 'ADMINISTRADOR' && usuario.activo) {
      await this.exigirNoEsUltimoAdministrador(id);
    }

    return this.prisma.usuario.update({
      where: { id },
      data: { eliminado: true, eliminadoEn: new Date() },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        correo: true,
        rol: true,
        eliminado: true,
      },
    });
  }

  /**
   * Adenda 2026-08-27: eliminación de la propia cuenta (autoservicio),
   * a solicitud del usuario -- distinto de eliminar() (esa la usa un
   * administrador sobre un tercero, y no pide motivo). Reutiliza la
   * misma protección de "no dejar el sistema sin ningún administrador
   * activo", y además deja registrado el motivo que el propio
   * funcionario escribió.
   */
  async eliminarPropiaCuenta(id: string, motivo: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    if (usuario.eliminado) {
      return { mensaje: 'Tu cuenta ya estaba eliminada.' };
    }

    if (usuario.rol === 'ADMINISTRADOR' && usuario.activo) {
      await this.exigirNoEsUltimoAdministrador(id);
    }

    await this.prisma.usuario.update({
      where: { id },
      data: { eliminado: true, eliminadoEn: new Date(), motivoEliminacion: motivo },
    });

    await this.auditoria.registrar({
      usuario: usuario.correo,
      accion: 'Eliminar',
      tablaAfectada: 'usuarios',
      registroAfectado: id,
      descripcionEvento: `El usuario eliminó su propia cuenta. Motivo: ${motivo}`,
    });

    return { mensaje: 'Tu cuenta ha sido eliminada.' };
  }

  private async exigirNoEsUltimoAdministrador(idExcluido: string) {
    const totalAdministradores = await this.prisma.usuario.count({
      where: { rol: 'ADMINISTRADOR', activo: true, id: { not: idExcluido } },
    });
    if (totalAdministradores < 1) {
      throw new BadRequestException(
        'No se puede dejar el sistema sin ningún administrador activo.',
      );
    }
  }

  // ── Adenda 2026-08-24: bloqueo por intentos fallidos de login ──

  /**
   * Suma un intento fallido. Al llegar a MAX_INTENTOS_FALLIDOS_LOGIN,
   * bloquea la cuenta (bloqueadoPorIntentos = true) -- deliberadamente
   * separado de `activo`, que representa un bloqueo manual por un
   * administrador. Se cuenta por cuenta (correo), no por IP, a
   * solicitud del usuario.
   */
  async registrarIntentoFallido(id: string) {
    const usuario = await this.prisma.usuario.update({
      where: { id },
      data: { intentosFallidosLogin: { increment: 1 } },
      select: { intentosFallidosLogin: true },
    });

    if (usuario.intentosFallidosLogin >= MAX_INTENTOS_FALLIDOS_LOGIN) {
      await this.prisma.usuario.update({
        where: { id },
        data: { bloqueadoPorIntentos: true },
      });
    }

    return MAX_INTENTOS_FALLIDOS_LOGIN - usuario.intentosFallidosLogin;
  }

  async reiniciarIntentosFallidos(id: string) {
    await this.prisma.usuario.update({
      where: { id },
      data: { intentosFallidosLogin: 0 },
    });
  }

  /**
   * Desbloqueo manual por un administrador (panel de administración) --
   * distinto de cambiarEstado (activo), que es para uso irregular.
   */
  async desbloquearPorIntentos(id: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    return this.prisma.usuario.update({
      where: { id },
      data: { bloqueadoPorIntentos: false, intentosFallidosLogin: 0 },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        correo: true,
        rol: true,
        bloqueadoPorIntentos: true,
      },
    });
  }

  // ── Adenda 2026-08-24: segundo factor de autenticación por correo ──

  async guardarCodigo2FA(id: string, codigo: string, expira: Date) {
    await this.prisma.usuario.update({
      where: { id },
      data: { codigo2FA: codigo, codigo2FAExpira: expira },
    });
  }

  async limpiarCodigo2FA(id: string) {
    await this.prisma.usuario.update({
      where: { id },
      data: { codigo2FA: null, codigo2FAExpira: null },
    });
  }

  // ── Adenda 2026-08-24: recuperación de contraseña ──

  /**
   * Genera el token de recuperación y envía el correo. Siempre responde
   * con éxito genérico desde el controlador (AuthController), exista o
   * no la cuenta -- no se debe revelar qué correos están registrados.
   */
  async solicitarRecuperacion(correoDestino: string) {
    const usuario = await this.buscarPorCorreo(correoDestino);
    if (!usuario || usuario.eliminado) {
      return; // silencioso a propósito -- ver nota arriba.
    }

    const token = crypto.randomUUID();
    const expira = new Date(Date.now() + HORAS_VALIDEZ_TOKEN_RECUPERACION * 60 * 60 * 1000);

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { tokenRecuperacion: token, tokenRecuperacionExpira: expira },
    });

    await this.correo.enviarRecuperacion(usuario.correo, usuario.nombres, token);
  }

  /**
   * Restablece la contraseña a partir del token recibido por correo.
   * También desbloquea la cuenta si estaba bloqueada por intentos
   * fallidos -- demostrar que se puede restablecer la contraseña
   * (acceso al correo registrado) es suficiente prueba de que es el
   * dueño legítimo de la cuenta. NO revierte un bloqueo manual por un
   * administrador (`activo`), que exige juicio humano.
   */
  async restablecerPassword(token: string, nuevaPassword: string) {
    if (!token) {
      throw new BadRequestException('Falta el token de recuperación.');
    }

    const usuario = await this.prisma.usuario.findUnique({ where: { tokenRecuperacion: token } });
    if (!usuario) {
      throw new BadRequestException('El enlace de recuperación no es válido.');
    }
    if (!usuario.tokenRecuperacionExpira || usuario.tokenRecuperacionExpira < new Date()) {
      throw new BadRequestException(
        'El enlace de recuperación venció. Solicita uno nuevo.',
      );
    }

    const passwordHash = await bcrypt.hash(nuevaPassword, 10);

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        password: passwordHash,
        tokenRecuperacion: null,
        tokenRecuperacionExpira: null,
        bloqueadoPorIntentos: false,
        intentosFallidosLogin: 0,
        // Corrección 2026-09-03: invalida cualquier sesión activa
        // emitida antes de este momento (ver JwtStrategy) -- si
        // alguien más tenía una sesión robada abierta, deja de
        // funcionar de inmediato en cuanto se restablece la
        // contraseña, sin esperar a que venza por sí sola.
        passwordCambiadaEn: new Date(),
      },
    });

    return { mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
  }
}
