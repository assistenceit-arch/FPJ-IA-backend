import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt/jwt.strategy';

import { UsuariosModule } from '../usuarios/usuarios.module';
import { StrategiesModule } from './strategies/strategies.module';
import { CorreoModule } from '../correo/correo.module';
import { obtenerJwtSecret } from '../config/jwt-secret.util';

@Module({
  imports: [
    UsuariosModule,
    JwtModule.register({
      // Corrección 2026-08-27: auditoría de seguridad -- existía un
      // respaldo fijo ('fpj_ia_secret', visible en el código, que
      // estuvo en un repositorio público en algún momento) para cuando
      // JWT_SECRET no estuviera configurada. Si eso llegara a pasar en
      // producción, el sistema firmaría todas las sesiones con esa
      // palabra conocida -- cualquiera que la conociera podría
      // fabricar una sesión de administrador válida. JWT_SECRET ya es
      // obligatoria en environment.validation.ts (Joi), pero esa
      // validación no protege código que lee `process.env` de forma
      // directa como este -- se quita el respaldo aquí también, para
      // que si alguna vez esa validación no corriera (ej. un contexto
      // de arranque distinto), el sistema truene con un error claro en
      // vez de arrancar de forma insegura en silencio.
      secret: obtenerJwtSecret(),
      signOptions: {
        expiresIn: '8h',
      },
    }),
    StrategiesModule,
    CorreoModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
  ],
})
export class AuthModule {}