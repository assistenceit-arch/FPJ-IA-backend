import { Module } from '@nestjs/common';
import { PagosService } from './pagos.service';
import { PagosController } from './pagos.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ProcedimientosModule } from '../procedimientos/procedimientos.module';
import { ConfiguracionPagosModule } from '../configuracion-pagos/configuracion-pagos.module';
import { VerificacionPagoIaService } from './verificacion-pago-ia.service';

@Module({
  imports: [PrismaModule, AuditoriaModule, ProcedimientosModule, ConfiguracionPagosModule],
  controllers: [PagosController],
  providers: [PagosService, VerificacionPagoIaService],
  exports: [PagosService],
})
export class PagosModule {}
