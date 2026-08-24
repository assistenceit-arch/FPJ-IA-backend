import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsuariosService } from '../usuarios/usuarios.service';
import { CorreoService } from '../correo/correo.service';
import * as bcrypt from 'bcrypt';

// Adenda 2026-08-24: segundo factor de autenticación por correo,
// obligatorio para todos los funcionarios.
const MINUTOS_VALIDEZ_CODIGO_2FA = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
    private readonly correo: CorreoService,
  ) {}

  /**
   * Primer paso del login (usuario/contraseña). Ya NO emite el token --
   * eso ocurre en verificarCodigo2FA, tras el segundo factor. Adenda
   * 2026-08-24: bloqueo por intentos fallidos (5, contados por cuenta,
   * no por IP) antes de comparar la contraseña -- si ya está bloqueado,
   * no tiene sentido seguir intentando ni sumar más intentos.
   */
  async validarUsuario(
    correo: string,
    password: string,
  ) {
    const usuario = await this.usuariosService.buscarPorCorreo(correo);

    if (!usuario) {
      throw new UnauthorizedException(
        'Correo o contraseña incorrectos',
      );
    }

    if (usuario.bloqueadoPorIntentos) {
      throw new UnauthorizedException(
        'Tu cuenta fue bloqueada automáticamente por múltiples intentos fallidos de inicio de sesión. Contacta a un administrador para desbloquearla, o restablece tu contraseña.',
      );
    }

    const passwordValido = await bcrypt.compare(
      password,
      usuario.password,
    );

    if (!passwordValido) {
      const restantes = await this.usuariosService.registrarIntentoFallido(usuario.id);
      if (restantes <= 0) {
        throw new UnauthorizedException(
          'Tu cuenta fue bloqueada automáticamente por múltiples intentos fallidos de inicio de sesión. Contacta a un administrador para desbloquearla, o restablece tu contraseña.',
        );
      }
      throw new UnauthorizedException(
        `Correo o contraseña incorrectos. Te quedan ${restantes} intento${restantes === 1 ? '' : 's'} antes de que tu cuenta se bloquee.`,
      );
    }

    // Adenda 2026-08-06: bloqueo de acceso por uso irregular (panel de
    // administración) y verificación de correo del registro autónomo.
    // Se comprueban DESPUÉS de validar la contraseña para no revelar si
    // una cuenta existe/está bloqueada a alguien que no la conoce.
    if (usuario.eliminado) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    if (!usuario.activo) {
      throw new UnauthorizedException(
        'Tu cuenta ha sido bloqueada. Contacta a un administrador.',
      );
    }
    if (!usuario.correoVerificado) {
      throw new UnauthorizedException(
        'Debes verificar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.',
      );
    }

    // Login correcto: reinicia el contador de intentos fallidos.
    await this.usuariosService.reiniciarIntentosFallidos(usuario.id);

    return usuario;
  }

  /**
   * Adenda 2026-08-24: segundo paso del login. Genera y envía el código
   * de 6 dígitos por correo -- el token JWT todavía no se emite.
   */
  async solicitarCodigo2FA(usuario: { id: string; correo: string; nombres: string }) {
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expira = new Date(Date.now() + MINUTOS_VALIDEZ_CODIGO_2FA * 60 * 1000);

    await this.usuariosService.guardarCodigo2FA(usuario.id, codigo, expira);
    await this.correo.enviarCodigo2FA(usuario.correo, usuario.nombres, codigo);
  }

  /**
   * Adenda 2026-08-24: valida el código de 6 dígitos y, si es correcto,
   * emite el token JWT -- este es el único punto donde realmente se
   * completa el inicio de sesión.
   */
  async verificarCodigo2FA(correo: string, codigo: string) {
    const usuario = await this.usuariosService.buscarPorCorreo(correo);

    if (!usuario || !usuario.codigo2FA || !usuario.codigo2FAExpira) {
      throw new UnauthorizedException(
        'No hay un código pendiente para esta cuenta. Vuelve a iniciar sesión.',
      );
    }
    if (usuario.codigo2FAExpira < new Date()) {
      await this.usuariosService.limpiarCodigo2FA(usuario.id);
      throw new UnauthorizedException(
        'El código venció. Vuelve a iniciar sesión para recibir uno nuevo.',
      );
    }
    if (usuario.codigo2FA !== codigo) {
      throw new UnauthorizedException('Código incorrecto.');
    }

    await this.usuariosService.limpiarCodigo2FA(usuario.id);
    return this.login(usuario);
  }

  async login(usuario: any) {
    const payload = {
      sub: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol,
    };

    return {
      access_token: this.jwtService.sign(payload),
      usuario: {
        id: usuario.id,
        nombres: usuario.nombres,
        apellidos: usuario.apellidos,
        correo: usuario.correo,
        rol: usuario.rol,
      },
    };
  }
}
