import { Module } from '@nestjs/common';
import { TrabajosGeneracionService } from './trabajos-generacion.service';
import { TrabajosGeneracionController } from './trabajos-generacion.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProcedimientosModule } from '../procedimientos/procedimientos.module';
import { DocumentosModule } from '../documentos/documentos.module';
import { UsuariosModule } from '../usuarios/usuarios.module';

@Module({
  imports: [PrismaModule, ProcedimientosModule, DocumentosModule, UsuariosModule],
  controllers: [TrabajosGeneracionController],
  providers: [TrabajosGeneracionService],
  // Adenda 2026-08-29: exportado para que src/worker.ts (el proceso
  // trabajador, aparte de la aplicación HTTP) pueda usar el mismo
  // servicio sin duplicar nada.
  exports: [TrabajosGeneracionService],
})
export class TrabajosGeneracionModule {}
