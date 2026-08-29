import { Module } from '@nestjs/common';
import { DocumentosService } from './documentos.service';
import { DocumentosController } from './documentos.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ProcedimientosModule } from '../procedimientos/procedimientos.module';
import { NarrativaModule } from '../narrativa/narrativa.module';
import { CorreoModule } from '../correo/correo.module';
import { UsuariosModule } from '../usuarios/usuarios.module';

@Module({
  imports: [
    PrismaModule,
    AuditoriaModule,
    ProcedimientosModule,
    NarrativaModule,
    CorreoModule,
    UsuariosModule,
  ],
  controllers: [DocumentosController],
  providers: [DocumentosService],
  // Adenda 2026-08-29: exportado para que TrabajosGeneracionModule (la
  // cola de generación en segundo plano) pueda reutilizar exactamente
  // la misma lógica de generación que ya existía, sin duplicarla.
  exports: [DocumentosService],
})
export class DocumentosModule {}
