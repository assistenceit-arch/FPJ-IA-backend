import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { ProcedimientosModule } from '../procedimientos/procedimientos.module';
import { PagosModule } from '../pagos/pagos.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { EstadisticasModule } from '../estadisticas/estadisticas.module';

/**
 * Agrupa las acciones exclusivas de administrador que cruzan varios
 * módulos (procedimientos, pagos, usuarios, auditoría, estadísticas)
 * bajo un único prefijo /admin, en vez de esparcir rutas
 * administrativas dentro de cada módulo. Toda la lógica de negocio
 * real vive en los servicios de cada módulo; este módulo solo los
 * compone.
 */
@Module({
  imports: [ProcedimientosModule, PagosModule, UsuariosModule, AuditoriaModule, EstadisticasModule],
  controllers: [AdminController],
})
export class AdminModule {}
