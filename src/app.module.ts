import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import configuration from './config/app.config';
import { environmentValidationSchema } from './config/environment.validation';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProcedimientosModule } from './procedimientos/procedimientos.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { FuncionarioActuanteModule } from './funcionario-actuante/funcionario-actuante.module';
import { CompaneroPatrullaModule } from './companero-patrulla/companero-patrulla.module';
import { LugarProcedimientoModule } from './lugar-procedimiento/lugar-procedimiento.module';
import { CapturadosModule } from './capturados/capturados.module';
import { TestigosModule } from './testigos/testigos.module';
import { VictimasModule } from './victimas/victimas.module';
import { ElementosIncautadosModule } from './elementos-incautados/elementos-incautados.module';
import { ActuacionesProcedimientoModule } from './actuaciones-procedimiento/actuaciones-procedimiento.module';
import { ConfiguracionPagosModule } from './configuracion-pagos/configuracion-pagos.module';
import { PagosModule } from './pagos/pagos.module';
import { DocumentosModule } from './documentos/documentos.module';
import { AdminModule } from './admin/admin.module';
import { LimpiezaAutomaticaModule } from './limpieza-automatica/limpieza-automatica.module';
// Fases 0-3 completas. Fase 4 en curso: motor de generación de documentos
// Word. Primer documento: Acta de Incautación de Elementos (por
// interviniente). Pendientes: FPJ-5, FPJ-6, FPJ-7, FPJ-8.

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: environmentValidationSchema,
    }),
    // Adenda 2026-08-23: habilita @Cron() en toda la aplicación --
    // necesario para el borrado automático de procedimientos por
    // política de retención (ver LimpiezaAutomaticaModule).
    ScheduleModule.forRoot(),
    AuthModule,
    UsuariosModule,
    PrismaModule,
    ProcedimientosModule,
    AuditoriaModule,
    FuncionarioActuanteModule,
    CompaneroPatrullaModule,
    LugarProcedimientoModule,
    CapturadosModule,
    TestigosModule,
    VictimasModule,
    ElementosIncautadosModule,
    ActuacionesProcedimientoModule,
    ConfiguracionPagosModule,
    PagosModule,
    DocumentosModule,
    AdminModule,
    LimpiezaAutomaticaModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}