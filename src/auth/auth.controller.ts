import {
  Body,
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { RegistrarPublicoDto } from '../usuarios/dto/registrar-publico.dto';
import { JwtAuthGuard } from './guards/jwt-auth/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usuariosService: UsuariosService,
  ) {}

  // Adenda 2026-08-24: primer paso del login (usuario/contraseña). Ya
  // NO emite el token -- si las credenciales son correctas, envía el
  // código de segundo factor por correo y responde indicando que hace
  // falta verificarlo. El token real se emite en /auth/verificar-2fa.
  @Post('login')
  async login(
    @Body() body: {
      correo: string;
      password: string;
    },
  ) {
    const usuario = await this.authService.validarUsuario(
      body.correo,
      body.password,
    );

    await this.authService.solicitarCodigo2FA(usuario);

    return {
      requiere2FA: true,
      correo: usuario.correo,
      mensaje: 'Te enviamos un código de verificación a tu correo.',
    };
  }

  // Adenda 2026-08-24: segundo paso del login -- aquí sí se emite el
  // token JWT si el código es correcto.
  @Post('verificar-2fa')
  async verificar2FA(@Body() body: { correo: string; codigo: string }) {
    return this.authService.verificarCodigo2FA(body.correo, body.codigo);
  }

  // Adenda 2026-08-06: registro autónomo desde la pantalla de login,
  // sin necesidad de que un administrador cree la cuenta.
  @Post('registro')
  async registro(@Body() dto: RegistrarPublicoDto) {
    await this.usuariosService.registrarPublico(dto);
    return {
      mensaje: 'Cuenta creada. Revisa tu correo para verificarla antes de iniciar sesión.',
    };
  }

  @Get('verificar-correo')
  async verificarCorreo(@Query('token') token: string) {
    return this.usuariosService.verificarCorreo(token);
  }

  // Adenda 2026-08-24: recuperación de contraseña. Siempre responde con
  // el mismo mensaje genérico, exista o no la cuenta -- no se debe
  // revelar qué correos están registrados en el sistema.
  @Post('olvide-password')
  async olvidePassword(@Body() body: { correo: string }) {
    await this.usuariosService.solicitarRecuperacion(body.correo);
    return {
      mensaje: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.',
    };
  }

  @Post('restablecer-password')
  async restablecerPassword(@Body() body: { token: string; nuevaPassword: string }) {
    return this.usuariosService.restablecerPassword(body.token, body.nuevaPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('perfil')
  perfil() {
    return {
      mensaje: 'Acceso autorizado',
    };
  }
}