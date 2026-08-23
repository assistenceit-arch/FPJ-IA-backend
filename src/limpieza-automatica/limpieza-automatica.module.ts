import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { LimpiezaAutomaticaService } from './limpieza-automatica.service';

@Module({
  imports: [PrismaModule, AuditoriaModule],
  providers: [LimpiezaAutomaticaService],
})
export class LimpiezaAutomaticaModule {}
