import {
  Body,
  Controller,
  Post,
  Get,
  Query,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ThrottlerPorCuentaGuard } from './guards/throttler-por-cuenta.guard';
import { AuthService } from './auth.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { RegistrarPublicoDto } from '../usuarios/dto/registrar-publico.dto';
import { EliminarCuentaDto } from '../usuarios/dto/eliminar-cuenta.dto';
import { JwtAuthGuard } from './guards/jwt-auth/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtPayload } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { Verificar2FADto } from './dto/verificar-2fa.dto';
import { OlvidePasswordDto } from './dto/olvide-password.dto';
import { RestablecerPasswordDto } from './dto/restablecer-password.dto';

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
  // Corrección 2026-08-27 (auditoría de seguridad): límite propio y más
  // estricto que el general de la aplicación (20/60s) -- login ya
  // tiene su propio bloqueo por intentos fallidos sobre la CUENTA (5
  // intentos), pero eso no protege contra un bot probando muchas
  // cuentas distintas desde la misma dirección IP.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseGuards(ThrottlerPorCuentaGuard)
  @Post('login')
  async login(@Body() body: LoginDto) {
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
  // Corrección 2026-08-27 (auditoría de seguridad): el código de 6
  // dígitos tiene 1.000.000 de combinaciones posibles -- sin límite de
  // intentos, un bot podría intentar adivinarlo dentro de la ventana
  // de 10 minutos en que es válido. Límite acorde a esa misma ventana.
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @UseGuards(ThrottlerPorCuentaGuard)
  @Post('verificar-2fa')
  async verificar2FA(@Body() body: Verificar2FADto) {
    return this.authService.verificarCodigo2FA(body.correo, body.codigo);
  }

  // Adenda 2026-08-06: registro autónomo desde la pantalla de login,
  // sin necesidad de que un administrador cree la cuenta.
  // Corrección 2026-08-27 (auditoría de seguridad): sin esto, un bot
  // podría crear cuentas de forma masiva sin ningún límite.
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @UseGuards(ThrottlerPorCuentaGuard)
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
  // Corrección 2026-08-27 (auditoría de seguridad): sin esto, un bot
  // podría hacer que el sistema envíe correos de recuperación sin
  // límite hacia cualquier dirección, real o inventada.
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @UseGuards(ThrottlerPorCuentaGuard)
  @Post('olvide-password')
  async olvidePassword(@Body() body: OlvidePasswordDto) {
    await this.usuariosService.solicitarRecuperacion(body.correo);
    return {
      mensaje: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.',
    };
  }

  @Post('restablecer-password')
  async restablecerPassword(@Body() body: RestablecerPasswordDto) {
    return this.usuariosService.restablecerPassword(body.token, body.nuevaPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('perfil')
  perfil() {
    return {
      mensaje: 'Acceso autorizado',
    };
  }

  // Adenda 2026-08-27: eliminar la propia cuenta, a solicitud del
  // usuario -- el id NUNCA se recibe del cliente, siempre sale del
  // token (@CurrentUser), para que nadie pueda eliminar la cuenta de
  // otra persona manipulando la petición.
  @UseGuards(JwtAuthGuard)
  @Delete('mi-cuenta')
  async eliminarMiCuenta(
    @Body() dto: EliminarCuentaDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.usuariosService.eliminarPropiaCuenta(usuario.sub, dto.motivo);
  }
}