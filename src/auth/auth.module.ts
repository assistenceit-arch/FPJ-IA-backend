import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt/jwt.strategy';

import { UsuariosModule } from '../usuarios/usuarios.module';
import { StrategiesModule } from './strategies/strategies.module';
import { CorreoModule } from '../correo/correo.module';

@Module({
  imports: [
    UsuariosModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fpj_ia_secret',
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