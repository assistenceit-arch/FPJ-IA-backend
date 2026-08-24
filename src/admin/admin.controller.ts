import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ProcedimientosService } from '../procedimientos/procedimientos.service';
import { PagosService } from '../pagos/pagos.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ExonerarPagoDto } from './dto/exonerar-pago.dto';
import { DesbloqueoEdicionDto } from './dto/desbloqueo-edicion.dto';
import { CambiarRolDto } from './dto/cambiar-rol.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

// Todas las rutas de este controlador son exclusivas de administrador —
// el guard de roles se aplica a nivel de clase, no hace falta repetirlo
// en cada método.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRADOR')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly procedimientosService: ProcedimientosService,
    private readonly pagosService: PagosService,
    private readonly usuariosService: UsuariosService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  // ── Procedimientos / exoneración de pago ──

  @Get('procedimientos')
  listarProcedimientos(
    @Query('busqueda') busqueda?: string,
    @Query('pagina') pagina?: string,
  ) {
    return this.procedimientosService.listarTodosAdmin(busqueda, Number(pagina) || 1, 10);
  }

  @Patch('procedimientos/:id/exoneracion')
  exonerarPago(
    @Param('id') id: string,
    @Body() dto: ExonerarPagoDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.procedimientosService.exonerarPago(id, dto.exonerado, usuario.correo);
  }

  // Adenda 2026-08-13: desbloqueo puntual de edición y regeneración de
  // documentos para un procedimiento ya congelado.
  @Patch('procedimientos/:id/desbloqueo-edicion')
  cambiarDesbloqueoEdicion(
    @Param('id') id: string,
    @Body() dto: DesbloqueoEdicionDto,
    @CurrentUser() usuario: JwtPayload,
  ) {
    return this.procedimientosService.cambiarDesbloqueoEdicion(id, dto.desbloqueada, usuario.correo);
  }

  // RT-006/RI-005: eliminación lógica; el servicio ya rechaza si el
  // procedimiento tiene documentos generados.
  @Delete('procedimientos/:id')
  eliminarProcedimiento(@Param('id') id: string, @CurrentUser() usuario: JwtPayload) {
    return this.procedimientosService.remove(id, usuario.sub, usuario.correo, usuario.rol);
  }

  // ── Pagos ──

  @Get('pagos/pendientes')
  listarPagosPendientes() {
    return this.pagosService.listarPendientesAdmin();
  }

  // ── Usuarios / roles / bloqueo ──

  @Get('usuarios')
  listarUsuarios(@Query('pagina') pagina?: string) {
    return this.usuariosService.listarTodos(Number(pagina) || 1, 10);
  }

  @Patch('usuarios/:id/rol')
  cambiarRol(@Param('id') id: string, @Body() dto: CambiarRolDto) {
    return this.usuariosService.cambiarRol(id, dto.rol);
  }

  @Patch('usuarios/:id/estado')
  cambiarEstado(@Param('id') id: string, @Body() dto: CambiarEstadoDto) {
    return this.usuariosService.cambiarEstado(id, dto.activo);
  }

  // RT-006/AT-005: eliminación lógica; el servicio ya protege que no
  // quede el sistema sin ningún administrador activo.
  @Delete('usuarios/:id')
  eliminarUsuario(@Param('id') id: string) {
    return this.usuariosService.eliminar(id);
  }

  // ── Auditoría ──
  // Adenda 2026-08-24: antes solo se podía consultar con SQL directo a
  // la base de datos. `busqueda` filtra por coincidencia parcial contra
  // el registro afectado, el usuario, o la descripción del evento.
  @Get('auditoria')
  listarAuditoria(@Query('busqueda') busqueda?: string, @Query('pagina') pagina?: string) {
    return this.auditoriaService.listarPaginado(busqueda, Number(pagina) || 1, 20);
  }
}
