import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { UsuariosService } from '../../../usuarios/usuarios.service';
import { obtenerJwtSecret } from '../../../config/jwt-secret.util';
import { NOMBRE_COOKIE_SESION } from '../../../config/cookie-sesion.util';

// Corrección 2026-09-03 (auditoría de seguridad de la PWA): el token
// ahora vive en una cookie HttpOnly (ver cookie-sesion.util.ts), no en
// el header Authorization -- este extractor personalizado lo lee
// directamente de req.cookies (requiere cookie-parser, registrado en
// main.ts). Se mantiene también la extracción por header Bearer como
// respaldo, por si en el futuro algún cliente que no sea el navegador
// (una integración externa, por ejemplo) necesita autenticarse sin
// cookies.
function extraerDeCookie(req: Request): string | null {
  return req?.cookies?.[NOMBRE_COOKIE_SESION] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usuariosService: UsuariosService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extraerDeCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      // Corrección 2026-08-27: mismo hallazgo que en auth.module.ts --
      // se quita el respaldo fijo inseguro ('fpj_ia_secret').
      secretOrKey: obtenerJwtSecret(),
    });
  }

  /**
   * Corrección 2026-08-27: antes esta función confiaba ciegamente en lo
   * que decía el token, sin volver a consultar la base de datos -- eso
   * significaba que un token emitido seguía funcionando durante toda su
   * vigencia (8 horas) sin importar qué pasara con la cuenta después:
   * un administrador podía bloquear o eliminar a un usuario, o el
   * propio usuario podía eliminar su cuenta (nueva función, a solicitud
   * del usuario), y el acceso seguía activo hasta que el token
   * venciera por sí solo. Ahora se revisa el estado real en cada
   * petición autenticada -- costo aceptable (una consulta simple por
   * petición) para una aplicación de este tamaño, a cambio de que
   * cualquier bloqueo o eliminación surta efecto de inmediato.
   *
   * Corrección 2026-09-03 (auditoría de seguridad, segunda ronda):
   * mismo principio, aplicado a un cambio de contraseña -- si alguien
   * robó una sesión activa, cambiar la contraseña no la invalidaba,
   * seguía funcionando hasta por 8 horas más. `payload.iat` (el
   * estándar JWT para "emitido en", en segundos desde 1970) se compara
   * contra passwordCambiadaEn -- cualquier token emitido ANTES del
   * último cambio de contraseña queda rechazado.
   */
  async validate(payload: { sub: string; correo: string; rol: string; iat?: number }) {
    const usuario = await this.usuariosService.buscarPorId(payload.sub);

    if (!usuario || usuario.eliminado) {
      throw new UnauthorizedException('Esta cuenta ya no existe.');
    }
    if (!usuario.activo) {
      throw new UnauthorizedException('Tu cuenta ha sido bloqueada. Contacta a un administrador.');
    }
    if (usuario.bloqueadoPorIntentos) {
      throw new UnauthorizedException(
        'Tu cuenta fue bloqueada automáticamente por múltiples intentos fallidos de inicio de sesión.',
      );
    }
    if (usuario.passwordCambiadaEn && payload.iat) {
      const emitidoEn = new Date(payload.iat * 1000);
      if (emitidoEn < usuario.passwordCambiadaEn) {
        throw new UnauthorizedException(
          'Tu contraseña cambió después de que iniciaste esta sesión. Vuelve a iniciar sesión.',
        );
      }
    }

    return payload;
  }
}
